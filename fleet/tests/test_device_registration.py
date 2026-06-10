import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from fleet.models import Device
from fleet.services.device_tokens import set_device_token


@pytest.fixture
def auth_client(db):
    client = Client()
    user = get_user_model().objects.create_user(
        username="admin",
        password="testpass",
        is_staff=True,
    )
    client.force_login(user)
    return client


@pytest.mark.django_db
def test_register_device_returns_token_once(auth_client):
    response = auth_client.post(
        "/api/v1/dashboard/devices/register/",
        {"device_id": "aabbccddeeff", "label": "Bench ESP32", "hw_version": "1.0"},
        content_type="application/json",
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["device_id"] == "aabbccddeeff"
    assert payload["is_provisioned"] is True
    assert len(payload["token"]) >= 32

    device = Device.objects.get(device_id="aabbccddeeff")
    assert device.token_hash

    listed = auth_client.get("/api/v1/dashboard/devices/").json()["results"][0]
    assert listed["is_provisioned"] is True
    assert "token" not in listed


@pytest.mark.django_db
def test_rotate_device_token(auth_client):
    device = Device.objects.create(device_id="240ac4a1b2c3")
    set_device_token(device)

    response = auth_client.post("/api/v1/dashboard/devices/240ac4a1b2c3/token/")
    assert response.status_code == 200
    assert len(response.json()["token"]) >= 32
