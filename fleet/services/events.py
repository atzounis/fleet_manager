from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from fleet.models import Device, FleetEvent, HeartbeatMetric, TelemetryThresholdConfig


def current_thresholds() -> dict[str, int]:
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


def create_event(
    *,
    device: Device | None,
    event_type: str,
    severity: str,
    summary: str,
    details: dict | None = None,
) -> FleetEvent:
    return FleetEvent.objects.create(
        device=device,
        event_type=event_type,
        severity=severity,
        summary=summary[:255],
        details=details or {},
    )


def record_threshold_breaches(
    *,
    device: Device,
    heartbeat: HeartbeatMetric,
    thresholds: dict[str, int],
    cooldown_minutes: int = 10,
) -> None:
    checks = [
        (
            "heap_free_bytes",
            heartbeat.heap_free_bytes,
            thresholds["heap_free_bytes_min"],
            "below",
            FleetEvent.Severity.WARNING,
        ),
        (
            "wifi_rssi_dbm",
            heartbeat.wifi_rssi_dbm,
            thresholds["wifi_rssi_dbm_min"],
            "below",
            FleetEvent.Severity.WARNING,
        ),
        (
            "battery_voltage_mv",
            heartbeat.battery_voltage_mv,
            thresholds["battery_voltage_mv_min"],
            "below",
            FleetEvent.Severity.WARNING,
        ),
        (
            "cpu_temperature_c",
            heartbeat.cpu_temperature_c,
            thresholds["cpu_temperature_c_max"],
            "above",
            FleetEvent.Severity.CRITICAL,
        ),
    ]

    cooldown_since = timezone.now() - timedelta(minutes=cooldown_minutes)

    for metric, value, threshold, direction, severity in checks:
        if value is None:
            continue
        breached = value < threshold if direction == "below" else value > threshold
        if not breached:
            continue

        summary = f"{metric} {direction} threshold"
        recent = FleetEvent.objects.filter(
            device=device,
            event_type=FleetEvent.EventType.THRESHOLD_BREACH,
            summary=summary,
            event_at__gte=cooldown_since,
        ).exists()
        if recent:
            continue

        create_event(
            device=device,
            event_type=FleetEvent.EventType.THRESHOLD_BREACH,
            severity=severity,
            summary=summary,
            details={
                "metric": metric,
                "value": value,
                "threshold": threshold,
                "direction": direction,
                "recorded_at": heartbeat.recorded_at.isoformat(),
            },
        )


def sync_connectivity_events() -> int:
    cutoff = timezone.now() - timezone.timedelta(
        seconds=settings.HEARTBEAT_ONLINE_WINDOW_SECONDS
    )
    updated = 0
    for device in Device.objects.all():
        is_online = bool(device.last_seen_at and device.last_seen_at >= cutoff)
        if device.is_online_cached == is_online:
            continue

        device.is_online_cached = is_online
        device.save(update_fields=["is_online_cached", "updated_at"])
        updated += 1

        create_event(
            device=device,
            event_type=(
                FleetEvent.EventType.DEVICE_ONLINE
                if is_online
                else FleetEvent.EventType.DEVICE_OFFLINE
            ),
            severity=FleetEvent.Severity.INFO if is_online else FleetEvent.Severity.WARNING,
            summary="Device online" if is_online else "Device offline",
            details={"last_seen_at": device.last_seen_at.isoformat() if device.last_seen_at else None},
        )
    return updated
