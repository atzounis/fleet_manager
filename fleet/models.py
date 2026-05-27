import re

from django.core.exceptions import ValidationError
from django.db import models

DEVICE_ID_PATTERN = re.compile(r"^[0-9a-f]{12}$")


def validate_device_id(value: str) -> None:
    if not DEVICE_ID_PATTERN.match(value):
        raise ValidationError(
            "Device ID must be a 12-character lowercase hex MAC (e.g. 240ac4a1b2c3)."
        )


class Cohort(models.Model):
    name = models.SlugField(max_length=64, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Device(models.Model):
    device_id = models.CharField(
        max_length=12,
        primary_key=True,
        validators=[validate_device_id],
        help_text="6-byte factory MAC as lowercase hex without separators.",
    )
    label = models.CharField(max_length=128, blank=True)
    hw_version = models.CharField(max_length=32, default="1.0")
    fw_version = models.CharField(max_length=32, default="0.0.0")
    cohort = models.ForeignKey(
        Cohort,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="devices",
    )
    last_seen_at = models.DateTimeField(null=True, blank=True)
    is_online_cached = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-last_seen_at", "device_id"]

    def __str__(self) -> str:
        return self.label or self.device_id


class FirmwareRelease(models.Model):
    version = models.CharField(max_length=32)
    hw_version = models.CharField(max_length=32)
    cohort = models.ForeignKey(
        Cohort,
        on_delete=models.CASCADE,
        related_name="firmware_releases",
    )
    s3_key = models.CharField(max_length=512)
    file_size_bytes = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["version", "hw_version", "cohort"],
                name="uniq_firmware_per_cohort_hw",
            )
        ]

    def __str__(self) -> str:
        return f"{self.version} ({self.hw_version}) → {self.cohort.name}"


class HeartbeatMetric(models.Model):
    device = models.ForeignKey(
        Device,
        on_delete=models.CASCADE,
        related_name="heartbeats",
    )
    recorded_at = models.DateTimeField(db_index=True)
    heap_free_bytes = models.PositiveIntegerField()
    heap_min_free_bytes = models.PositiveIntegerField()
    wifi_rssi_dbm = models.SmallIntegerField()
    battery_voltage_mv = models.PositiveSmallIntegerField(null=True, blank=True)
    battery_level_pct = models.PositiveSmallIntegerField(null=True, blank=True)
    cpu_temperature_c = models.SmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-recorded_at"]
        indexes = [
            models.Index(fields=["device", "-recorded_at"]),
        ]


class CrashReport(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SYMBOLICATING = "symbolicating", "Symbolicating"
        COMPLETE = "complete", "Complete"
        FAILED = "failed", "Failed"

    device = models.ForeignKey(
        Device,
        on_delete=models.CASCADE,
        related_name="crash_reports",
    )
    received_at = models.DateTimeField(auto_now_add=True)
    dump_s3_key = models.CharField(max_length=512)
    elf_s3_key = models.CharField(max_length=512, blank=True)
    panic_reason = models.CharField(max_length=256, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    symbolicated_trace = models.TextField(blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-received_at"]


class TelemetryThresholdConfig(models.Model):
    """Global chart threshold configuration editable from dashboard UI."""

    heap_free_bytes_min = models.PositiveIntegerField(default=50000)
    wifi_rssi_dbm_min = models.SmallIntegerField(default=-75)
    battery_voltage_mv_min = models.PositiveIntegerField(default=3600)
    cpu_temperature_c_max = models.SmallIntegerField(default=75)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Telemetry threshold config"
        verbose_name_plural = "Telemetry threshold config"


class FleetEvent(models.Model):
    class EventType(models.TextChoices):
        CRASH_REPORT = "crash_report", "Crash report"
        DEVICE_OFFLINE = "device_offline", "Device offline"
        DEVICE_ONLINE = "device_online", "Device online"
        THRESHOLD_BREACH = "threshold_breach", "Threshold breach"
        OTA_QUEUED = "ota_queued", "OTA queued"
        OTA_UPDATED = "ota_updated", "OTA updated"
        OTA_FAILED = "ota_failed", "OTA failed"
        OTA_ROLLED_BACK = "ota_rolled_back", "OTA rolled back"

    class Severity(models.TextChoices):
        INFO = "info", "Info"
        WARNING = "warning", "Warning"
        CRITICAL = "critical", "Critical"

    device = models.ForeignKey(
        Device,
        on_delete=models.CASCADE,
        related_name="events",
        null=True,
        blank=True,
    )
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    severity = models.CharField(max_length=16, choices=Severity.choices)
    summary = models.CharField(max_length=255)
    details = models.JSONField(default=dict, blank=True)
    event_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-event_at"]


class OtaDeployment(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    firmware = models.ForeignKey(
        FirmwareRelease,
        on_delete=models.CASCADE,
        related_name="ota_deployments",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


class OtaDeploymentTarget(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        OFFERED = "offered", "Offered"
        UPDATED = "updated", "Updated"
        FAILED = "failed", "Failed"
        ROLLED_BACK = "rolled_back", "Rolled back"

    deployment = models.ForeignKey(
        OtaDeployment,
        on_delete=models.CASCADE,
        related_name="targets",
    )
    device = models.ForeignKey(
        Device,
        on_delete=models.CASCADE,
        related_name="ota_targets",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    last_error = models.CharField(max_length=255, blank=True)
    offered_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["deployment", "device"],
                name="uniq_ota_target_per_deployment_device",
            )
        ]
