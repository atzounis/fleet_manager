import re

from django.utils import timezone

from fleet.models import Cohort, Device

from .device_tokens import set_device_token, verify_device_token

HEX_MAC = re.compile(r"^[0-9a-f]{12}$")


def normalize_device_id(raw: str) -> str:
    cleaned = raw.strip().lower().replace(":", "").replace("-", "")
    if not HEX_MAC.match(cleaned):
        raise ValueError("Invalid device ID: expected 12 lowercase hex characters.")
    return cleaned


def touch_device_metadata(
    device: Device,
    *,
    hw_version: str | None = None,
    fw_version: str | None = None,
) -> Device:
    updates: dict[str, str] = {}
    if hw_version and device.hw_version != hw_version:
        updates["hw_version"] = hw_version
    if fw_version and device.fw_version != fw_version:
        updates["fw_version"] = fw_version
    if updates:
        for key, value in updates.items():
            setattr(device, key, value)
        device.save(update_fields=[*updates.keys(), "updated_at"])
    device.last_seen_at = timezone.now()
    device.save(update_fields=["last_seen_at", "updated_at"])
    return device


def register_device(
    device_id: str,
    *,
    label: str = "",
    hw_version: str = "1.0",
    fw_version: str = "0.0.0",
    cohort: Cohort | None = None,
) -> tuple[Device, str]:
    normalized = normalize_device_id(device_id)
    if Device.objects.filter(device_id=normalized).exists():
        raise ValueError(f"Device {normalized} is already registered.")

    device = Device.objects.create(
        device_id=normalized,
        label=label.strip(),
        hw_version=hw_version or "1.0",
        fw_version=fw_version or "0.0.0",
        cohort=cohort,
    )
    token = set_device_token(device)
    return device, token


def rotate_device_token(device: Device) -> str:
    return set_device_token(device)


def delete_device(device: Device) -> None:
    """Remove device and cascade telemetry, events, commands, and OTA targets."""
    device.delete()


class AgentAuthError(Exception):
    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.message = message
        self.status = status


def authenticate_agent_request(
    request,
    *,
    require_device_id: bool = True,
) -> Device:
    device_id_raw = request.headers.get("X-Device-Id") or request.GET.get("device_id")
    if require_device_id and not device_id_raw:
        raise AgentAuthError("Missing X-Device-Id header.", status=400)

    token = (request.headers.get("X-Device-Token") or "").strip()
    if not token:
        raise AgentAuthError("Missing X-Device-Token header.", status=401)

    try:
        device_id = normalize_device_id(device_id_raw or "")
    except ValueError as exc:
        raise AgentAuthError(str(exc), status=400) from exc

    device = Device.objects.filter(device_id=device_id).first()
    if device is None:
        raise AgentAuthError("Device not registered.", status=403)
    if not device.token_hash:
        raise AgentAuthError(
            "Device has no provisioned token. Issue a token from the dashboard.",
            status=403,
        )
    if not verify_device_token(device, token):
        raise AgentAuthError("Invalid X-Device-Token.", status=401)

    return device
