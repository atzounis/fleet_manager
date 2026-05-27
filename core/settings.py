import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-insecure-key")
DEBUG = os.environ.get("DEBUG", "true").lower() in ("1", "true", "yes")
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if h.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "fleet",
    "agents",
    "dashboard",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"
WSGI_APPLICATION = "core.wsgi.application"

# Set DEV_USE_SQLITE=true to run manage.py without Postgres (heartbeats/storage still need Redis/MinIO).
if os.environ.get("DEV_USE_SQLITE", "").lower() in ("1", "true", "yes"):
    DATABASE_URL = f"sqlite:///{BASE_DIR / 'db.sqlite3'}"
else:
    DATABASE_URL = os.environ.get(
        "DATABASE_URL", "postgres://fleet:fleet@localhost:47291/fleet_manager"
    )
if DATABASE_URL.startswith("sqlite:"):
    if DATABASE_URL.startswith("sqlite:///"):
        _sqlite_path = DATABASE_URL[len("sqlite:///") :]
    else:
        _sqlite_path = DATABASE_URL[len("sqlite://") :]
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": _sqlite_path or str(BASE_DIR / "db.sqlite3"),
        }
    }
else:
    _db = urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": _db.path.lstrip("/"),
            "USER": _db.username or "fleet",
            "PASSWORD": _db.password or "fleet",
            "HOST": _db.hostname or "localhost",
            "PORT": _db.port or 5432,
            "CONN_MAX_AGE": 60,
        }
    }

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:58163/0")
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_HEARTBEAT_FLUSH_SECONDS = int(
    os.environ.get("CELERY_HEARTBEAT_FLUSH_SECONDS", "60")
)
HEARTBEAT_EXPECTED_INTERVAL_SECONDS = int(
    os.environ.get("HEARTBEAT_EXPECTED_INTERVAL_SECONDS", "60")
)
HEARTBEAT_MISSED_ITERATIONS = int(os.environ.get("HEARTBEAT_MISSED_ITERATIONS", "3"))
HEARTBEAT_ONLINE_WINDOW_SECONDS = (
    HEARTBEAT_EXPECTED_INTERVAL_SECONDS * HEARTBEAT_MISSED_ITERATIONS
)

# Dashboard visual thresholds (red dashed lines in charts).
THRESHOLD_HEAP_FREE_BYTES_MIN = int(os.environ.get("THRESHOLD_HEAP_FREE_BYTES_MIN", "50000"))
THRESHOLD_WIFI_RSSI_DBM_MIN = int(os.environ.get("THRESHOLD_WIFI_RSSI_DBM_MIN", "-75"))
THRESHOLD_BATTERY_VOLTAGE_MV_MIN = int(
    os.environ.get("THRESHOLD_BATTERY_VOLTAGE_MV_MIN", "3600")
)
THRESHOLD_BATTERY_LEVEL_PCT_MIN = int(
    os.environ.get("THRESHOLD_BATTERY_LEVEL_PCT_MIN", "20")
)
THRESHOLD_CPU_TEMPERATURE_C_MAX = int(
    os.environ.get("THRESHOLD_CPU_TEMPERATURE_C_MAX", "75")
)
HEARTBEAT_REDIS_STREAM = "fleet:heartbeats:stream"
CELERY_BEAT_SCHEDULE = {
    "flush-heartbeat-stream": {
        "task": "fleet.tasks.flush_heartbeat_stream",
        "schedule": float(os.environ.get("CELERY_HEARTBEAT_FLUSH_SECONDS", "60")),
    },
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

_FRONTEND_PORT = os.environ.get("FRONTEND_PORT", "61294")
CORS_ALLOWED_ORIGINS = [
    f"http://localhost:{_FRONTEND_PORT}",
    f"http://127.0.0.1:{_FRONTEND_PORT}",
]
CORS_ALLOW_CREDENTIALS = True

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}

AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "minioadmin")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "minioadmin")
AWS_STORAGE_BUCKET_NAME = os.environ.get("AWS_STORAGE_BUCKET_NAME", "fleet-manager")
AWS_S3_ENDPOINT_URL = os.environ.get("AWS_S3_ENDPOINT_URL", "http://localhost:38472")
AWS_S3_REGION_NAME = os.environ.get("AWS_S3_REGION_NAME", "us-east-1")
AWS_S3_USE_SSL = os.environ.get("AWS_S3_USE_SSL", "false").lower() in ("1", "true", "yes")
OTA_SIGNED_URL_EXPIRY_SECONDS = int(
    os.environ.get("OTA_SIGNED_URL_EXPIRY_SECONDS", "3600")
)

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
