import cbor2
import pytest
from django.test import Client


@pytest.fixture
def api_client():
    return Client()


@pytest.mark.django_db
def test_heartbeat_requires_device_id(api_client):
    response = api_client.post(
        "/api/v1/agent/heartbeat/",
        data=cbor2.dumps({"heap_free": 1, "heap_min_free": 1, "wifi_rssi": -60}),
        content_type="application/cbor",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_heartbeat_accepts_cbor(api_client, monkeypatch):
    import agents.views as agent_views

    def fake_enqueue(device_id, payload):
        assert device_id == "240ac4a1b2c3"
        assert payload["heap_free"] == 50000

    monkeypatch.setattr(agent_views, "enqueue_heartbeat", fake_enqueue)

    payload = {
        "heap_free": 50000,
        "heap_min_free": 40000,
        "wifi_rssi": -58,
        "battery_mv": 3800,
    }
    response = api_client.post(
        "/api/v1/agent/heartbeat/",
        data=cbor2.dumps(payload),
        content_type="application/cbor",
        HTTP_X_DEVICE_ID="24:0a:c4:a1:b2:c3",
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.django_db
def test_ota_check_no_update(api_client):
    response = api_client.get(
        "/api/v1/agent/ota-check/",
        {"device_id": "240ac4a1b2c3", "hw_version": "1.0", "fw_version": "9.9.9"},
    )
    assert response.status_code == 204


@pytest.mark.django_db
def test_heartbeat_returns_pending_reboot_command(api_client, monkeypatch):
    import agents.views as agent_views

    from fleet.models import Device
    from fleet.services.commands import queue_device_command

    monkeypatch.setattr(agent_views, "enqueue_heartbeat", lambda device_id, payload: None)

    device = Device.objects.create(device_id="240ac4a1b2c3")
    cmd = queue_device_command(device, "reboot")

    payload = {
        "heap_free": 50000,
        "heap_min_free": 40000,
        "wifi_rssi": -58,
    }
    response = api_client.post(
        "/api/v1/agent/heartbeat/",
        data=cbor2.dumps(payload),
        content_type="application/cbor",
        HTTP_X_DEVICE_ID="240ac4a1b2c3",
    )
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "command": "reboot",
        "command_id": str(cmd.pk),
    }

    response_again = api_client.post(
        "/api/v1/agent/heartbeat/",
        data=cbor2.dumps(payload),
        content_type="application/cbor",
        HTTP_X_DEVICE_ID="240ac4a1b2c3",
    )
    assert response_again.json() == {"status": "ok"}
