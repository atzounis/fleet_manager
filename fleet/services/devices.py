import re

from django.utils import timezone

from fleet.models import Device

HEX_MAC = re.compile(r"^[0-9a-f]{12}$")


def normalize_device_id(raw: str) -> str:
    cleaned = raw.strip().lower().replace(":", "").replace("-", "")
    if not HEX_MAC.match(cleaned):
        raise ValueError("Invalid device ID: expected 12 lowercase hex characters.")
    return cleaned


def get_or_create_device(
    device_id: str,
    *,
    hw_version: str | None = None,
    fw_version: str | None = None,
) -> Device:
    device, created = Device.objects.get_or_create(
        device_id=device_id,
        defaults={
            "hw_version": hw_version or "1.0",
            "fw_version": fw_version or "0.0.0",
        },
    )
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
