import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from fleet.models import Device, FleetEvent


@pytest.fixture
def api_client():
    return Client()


@pytest.fixture
def auth_client(db):
    client = Client()
    user = get_user_model().objects.create_user(
        username="admin",
        password="testpass",
        is_staff=True,
        is_superuser=True,
    )
    client.force_login(user)
    return client


@pytest.mark.django_db
def test_events_requires_authentication(api_client):
    response = api_client.get("/api/v1/dashboard/events/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_events_supports_severity_and_metric_filters(auth_client):
    device = Device.objects.create(device_id="240ac4a1b2c3")
    FleetEvent.objects.create(
        device=device,
        event_type=FleetEvent.EventType.THRESHOLD_BREACH,
        severity=FleetEvent.Severity.WARNING,
        summary="heap_free_bytes below threshold",
        details={"metric": "heap_free_bytes", "value": 1000},
    )
    FleetEvent.objects.create(
        device=device,
        event_type=FleetEvent.EventType.DEVICE_ONLINE,
        severity=FleetEvent.Severity.INFO,
        summary="Device online",
        details={},
    )

    response = auth_client.get(
        "/api/v1/dashboard/events/",
        {"severity": "warning", "metric": "heap_free_bytes"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert len(payload["results"]) == 1
    assert payload["results"][0]["details"]["metric"] == "heap_free_bytes"


@pytest.mark.django_db
def test_events_are_paginated(auth_client):
    device = Device.objects.create(device_id="240ac4a1b2c3")
    for index in range(55):
        FleetEvent.objects.create(
            device=device,
            event_type=FleetEvent.EventType.DEVICE_ONLINE,
            severity=FleetEvent.Severity.INFO,
            summary=f"event {index}",
            details={},
        )

    page_one = auth_client.get("/api/v1/dashboard/events/")
    assert page_one.status_code == 200
    assert page_one.json()["count"] == 55
    assert len(page_one.json()["results"]) == 50

    page_two = auth_client.get("/api/v1/dashboard/events/", {"page": 2})
    assert page_two.status_code == 200
    assert len(page_two.json()["results"]) == 5
