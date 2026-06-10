import pytest

from fleet.models import Device
from fleet.services.device_tokens import set_device_token


@pytest.fixture
def registered_device(db):
    device = Device.objects.create(device_id="240ac4a1b2c3", hw_version="1.0", fw_version="1.0.0")
    token = set_device_token(device)
    return device, token
