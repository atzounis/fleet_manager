from __future__ import annotations

from django.conf import settings

from fleet.models import TelemetryThresholdConfig

DEFAULT_HW_VERSION = "1.0"

_BUILTIN_DEFAULTS: dict[str, dict[str, int]] = {
    "1.0": {
        "heap_free_bytes_min": settings.THRESHOLD_HEAP_FREE_BYTES_MIN,
        "wifi_rssi_dbm_min": settings.THRESHOLD_WIFI_RSSI_DBM_MIN,
        "battery_voltage_mv_min": settings.THRESHOLD_BATTERY_VOLTAGE_MV_MIN,
        "cpu_temperature_c_max": settings.THRESHOLD_CPU_TEMPERATURE_C_MAX,
    },
    "8266": {
        "heap_free_bytes_min": int(
            getattr(settings, "THRESHOLD_HEAP_FREE_BYTES_MIN_8266", 35000)
        ),
        "wifi_rssi_dbm_min": settings.THRESHOLD_WIFI_RSSI_DBM_MIN,
        "battery_voltage_mv_min": settings.THRESHOLD_BATTERY_VOLTAGE_MV_MIN,
        "cpu_temperature_c_max": settings.THRESHOLD_CPU_TEMPERATURE_C_MAX,
    },
}


def normalize_hw_version(hw_version: str | None) -> str:
    cleaned = (hw_version or DEFAULT_HW_VERSION).strip()
    return cleaned or DEFAULT_HW_VERSION


def default_thresholds_for_hw(hw_version: str | None) -> dict[str, int]:
    hw = normalize_hw_version(hw_version)
    return dict(_BUILTIN_DEFAULTS.get(hw, _BUILTIN_DEFAULTS[DEFAULT_HW_VERSION]))


def current_thresholds(hw_version: str | None = None) -> dict[str, int]:
    hw = normalize_hw_version(hw_version)
    config = TelemetryThresholdConfig.objects.filter(hw_version=hw).first()
    if config:
        return {
            "heap_free_bytes_min": config.heap_free_bytes_min,
            "wifi_rssi_dbm_min": config.wifi_rssi_dbm_min,
            "battery_voltage_mv_min": config.battery_voltage_mv_min,
            "cpu_temperature_c_max": config.cpu_temperature_c_max,
        }
    return default_thresholds_for_hw(hw)
