from django.conf import settings
from django.db.models import Count, Q
from django.utils.decorators import method_decorator
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import generics
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView

from fleet.models import (
    Cohort,
    CrashReport,
    Device,
    FleetEvent,
    FirmwareRelease,
    HeartbeatMetric,
    TelemetryThresholdConfig,
)

from .serializers import (
    CohortSerializer,
    CrashReportSerializer,
    DeviceSerializer,
    FirmwareReleaseSerializer,
    FleetEventSerializer,
    HeartbeatSerializer,
    TelemetryThresholdConfigSerializer,
)


def _current_thresholds() -> dict[str, int]:
    config = TelemetryThresholdConfig.objects.order_by("-updated_at").first()
    if config:
        return {
            "heap_free_bytes_min": config.heap_free_bytes_min,
            "wifi_rssi_dbm_min": config.wifi_rssi_dbm_min,
            "battery_voltage_mv_min": config.battery_voltage_mv_min,
            "cpu_temperature_c_max": config.cpu_temperature_c_max,
        }
    return {
        "heap_free_bytes_min": settings.THRESHOLD_HEAP_FREE_BYTES_MIN,
        "wifi_rssi_dbm_min": settings.THRESHOLD_WIFI_RSSI_DBM_MIN,
        "battery_voltage_mv_min": settings.THRESHOLD_BATTERY_VOLTAGE_MV_MIN,
        "cpu_temperature_c_max": settings.THRESHOLD_CPU_TEMPERATURE_C_MAX,
    }


class FleetStatsView(APIView):
    def get(self, request):
        stale_cutoff = timezone.now() - timezone.timedelta(
            seconds=settings.HEARTBEAT_ONLINE_WINDOW_SECONDS
        )
        devices_online = Device.objects.filter(last_seen_at__gte=stale_cutoff).count()
        devices_total = Device.objects.count()
        return Response(
            {
                "devices_total": devices_total,
                "devices_online": devices_online,
                "devices_offline": devices_total - devices_online,
                "heartbeat_expected_interval_seconds": settings.HEARTBEAT_EXPECTED_INTERVAL_SECONDS,
                "heartbeat_missed_iterations": settings.HEARTBEAT_MISSED_ITERATIONS,
                "online_window_seconds": settings.HEARTBEAT_ONLINE_WINDOW_SECONDS,
                "thresholds": _current_thresholds(),
                "crashes_pending": CrashReport.objects.filter(
                    status=CrashReport.Status.PENDING
                ).count(),
                "firmware_active": FirmwareRelease.objects.filter(is_active=True).count(),
                "cohorts": Cohort.objects.count(),
            }
        )


class DeviceListView(generics.ListAPIView):
    serializer_class = DeviceSerializer

    def get_queryset(self):
        qs = Device.objects.select_related("cohort")
        cohort = self.request.query_params.get("cohort")
        if cohort:
            qs = qs.filter(cohort__name=cohort)
        search = self.request.query_params.get("q")
        if search:
            qs = qs.filter(
                Q(device_id__icontains=search) | Q(label__icontains=search)
            )
        return qs


@method_decorator(csrf_exempt, name="dispatch")
class DeviceLabelUpdateView(APIView):
    authentication_classes: list[type[SessionAuthentication]] = []

    def patch(self, request, device_id: str):
        return self._save(request, device_id)

    def post(self, request, device_id: str):
        return self._save(request, device_id)

    def _save(self, request, device_id: str):
        label = request.data.get("label")
        if not isinstance(label, str):
            return Response({"detail": "label must be a string"}, status=400)
        device = Device.objects.filter(device_id=device_id).first()
        if not device:
            return Response({"detail": "device not found"}, status=404)
        device.label = label.strip()
        device.save(update_fields=["label"])
        return Response(DeviceSerializer(device).data)


class DeviceMetricsView(generics.ListAPIView):
    serializer_class = HeartbeatSerializer

    def get_queryset(self):
        limit = min(int(self.request.query_params.get("limit", 100)), 500)
        return HeartbeatMetric.objects.filter(
            device_id=self.kwargs["device_id"]
        ).order_by("-recorded_at")[:limit]


class CrashListView(generics.ListAPIView):
    serializer_class = CrashReportSerializer
    queryset = CrashReport.objects.select_related("device").order_by("-received_at")


class EventListView(generics.ListAPIView):
    serializer_class = FleetEventSerializer

    def get_queryset(self):
        qs = FleetEvent.objects.select_related("device").order_by("-event_at")
        device_id = self.request.query_params.get("device_id")
        if device_id:
            qs = qs.filter(device_id=device_id)
        hours = self.request.query_params.get("hours")
        if hours:
            try:
                h = max(1, min(int(hours), 24 * 30))
                qs = qs.filter(event_at__gte=timezone.now() - timezone.timedelta(hours=h))
            except ValueError:
                pass
        return qs


class FirmwareListView(generics.ListCreateAPIView):
    serializer_class = FirmwareReleaseSerializer

    def get_queryset(self):
        return FirmwareRelease.objects.select_related("cohort").order_by("-created_at")


class CohortListView(generics.ListAPIView):
    serializer_class = CohortSerializer

    def get_queryset(self):
        return Cohort.objects.annotate(device_count=Count("devices")).order_by("name")


@method_decorator(csrf_exempt, name="dispatch")
class TelemetryThresholdConfigView(APIView):
    authentication_classes: list[type[SessionAuthentication]] = []

    def get(self, request):
        config = TelemetryThresholdConfig.objects.order_by("-updated_at").first()
        if not config:
            data = {
                "heap_free_bytes_min": settings.THRESHOLD_HEAP_FREE_BYTES_MIN,
                "wifi_rssi_dbm_min": settings.THRESHOLD_WIFI_RSSI_DBM_MIN,
                "battery_voltage_mv_min": settings.THRESHOLD_BATTERY_VOLTAGE_MV_MIN,
                "cpu_temperature_c_max": settings.THRESHOLD_CPU_TEMPERATURE_C_MAX,
                "updated_at": None,
            }
            return Response(data)
        return Response(TelemetryThresholdConfigSerializer(config).data)

    def put(self, request):
        return self._save(request)

    def post(self, request):
        return self._save(request)

    def _save(self, request):
        config = TelemetryThresholdConfig.objects.order_by("-updated_at").first()
        serializer = TelemetryThresholdConfigSerializer(
            instance=config, data=request.data, partial=False
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
