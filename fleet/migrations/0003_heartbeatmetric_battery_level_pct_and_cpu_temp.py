from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("fleet", "0002_rename_fleet_heart_device__b8e0f0_idx_fleet_heart_device__d2b4db_idx"),
    ]

    operations = [
        migrations.AddField(
            model_name="heartbeatmetric",
            name="battery_level_pct",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="heartbeatmetric",
            name="cpu_temperature_c",
            field=models.SmallIntegerField(blank=True, null=True),
        ),
    ]
