from django.core.management.base import BaseCommand
from django.utils import timezone

from fleet.models import Cohort, Device, FirmwareRelease, HeartbeatMetric
from fleet.services.device_tokens import set_device_token


class Command(BaseCommand):
    help = "Seed demo cohort, devices, metrics, and firmware for local development."

    def handle(self, *args, **options):
        cohort, _ = Cohort.objects.get_or_create(
            name="stable",
            defaults={"description": "Production rollout cohort"},
        )
        canary, _ = Cohort.objects.get_or_create(
            name="canary",
            defaults={"description": "Early OTA testers"},
        )

        device, _ = Device.objects.update_or_create(
            device_id="240ac4a1b2c3",
            defaults={
                "label": "Lab ESP32 #1",
                "hw_version": "1.0",
                "fw_version": "1.0.0",
                "cohort": cohort,
                "last_seen_at": timezone.now(),
            },
        )

        issued_token = None
        if not device.token_hash:
            issued_token = set_device_token(device)

        FirmwareRelease.objects.get_or_create(
            version="1.1.0",
            hw_version="1.0",
            cohort=cohort,
            defaults={
                "s3_key": "firmware/stable/1.1.0/firmware.bin",
                "file_size_bytes": 1048576,
                "is_active": True,
            },
        )

        now = timezone.now()
        for i in range(24):
            HeartbeatMetric.objects.get_or_create(
                device=device,
                recorded_at=now - timezone.timedelta(hours=i),
                defaults={
                    "heap_free_bytes": 45000 + i * 100,
                    "heap_min_free_bytes": 32000,
                    "wifi_rssi_dbm": -55 - (i % 5),
                    "battery_voltage_mv": 3700,
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded cohorts ({cohort.name}, {canary.name}), device {device.device_id}, metrics, firmware."
            )
        )
        if issued_token:
            self.stdout.write(
                self.style.WARNING(
                    f"Agent token for {device.device_id} (set FLEET_DEVICE_TOKEN in secrets.h):\n{issued_token}"
                )
            )
        elif device.token_hash:
            self.stdout.write(
                "Device already has a token. Rotate from the dashboard if you need a new one."
            )
