from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("fleet", "0004_telemetrythresholdconfig"),
    ]

    operations = [
        migrations.AddField(
            model_name="device",
            name="is_online_cached",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="FleetEvent",
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
                    "event_type",
                    models.CharField(
                        choices=[
                            ("crash_report", "Crash report"),
                            ("device_offline", "Device offline"),
                            ("device_online", "Device online"),
                            ("threshold_breach", "Threshold breach"),
                        ],
                        max_length=32,
                    ),
                ),
                (
                    "severity",
                    models.CharField(
                        choices=[
                            ("info", "Info"),
                            ("warning", "Warning"),
                            ("critical", "Critical"),
                        ],
                        max_length=16,
                    ),
                ),
                ("summary", models.CharField(max_length=255)),
                ("details", models.JSONField(blank=True, default=dict)),
                ("event_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    "device",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="events",
                        to="fleet.device",
                    ),
                ),
            ],
            options={"ordering": ["-event_at"]},
        ),
    ]
