from django.contrib import admin

from .models import (
    Cohort,
    CrashReport,
    Device,
    FirmwareRelease,
    FleetEvent,
    HeartbeatMetric,
    TelemetryThresholdConfig,
)


@admin.register(Cohort)
class CohortAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = (
        "device_id",
        "label",
        "hw_version",
        "fw_version",
        "cohort",
        "last_seen_at",
    )
    list_filter = ("cohort", "hw_version")
    search_fields = ("device_id", "label")


@admin.register(FirmwareRelease)
class FirmwareReleaseAdmin(admin.ModelAdmin):
    list_display = ("version", "hw_version", "cohort", "is_active", "created_at")
    list_filter = ("cohort", "hw_version", "is_active")


@admin.register(HeartbeatMetric)
class HeartbeatMetricAdmin(admin.ModelAdmin):
    list_display = (
        "device",
        "recorded_at",
        "heap_free_bytes",
        "heap_min_free_bytes",
        "wifi_rssi_dbm",
    )
    list_filter = ("device",)


@admin.register(CrashReport)
class CrashReportAdmin(admin.ModelAdmin):
    list_display = ("device", "received_at", "status", "panic_reason")
    list_filter = ("status",)


@admin.register(TelemetryThresholdConfig)
class TelemetryThresholdConfigAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "heap_free_bytes_min",
        "wifi_rssi_dbm_min",
        "battery_voltage_mv_min",
        "cpu_temperature_c_max",
        "updated_at",
    )


@admin.register(FleetEvent)
class FleetEventAdmin(admin.ModelAdmin):
    list_display = ("event_at", "device", "event_type", "severity", "summary")
    list_filter = ("event_type", "severity")
    search_fields = ("summary", "device__device_id")
