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
