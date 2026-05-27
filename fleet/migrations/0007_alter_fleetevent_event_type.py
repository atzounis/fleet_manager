from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("fleet", "0006_otadeployment_otadeploymenttarget"),
    ]

    operations = [
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
                ],
                max_length=32,
            ),
        ),
    ]
