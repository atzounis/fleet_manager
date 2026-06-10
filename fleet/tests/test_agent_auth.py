import cbor2
import pytest
from django.test import Client

from fleet.models import Device


@pytest.fixture
def api_client():
    return Client()


@pytest.mark.django_db
def test_heartbeat_rejects_unregistered_device(api_client):
    payload = {"heap_free": 50000, "heap_min_free": 40000, "wifi_rssi": -58}
    response = api_client.post(
        "/api/v1/agent/heartbeat/",
        data=cbor2.dumps(payload),
        content_type="application/cbor",
        HTTP_X_DEVICE_ID="240ac4a1b2c3",
        HTTP_X_DEVICE_TOKEN="some-token",
    )
    assert response.status_code == 403
    assert "not registered" in response.json()["error"].lower()


@pytest.mark.django_db
def test_heartbeat_rejects_missing_token(api_client, registered_device):
    response = api_client.post(
        "/api/v1/agent/heartbeat/",
        data=cbor2.dumps({"heap_free": 1, "heap_min_free": 1, "wifi_rssi": -60}),
        content_type="application/cbor",
        HTTP_X_DEVICE_ID="240ac4a1b2c3",
    )
    assert response.status_code == 401


@pytest.mark.django_db
def test_heartbeat_rejects_invalid_token(api_client, registered_device):
    response = api_client.post(
        "/api/v1/agent/heartbeat/",
        data=cbor2.dumps({"heap_free": 1, "heap_min_free": 1, "wifi_rssi": -60}),
        content_type="application/cbor",
        HTTP_X_DEVICE_ID="240ac4a1b2c3",
        HTTP_X_DEVICE_TOKEN="wrong-token",
    )
    assert response.status_code == 401


@pytest.mark.django_db
def test_heartbeat_does_not_auto_register(api_client, registered_device):
    device, token = registered_device
    before = Device.objects.count()

    payload = {"heap_free": 50000, "heap_min_free": 40000, "wifi_rssi": -58}
    response = api_client.post(
        "/api/v1/agent/heartbeat/",
        data=cbor2.dumps(payload),
        content_type="application/cbor",
        HTTP_X_DEVICE_ID="deadbeefcafe",
        HTTP_X_DEVICE_TOKEN=token,
    )
    assert response.status_code == 403
    assert Device.objects.count() == before
