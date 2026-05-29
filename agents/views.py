import cbor2
from django.db import DatabaseError, OperationalError
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from fleet.models import CrashReport, FleetEvent
from fleet.models import OtaDeployment, OtaDeploymentTarget
from fleet.services.commands import deliver_pending_command
from fleet.services.devices import get_or_create_device, normalize_device_id
from fleet.services.events import create_event
from fleet.services.firmware import find_ota_release
from fleet.services.heartbeats import enqueue_heartbeat
from fleet.services.storage import StorageError, make_object_key, presign_get_url, upload_bytes
from fleet.tasks import symbolicate_crash_report


def _service_unavailable(message: str = "Service temporarily unavailable.") -> JsonResponse:
    return JsonResponse({"error": message}, status=503)


@method_decorator(csrf_exempt, name="dispatch")
class CrashReportView(View):
    """POST binary core dump from ESP32 after panic reboot."""

    def post(self, request):
        device_id_raw = request.headers.get("X-Device-Id") or request.GET.get("device_id")
        if not device_id_raw:
            return JsonResponse({"error": "Missing X-Device-Id header."}, status=400)
        try:
            device_id = normalize_device_id(device_id_raw)
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)

        dump = request.body
        if not dump:
            return JsonResponse({"error": "Empty crash dump body."}, status=400)

        hw_version = request.headers.get("X-Hw-Version", "1.0")
        fw_version = request.headers.get("X-Fw-Version", "0.0.0")
        panic_reason = request.headers.get("X-Panic-Reason", "")
        elf_s3_key = request.headers.get("X-Elf-S3-Key", "")

        try:
            device = get_or_create_device(
                device_id, hw_version=hw_version, fw_version=fw_version
            )
            dump_key = make_object_key("crashes", device_id, ".bin")
            upload_bytes(dump_key, dump, content_type="application/octet-stream")
            report = CrashReport.objects.create(
                device=device,
                dump_s3_key=dump_key,
                elf_s3_key=elf_s3_key,
                panic_reason=panic_reason[:256],
            )
            create_event(
                device=device,
                event_type=FleetEvent.EventType.CRASH_REPORT,
                severity=FleetEvent.Severity.CRITICAL,
                summary="Crash report received",
                details={
                    "panic_reason": panic_reason[:256],
                    "report_id": report.pk,
                },
            )
            symbolicate_crash_report.delay(report.pk)
        except (DatabaseError, OperationalError):
            return _service_unavailable()
        except StorageError:
            return _service_unavailable("Object storage unavailable.")

        return JsonResponse({"id": report.pk, "status": "accepted"}, status=202)


@method_decorator(csrf_exempt, name="dispatch")
class HeartbeatView(View):
    """POST CBOR telemetry: heap, RSSI, battery, and optional CPU thermals."""

    def post(self, request):
        device_id_raw = request.headers.get("X-Device-Id") or request.GET.get("device_id")
        if not device_id_raw:
            return JsonResponse({"error": "Missing X-Device-Id header."}, status=400)
        try:
            device_id = normalize_device_id(device_id_raw)
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)

        body = request.body
        if not body:
            return JsonResponse({"error": "Empty CBOR body."}, status=400)

        try:
            payload = cbor2.loads(body)
        except Exception:
            return JsonResponse({"error": "Invalid CBOR payload."}, status=400)

        required = ("heap_free", "heap_min_free", "wifi_rssi")
        missing = [k for k in required if k not in payload]
        if missing:
            return JsonResponse(
                {"error": f"Missing CBOR fields: {', '.join(missing)}"}, status=400
            )

        hw_version = request.headers.get("X-Hw-Version") or payload.get("hw_version")
        fw_version = request.headers.get("X-Fw-Version") or payload.get("fw_version")

        try:
            device = get_or_create_device(
                device_id,
                hw_version=str(hw_version) if hw_version else None,
                fw_version=str(fw_version) if fw_version else None,
            )
            enqueue_heartbeat(device_id, payload)
        except (DatabaseError, OperationalError):
            return _service_unavailable()
        except Exception:
            return _service_unavailable("Telemetry buffer unavailable.")

        response: dict[str, str] = {"status": "ok"}
        try:
            delivery = deliver_pending_command(device)
            if delivery:
                response.update(delivery)
        except (DatabaseError, OperationalError):
            return _service_unavailable()

        return JsonResponse(response)


