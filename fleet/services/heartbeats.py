import json
from datetime import datetime

import redis
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from fleet.models import Device, HeartbeatMetric
from fleet.services.events import record_threshold_breaches
from fleet.services.thresholds import current_thresholds


def get_redis() -> redis.Redis:
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


def enqueue_heartbeat(device_id: str, payload: dict) -> None:
    client = get_redis()
    client.xadd(
        settings.HEARTBEAT_REDIS_STREAM,
        {
            "device_id": device_id,
            "payload": json.dumps(payload),
        },
    )


def flush_heartbeats_to_db(batch_size: int = 500) -> int:
    client = get_redis()
    stream = settings.HEARTBEAT_REDIS_STREAM
    entries = client.xrange(stream, count=batch_size)
    if not entries:
        return 0

    metrics: list[HeartbeatMetric] = []
    ids_to_delete: list[str] = []

    for entry_id, fields in entries:
        ids_to_delete.append(entry_id)
        device_id = fields["device_id"]
        payload = json.loads(fields["payload"])
        recorded_at = _parse_recorded_at(payload.get("ts"))
        metrics.append(
            HeartbeatMetric(
                device_id=device_id,
                recorded_at=recorded_at,
                heap_free_bytes=int(payload["heap_free"]),
                heap_min_free_bytes=int(payload["heap_min_free"]),
                wifi_rssi_dbm=int(payload["wifi_rssi"]),
                battery_voltage_mv=_optional_int(payload.get("battery_mv")),
                cpu_temperature_c=_optional_cpu_temp(payload.get("cpu_temp_c")),
            )
        )

    HeartbeatMetric.objects.bulk_create(metrics, ignore_conflicts=True)
    devices_by_id = Device.objects.in_bulk({m.device_id for m in metrics}, field_name="device_id")
    for metric in metrics:
        device = devices_by_id.get(metric.device_id)
        if device is None:
            continue
        record_threshold_breaches(
            device=device,
            heartbeat=metric,
            thresholds=current_thresholds(device.hw_version),
        )
    Device.objects.filter(device_id__in={m.device_id for m in metrics}).update(
        last_seen_at=timezone.now()
    )
    client.xdel(stream, *ids_to_delete)
    return len(metrics)


def _parse_recorded_at(value) -> datetime:
    if value is None:
        return timezone.now()
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if isinstance(value, str):
        parsed = parse_datetime(value)
        if parsed:
            return parsed if timezone.is_aware(parsed) else timezone.make_aware(parsed)
    return timezone.now()


def _optional_int(value) -> int | None:
    if value is None:
        return None
    return int(value)


def _optional_cpu_temp(value) -> int | None:
    if value is None:
        return None
    parsed = int(value)
    # Device may send sentinel values for unsupported sensors.
    if parsed <= -100 or parsed >= 200:
        return None
    return parsed
