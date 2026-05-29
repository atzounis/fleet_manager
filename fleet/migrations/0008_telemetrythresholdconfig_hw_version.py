from django.db import migrations, models


def seed_hw_threshold_profiles(apps, schema_editor):
    TelemetryThresholdConfig = apps.get_model("fleet", "TelemetryThresholdConfig")
    rows = list(TelemetryThresholdConfig.objects.order_by("id"))
    if rows:
        first = rows[0]
        if not first.hw_version or first.hw_version == "1.0":
            first.hw_version = "1.0"
            first.save(update_fields=["hw_version"])
        for extra in rows[1:]:
            extra.delete()
    else:
        TelemetryThresholdConfig.objects.create(hw_version="1.0")

    TelemetryThresholdConfig.objects.get_or_create(
        hw_version="8266",
        defaults={
            "heap_free_bytes_min": 35000,
            "wifi_rssi_dbm_min": -75,
            "battery_voltage_mv_min": 3600,
            "cpu_temperature_c_max": 75,
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ("fleet", "0007_alter_fleetevent_event_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="telemetrythresholdconfig",
            name="hw_version",
            field=models.CharField(default="1.0", max_length=32),
        ),
        migrations.RunPython(seed_hw_threshold_profiles, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="telemetrythresholdconfig",
            name="hw_version",
            field=models.CharField(default="1.0", max_length=32, unique=True),
        ),
    ]
