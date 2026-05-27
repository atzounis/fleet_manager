from rest_framework import serializers

from fleet.models import Cohort, CrashReport, Device, FirmwareRelease, HeartbeatMetric


class CohortSerializer(serializers.ModelSerializer):
    device_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Cohort
        fields = ("id", "name", "description", "device_count", "created_at")


class DeviceSerializer(serializers.ModelSerializer):
    cohort_name = serializers.CharField(source="cohort.name", read_only=True, default=None)

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
            "created_at",
        )


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
