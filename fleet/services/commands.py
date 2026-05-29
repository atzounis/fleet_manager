from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from fleet.models import Device, DeviceCommand, FleetEvent
from fleet.services.events import create_event


def queue_device_command(device: Device, command: str) -> DeviceCommand:
    if command not in DeviceCommand.Command.values:
        raise ValueError(f"Unsupported command: {command}")

    existing = (
        DeviceCommand.objects.filter(
            device=device,
            command=command,
            status=DeviceCommand.Status.PENDING,
        )
        .order_by("-created_at")
        .first()
    )
    if existing:
        return existing

    cmd = DeviceCommand.objects.create(device=device, command=command)
    create_event(
        device=device,
        event_type=FleetEvent.EventType.REBOOT_QUEUED,
        severity=FleetEvent.Severity.INFO,
        summary="Remote reboot queued",
        details={
            "command": command,
            "command_id": cmd.pk,
        },
    )
    return cmd


def deliver_pending_command(device: Device) -> dict[str, str] | None:
    with transaction.atomic():
        cmd = (
            DeviceCommand.objects.select_for_update()
            .filter(device=device, status=DeviceCommand.Status.PENDING)
            .order_by("created_at")
            .first()
        )
        if cmd is None:
            return None
        cmd.status = DeviceCommand.Status.DELIVERED
        cmd.delivered_at = timezone.now()
        cmd.save(update_fields=["status", "delivered_at", "updated_at"])
        return {
            "command": cmd.command,
            "command_id": str(cmd.pk),
        }
