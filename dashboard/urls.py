from django.urls import path

from . import views

urlpatterns = [
    path("stats/", views.FleetStatsView.as_view(), name="fleet-stats"),
    path("devices/", views.DeviceListView.as_view(), name="device-list"),
    path(
        "devices/<str:device_id>/metrics/",
        views.DeviceMetricsView.as_view(),
        name="device-metrics",
    ),
    path("crashes/", views.CrashListView.as_view(), name="crash-list"),
    path("firmware/", views.FirmwareListView.as_view(), name="firmware-list"),
    path("cohorts/", views.CohortListView.as_view(), name="cohort-list"),
]
