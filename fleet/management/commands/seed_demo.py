from django.core.management.base import BaseCommand
from django.utils import timezone

from fleet.models import Cohort, Device, FirmwareRelease, HeartbeatMetric


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
