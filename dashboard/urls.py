from django.urls import path

from . import views

urlpatterns = [
    path("stats/", views.FleetStatsView.as_view(), name="fleet-stats"),
    path("devices/", views.DeviceListView.as_view(), name="device-list"),
    path(
        "devices/<str:device_id>/label/",
        views.DeviceLabelUpdateView.as_view(),
        name="device-label-update",
    ),
    path(
        "devices/<str:device_id>/commands/",
        views.DeviceCommandCreateView.as_view(),
        name="device-command-create",
    ),
    path(
        "devices/<str:device_id>/metrics/",
        views.DeviceMetricsView.as_view(),
        name="device-metrics",
    ),
    path("crashes/", views.CrashListView.as_view(), name="crash-list"),
    path("events/", views.EventListView.as_view(), name="event-list"),
    path("firmware/", views.FirmwareListView.as_view(), name="firmware-list"),
    path(
        "ota/deployments/",
        views.OtaDeploymentListCreateView.as_view(),
        name="ota-deployment-list-create",
    ),
    path(
        "ota/deployments/<int:deployment_id>/",
        views.OtaDeploymentDetailView.as_view(),
        name="ota-deployment-detail",
    ),
    path("cohorts/", views.CohortListView.as_view(), name="cohort-list"),
    path("thresholds/", views.TelemetryThresholdConfigView.as_view(), name="thresholds"),
]
