import pytest
from django.contrib.auth import get_user_model
from django.test import Client


@pytest.fixture
def api_client():
    return Client()


@pytest.mark.django_db
def test_login_and_session(api_client):
    get_user_model().objects.create_user(
        username="admin",
        password="secret123",
        is_staff=True,
    )

    unauth = api_client.get("/api/v1/dashboard/auth/session/")
    assert unauth.status_code == 401

    bad_login = api_client.post(
        "/api/v1/dashboard/auth/login/",
        {"username": "admin", "password": "wrong"},
        content_type="application/json",
    )
    assert bad_login.status_code == 401

    login = api_client.post(
        "/api/v1/dashboard/auth/login/",
        {"username": "admin", "password": "secret123"},
        content_type="application/json",
    )
    assert login.status_code == 200
    assert login.json()["username"] == "admin"

    session = api_client.get("/api/v1/dashboard/auth/session/")
    assert session.status_code == 200
    assert session.json()["username"] == "admin"

    stats = api_client.get("/api/v1/dashboard/stats/")
    assert stats.status_code == 200

    logout = api_client.post("/api/v1/dashboard/auth/logout/")
    assert logout.status_code == 204

    after_logout = api_client.get("/api/v1/dashboard/stats/")
    assert after_logout.status_code == 403
