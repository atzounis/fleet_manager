from django.urls import path

from . import auth_views, views

urlpatterns = [
    path("health/", auth_views.HealthView.as_view(), name="dashboard-health"),
    path("auth/csrf/", auth_views.CsrfView.as_view(), name="dashboard-auth-csrf"),
    path("auth/login/", auth_views.LoginView.as_view(), name="dashboard-auth-login"),
    path("auth/logout/", auth_views.LogoutView.as_view(), name="dashboard-auth-logout"),
    path("auth/session/", auth_views.SessionView.as_view(), name="dashboard-auth-session"),
    path("stats/", views.FleetStatsView.as_view(), name="fleet-stats"),
    path("devices/", views.DeviceListView.as_view(), name="device-list"),
    path("devices/register/", views.DeviceRegisterView.as_view(), name="device-register"),
    path(
        "devices/<str:device_id>/token/",
        views.DeviceTokenRotateView.as_view(),
        name="device-token-rotate",
    ),
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
