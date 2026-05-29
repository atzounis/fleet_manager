import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("fleet", "0008_telemetrythresholdconfig_hw_version"),
    ]

    operations = [
        migrations.CreateModel(
            name="DeviceCommand",
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
                (
                    "command",
                    models.CharField(
                        choices=[("reboot", "Reboot")],
                        max_length=32,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("delivered", "Delivered"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("delivered_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "device",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="commands",
                        to="fleet.device",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="devicecommand",
            index=models.Index(
                fields=["device", "status", "created_at"],
                name="fleet_devic_device__cmd_idx",
            ),
        ),
        migrations.AlterField(
            model_name="fleetevent",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("crash_report", "Crash report"),
                    ("device_offline", "Device offline"),
                    ("device_online", "Device online"),
                    ("threshold_breach", "Threshold breach"),
                    ("ota_queued", "OTA queued"),
                    ("ota_updated", "OTA updated"),
                    ("ota_failed", "OTA failed"),
                    ("ota_rolled_back", "OTA rolled back"),
                    ("reboot_queued", "Reboot queued"),
                ],
                max_length=32,
            ),
        ),
    ]
