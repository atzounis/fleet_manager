import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create or update the dashboard admin user from environment variables."

    def handle(self, *args, **options):
        username = os.environ.get("DASHBOARD_ADMIN_USERNAME", "admin").strip() or "admin"
        password = os.environ.get("DASHBOARD_ADMIN_PASSWORD", "").strip()
        if not password:
            self.stdout.write(
                self.style.WARNING(
                    "DASHBOARD_ADMIN_PASSWORD is not set — skipping admin user setup."
                )
            )
            return

        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": f"{username}@localhost",
                "is_staff": True,
                "is_superuser": True,
            },
        )
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()

        verb = "Created" if created else "Updated password for"
        self.stdout.write(self.style.SUCCESS(f"{verb} dashboard user '{username}'"))
