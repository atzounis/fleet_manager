from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from fleet.models import Cohort, CrashReport, Device, FirmwareRelease, HeartbeatMetric

from .serializers import (
    CohortSerializer,
    CrashReportSerializer,
    DeviceSerializer,
    FirmwareReleaseSerializer,
    HeartbeatSerializer,
)


class FleetStatsView(APIView):
    def get(self, request):
        stale_cutoff = timezone.now() - timezone.timedelta(hours=24)
        return Response(
            {
                "devices_total": Device.objects.count(),
                "devices_online": Device.objects.filter(
                    last_seen_at__gte=stale_cutoff
                ).count(),
                "crashes_pending": CrashReport.objects.filter(
                    status=CrashReport.Status.PENDING
                ).count(),
                "firmware_active": FirmwareRelease.objects.filter(is_active=True).count(),
                "cohorts": Cohort.objects.count(),
            }
        )


class DeviceListView(generics.ListAPIView):
    serializer_class = DeviceSerializer

    def get_queryset(self):
        qs = Device.objects.select_related("cohort")
        cohort = self.request.query_params.get("cohort")
        if cohort:
            qs = qs.filter(cohort__name=cohort)
        search = self.request.query_params.get("q")
        if search:
            qs = qs.filter(
                Q(device_id__icontains=search) | Q(label__icontains=search)
            )
        return qs


class DeviceMetricsView(generics.ListAPIView):
    serializer_class = HeartbeatSerializer

    def get_queryset(self):
        limit = min(int(self.request.query_params.get("limit", 100)), 500)
        return HeartbeatMetric.objects.filter(
            device_id=self.kwargs["device_id"]
        ).order_by("-recorded_at")[:limit]


class CrashListView(generics.ListAPIView):
    serializer_class = CrashReportSerializer
    queryset = CrashReport.objects.select_related("device").order_by("-received_at")


class FirmwareListView(generics.ListCreateAPIView):
    serializer_class = FirmwareReleaseSerializer

    def get_queryset(self):
        return FirmwareRelease.objects.select_related("cohort").order_by("-created_at")


class CohortListView(generics.ListAPIView):
    serializer_class = CohortSerializer

    def get_queryset(self):
        return Cohort.objects.annotate(device_count=Count("devices")).order_by("name")
