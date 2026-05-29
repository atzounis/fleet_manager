from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from fleet.models import (
    Cohort,
    CrashReport,
    Device,
    FirmwareRelease,
    FleetEvent,
    HeartbeatMetric,
    OtaDeployment,
    OtaDeploymentTarget,
    TelemetryThresholdConfig,
)


class CohortSerializer(serializers.ModelSerializer):
    device_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Cohort
        fields = ("id", "name", "description", "device_count", "created_at")


class DeviceSerializer(serializers.ModelSerializer):
    cohort_name = serializers.CharField(source="cohort.name", read_only=True, default=None)
    is_online = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    seconds_since_last_seen = serializers.SerializerMethodField()
    offline_after_seconds = serializers.SerializerMethodField()

    class Meta:
        model = Device
        fields = (
            "device_id",
            "label",
            "hw_version",
            "fw_version",
            "cohort",
            "cohort_name",
            "last_seen_at",
            "is_online",
            "status",
            "seconds_since_last_seen",
            "offline_after_seconds",
            "created_at",
        )

    def get_is_online(self, obj: Device) -> bool:
        if not obj.last_seen_at:
            return False
        stale_cutoff = timezone.now() - timezone.timedelta(
            seconds=settings.HEARTBEAT_ONLINE_WINDOW_SECONDS
        )
        return obj.last_seen_at >= stale_cutoff

    def get_status(self, obj: Device) -> str:
        return "online" if self.get_is_online(obj) else "offline"

    def get_seconds_since_last_seen(self, obj: Device) -> int | None:
        if not obj.last_seen_at:
            return None
        return max(0, int((timezone.now() - obj.last_seen_at).total_seconds()))

    def get_offline_after_seconds(self, obj: Device) -> int:
        return settings.HEARTBEAT_ONLINE_WINDOW_SECONDS


class HeartbeatSerializer(serializers.ModelSerializer):
    class Meta:
        model = HeartbeatMetric
        fields = (
            "id",
            "recorded_at",
            "heap_free_bytes",
            "heap_min_free_bytes",
            "wifi_rssi_dbm",
            "battery_voltage_mv",
            "cpu_temperature_c",
        )


class CrashReportSerializer(serializers.ModelSerializer):
    device_id = serializers.CharField(source="device.device_id", read_only=True)

    class Meta:
        model = CrashReport
        fields = (
            "id",
            "device_id",
            "received_at",
            "panic_reason",
            "status",
            "symbolicated_trace",
            "error_message",
        )


class FirmwareReleaseSerializer(serializers.ModelSerializer):
    cohort_name = serializers.CharField(source="cohort.name", read_only=True)

    class Meta:
        model = FirmwareRelease
        fields = (
            "id",
            "version",
            "hw_version",
            "cohort",
            "cohort_name",
            "s3_key",
            "file_size_bytes",
            "is_active",
            "created_at",
        )


class TelemetryThresholdConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = TelemetryThresholdConfig
        fields = (
            "hw_version",
            "heap_free_bytes_min",
            "wifi_rssi_dbm_min",
            "battery_voltage_mv_min",
            "cpu_temperature_c_max",
            "updated_at",
        )
        read_only_fields = ("updated_at",)


class FleetEventSerializer(serializers.ModelSerializer):
    device_id = serializers.CharField(source="device.device_id", read_only=True)

    class Meta:
        model = FleetEvent
        fields = (
            "id",
            "event_at",
            "event_type",
            "severity",
            "summary",
            "details",
            "device_id",
        )


class OtaDeploymentTargetSerializer(serializers.ModelSerializer):
    device_id = serializers.CharField(source="device.device_id", read_only=True)

    class Meta:
        model = OtaDeploymentTarget
        fields = (
            "device_id",
            "status",
            "last_error",
            "offered_at",
            "completed_at",
            "updated_at",
        )


class OtaDeploymentSerializer(serializers.ModelSerializer):
    firmware_version = serializers.CharField(source="firmware.version", read_only=True)
    firmware_hw_version = serializers.CharField(source="firmware.hw_version", read_only=True)
    targets = OtaDeploymentTargetSerializer(many=True, read_only=True)

    class Meta:
        model = OtaDeployment
        fields = (
            "id",
            "status",
            "firmware",
            "firmware_version",
            "firmware_hw_version",
            "created_at",
            "updated_at",
            "targets",
        )
