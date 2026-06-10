import hashlib
import secrets

from django.utils.crypto import constant_time_compare

from fleet.models import Device

TOKEN_BYTE_LENGTH = 32


def generate_device_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTE_LENGTH)


def hash_device_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_device_token(device: Device, token: str) -> bool:
    if not device.token_hash or not token:
        return False
    return constant_time_compare(device.token_hash, hash_device_token(token))


def set_device_token(device: Device) -> str:
    token = generate_device_token()
    device.token_hash = hash_device_token(token)
    device.save(update_fields=["token_hash", "updated_at"])
    return token
