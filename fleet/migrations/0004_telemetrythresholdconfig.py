from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("fleet", "0003_heartbeatmetric_battery_level_pct_and_cpu_temp"),
    ]

    operations = [
        migrations.CreateModel(
            name="TelemetryThresholdConfig",
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
                ("heap_free_bytes_min", models.PositiveIntegerField(default=50000)),
                ("wifi_rssi_dbm_min", models.SmallIntegerField(default=-75)),
                ("battery_voltage_mv_min", models.PositiveIntegerField(default=3600)),
                ("cpu_temperature_c_max", models.SmallIntegerField(default=75)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Telemetry threshold config",
                "verbose_name_plural": "Telemetry threshold config",
            },
        ),
    ]
