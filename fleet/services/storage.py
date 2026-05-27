from __future__ import annotations

import uuid
from urllib.parse import urlparse, urlunparse

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings


class StorageError(Exception):
    pass


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME,
        use_ssl=settings.AWS_S3_USE_SSL,
    )


def upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
    except (BotoCoreError, ClientError) as exc:
        raise StorageError("Failed to upload object to storage.") from exc
    return key


def presign_get_url(key: str, expires_in: int | None = None) -> str:
    client = get_s3_client()
    expiry = expires_in or settings.OTA_SIGNED_URL_EXPIRY_SECONDS
    try:
        signed = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": key},
            ExpiresIn=expiry,
        )
        public_endpoint = getattr(settings, "AWS_S3_PUBLIC_ENDPOINT_URL", "").strip()
        if public_endpoint:
            parsed_signed = urlparse(signed)
            parsed_public = urlparse(public_endpoint)
            if parsed_public.scheme and parsed_public.netloc:
                signed = urlunparse(
                    (
                        parsed_public.scheme,
                        parsed_public.netloc,
                        parsed_signed.path,
                        parsed_signed.params,
                        parsed_signed.query,
                        parsed_signed.fragment,
                    )
                )
        return signed
    except (BotoCoreError, ClientError) as exc:
        raise StorageError("Failed to generate signed URL.") from exc


def make_object_key(prefix: str, device_id: str, suffix: str) -> str:
    return f"{prefix}/{device_id}/{uuid.uuid4().hex}{suffix}"