@method_decorator(csrf_exempt, name="dispatch")
class OtaCheckView(View):
    """GET — return 302 to signed firmware URL when a newer build exists for the cohort."""

    def get(self, request):
        device_id_raw = request.headers.get("X-Device-Id") or request.GET.get("device_id")
        hw_version = request.GET.get("hw_version", "1.0")
        fw_version = request.GET.get("fw_version", "0.0.0")

        if not device_id_raw:
            return JsonResponse({"error": "Missing device_id."}, status=400)
        try:
            device_id = normalize_device_id(device_id_raw)
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)

        try:
            device = get_or_create_device(
                device_id, hw_version=hw_version, fw_version=fw_version
            )
            release = find_ota_release(device)
            if release is None:
                return HttpResponse(status=204)
            url = presign_get_url(release.s3_key)
        except (DatabaseError, OperationalError):
            return _service_unavailable()
        except StorageError:
            return _service_unavailable("Object storage unavailable.")

        response = HttpResponse(status=302)
        response["Location"] = url
        response["X-Firmware-Version"] = release.version
        return response


@method_decorator(csrf_exempt, name="dispatch")
class OtaReportView(View):
    """POST OTA outcome updates from device (updated / failed / rolled_back)."""

    def post(self, request):
        device_id_raw = request.headers.get("X-Device-Id") or request.GET.get("device_id")
        if not device_id_raw:
            return JsonResponse({"error": "Missing X-Device-Id header."}, status=400)
        try:
            device_id = normalize_device_id(device_id_raw)
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)

        payload = {}
        if request.body:
            if "application/json" in (request.headers.get("Content-Type") or ""):
                try:
                    import json

                    payload = json.loads(request.body.decode("utf-8"))
                except Exception:
                    return JsonResponse({"error": "Invalid JSON payload."}, status=400)
            else:
                try:
                    payload = cbor2.loads(request.body)
                except Exception:
                    return JsonResponse({"error": "Invalid CBOR payload."}, status=400)

        version = str(payload.get("version", "")).strip()
        status = str(payload.get("status", "")).strip()
        error = str(payload.get("error", "")).strip()[:255]
        if not version or status not in {"updated", "failed", "rolled_back"}:
            return JsonResponse(
                {"error": "version and status(updated|failed|rolled_back) are required."},
                status=400,
            )

        try:
            device = get_or_create_device(device_id)
            target = (
                OtaDeploymentTarget.objects.select_related("deployment", "deployment__firmware")
                .filter(
                    device=device,
                    deployment__firmware__version=version,
                    deployment__status__in=[
                        OtaDeployment.Status.PENDING,
                        OtaDeployment.Status.IN_PROGRESS,
                    ],
                )
                .order_by("-deployment__created_at")
                .first()
            )
            if not target:
                return JsonResponse({"status": "ignored"}, status=202)

            target.deployment.status = OtaDeployment.Status.IN_PROGRESS
            target.deployment.save(update_fields=["status", "updated_at"])
            if status == "updated":
                target.status = OtaDeploymentTarget.Status.UPDATED
                target.completed_at = timezone.now()
                target.last_error = ""
                create_event(
                    device=device,
                    event_type=FleetEvent.EventType.OTA_UPDATED,
                    severity=FleetEvent.Severity.INFO,
                    summary=f"OTA update applied: {version}",
                    details={"deployment_id": target.deployment_id, "version": version},
                )
            elif status == "rolled_back":
                target.status = OtaDeploymentTarget.Status.ROLLED_BACK
                target.completed_at = timezone.now()
                target.last_error = error or "Device rolled back to previous firmware"
                create_event(
                    device=device,
                    event_type=FleetEvent.EventType.OTA_ROLLED_BACK,
                    severity=FleetEvent.Severity.CRITICAL,
                    summary=f"OTA rolled back: {version}",
                    details={
                        "deployment_id": target.deployment_id,
                        "version": version,
                        "error": target.last_error,
                    },
                )
            else:
                target.status = OtaDeploymentTarget.Status.FAILED
                target.completed_at = timezone.now()
                target.last_error = error or "OTA update failed"
                create_event(
                    device=device,
                    event_type=FleetEvent.EventType.OTA_FAILED,
                    severity=FleetEvent.Severity.WARNING,
                    summary=f"OTA failed: {version}",
                    details={
                        "deployment_id": target.deployment_id,
                        "version": version,
                        "error": target.last_error,
                    },
                )
            target.save(update_fields=["status", "completed_at", "last_error", "updated_at"])

            remaining = target.deployment.targets.filter(
                status__in=[OtaDeploymentTarget.Status.PENDING, OtaDeploymentTarget.Status.OFFERED]
            ).exists()
            if not remaining:
                has_failures = target.deployment.targets.filter(
                    status__in=[
                        OtaDeploymentTarget.Status.FAILED,
                        OtaDeploymentTarget.Status.ROLLED_BACK,
                    ]
                ).exists()
                target.deployment.status = (
                    OtaDeployment.Status.FAILED if has_failures else OtaDeployment.Status.COMPLETED
                )
                target.deployment.save(update_fields=["status", "updated_at"])
        except (DatabaseError, OperationalError):
            return _service_unavailable()

        return JsonResponse({"status": "ok"})
