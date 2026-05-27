import django.db.models.deletion
from django.db import migrations, models

import fleet.models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Cohort",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.SlugField(max_length=64, unique=True)),
                ("description", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="Device",
            fields=[
                (
                    "device_id",
                    models.CharField(
                        help_text="6-byte factory MAC as lowercase hex without separators.",
                        max_length=12,
                        primary_key=True,
                        serialize=False,
                        validators=[fleet.models.validate_device_id],
                    ),
                ),
                ("label", models.CharField(blank=True, max_length=128)),
                ("hw_version", models.CharField(default="1.0", max_length=32)),
                ("fw_version", models.CharField(default="0.0.0", max_length=32)),
                ("last_seen_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "cohort",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="devices",
                        to="fleet.cohort",
                    ),
                ),
            ],
            options={"ordering": ["-last_seen_at", "device_id"]},
        ),
        migrations.CreateModel(
            name="CrashReport",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("received_at", models.DateTimeField(auto_now_add=True)),
                ("dump_s3_key", models.CharField(max_length=512)),
                ("elf_s3_key", models.CharField(blank=True, max_length=512)),
                ("panic_reason", models.CharField(blank=True, max_length=256)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("symbolicating", "Symbolicating"),
                            ("complete", "Complete"),
                            ("failed", "Failed"),
                        ],
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("symbolicated_trace", models.TextField(blank=True)),
                ("error_message", models.TextField(blank=True)),
                (
                    "device",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="crash_reports",
                        to="fleet.device",
                    ),
                ),
            ],
            options={"ordering": ["-received_at"]},
        ),
        migrations.CreateModel(
            name="FirmwareRelease",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("version", models.CharField(max_length=32)),
                ("hw_version", models.CharField(max_length=32)),
                ("s3_key", models.CharField(max_length=512)),
                ("file_size_bytes", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "cohort",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="firmware_releases",
                        to="fleet.cohort",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="firmwarerelease",
            constraint=models.UniqueConstraint(
                fields=("version", "hw_version", "cohort"),
                name="uniq_firmware_per_cohort_hw",
            ),
        ),
        migrations.CreateModel(
            name="HeartbeatMetric",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("recorded_at", models.DateTimeField(db_index=True)),
                ("heap_free_bytes", models.PositiveIntegerField()),
                ("heap_min_free_bytes", models.PositiveIntegerField()),
                ("wifi_rssi_dbm", models.SmallIntegerField()),
                (
                    "battery_voltage_mv",
                    models.PositiveSmallIntegerField(blank=True, null=True),
                ),
                (
                    "device",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="heartbeats",
                        to="fleet.device",
                    ),
                ),
            ],
            options={"ordering": ["-recorded_at"]},
        ),
        migrations.AddIndex(
            model_name="heartbeatmetric",
            index=models.Index(
                fields=["device", "-recorded_at"],
                name="fleet_heart_device__b8e0f0_idx",
            ),
        ),
    ]
