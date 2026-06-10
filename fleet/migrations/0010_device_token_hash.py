from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("fleet", "0009_devicecommand"),
    ]

    operations = [
        migrations.AddField(
            model_name="device",
            name="token_hash",
            field=models.CharField(
                blank=True,
                default="",
                help_text="SHA-256 hex digest of the device agent token (never store plaintext).",
                max_length=64,
            ),
        ),
    ]
