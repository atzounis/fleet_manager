from django.urls import path

from . import views

urlpatterns = [
    path("crash-report/", views.CrashReportView.as_view(), name="crash-report"),
    path("heartbeat/", views.HeartbeatView.as_view(), name="heartbeat"),
    path("ota-check/", views.OtaCheckView.as_view(), name="ota-check"),
]
