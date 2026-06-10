# Arduino-ESP32 example

Sends heartbeats every 60s and checks OTA every 5 minutes. Supports remote reboot commands from the dashboard.

## How it reports to the platform

| Data | Source | How it reaches Django |
|------|--------|------------------------|
| **Device ID** | Wi-Fi STA MAC (`esp_read_mac`) | `X-Device-Id` header (12 hex chars, e.g. `30aea4c2cdc4`) |
| **Device token** | `FLEET_DEVICE_TOKEN` in `secrets.h` | `X-Device-Token` header (required) |
| **HW / FW version** | `secrets.h` constants | `X-Hw-Version`, `X-Fw-Version` headers |
| **Heap, RSSI, battery, CPU temp** | `collect_telemetry()` in sketch | CBOR body on `POST /api/v1/agent/heartbeat/` |

Register the device in the dashboard (**Register device**) using the MAC shown in Serial, then copy the one-time token into `FLEET_DEVICE_TOKEN` before the first heartbeat. Without a valid token the server returns **401**.

Metrics are buffered in Redis and written to Postgres about every 60s.

### CBOR fields (heartbeat body)

- `heap_free`, `heap_min_free` — from `ESP.getFreeHeap()` / `ESP.getMinFreeHeap()`
- `wifi_rssi` — from `WiFi.RSSI()` (or `-127` if disconnected)
- `battery_mv` — from ADC if `FLEET_BATTERY_ADC_PIN >= 0`, else `0` (unknown)
- `cpu_temp_c` — from internal sensor via `temprature_sens_read()` (uncalibrated)

Encoding is implemented in `fleet_cbor.c` (same format as `firmware/sdk/`).

## Requirements

- [Arduino IDE](https://www.arduino.cc/) or Arduino CLI
- Board package: **esp32** by Espressif (3.x)
- Fleet Manager server reachable from the device (Docker locally or Hetzner)

## Configure

```bash
cp secrets.example.h secrets.h   # secrets.h is gitignored — stays on your machine
```

1. Set `WIFI_SSID` / `WIFI_PASSWORD`
2. Set `FLEET_API_HOST` to your computer's **LAN IP** (e.g. `192.168.1.42`), **not** `127.0.0.1`
3. **Register the device** in the dashboard and paste the token into `FLEET_DEVICE_TOKEN`
4. `FLEET_API_PORT` must match `WEB_PORT` in `.env` (default `52841`)
5. Add your LAN IP to `ALLOWED_HOSTS` in `.env` and run `docker compose up -d web` (see root `README.md`)

Find your LAN IP:

```bash
# macOS
ipconfig getifaddr en0
```

### Optional battery ADC

If you have a voltage divider on an analog pin:

```c
#define FLEET_BATTERY_ADC_PIN 34
#define FLEET_BATTERY_DIVIDER_RATIO 2.0f
```

## Flash

1. Open `FleetManagerAgent.ino` in Arduino IDE
2. Select board: **ESP32 Dev Module** (or your module)
3. Upload
4. Open Serial Monitor @ **115200 baud**

You should see:

```text
Device ID: 240ac4a1b2c3
HW 1.0  FW 1.0.0
[heartbeat] device_id=240ac4a1b2c3 sending...
[heartbeat] OK device_id=240ac4a1b2c3 heap=... min_heap=... rssi=-47 batt=0 mV cpu=42C
[ota] checking for update (fw 1.0.0)...
```

If you see `HTTP 401` with `Missing X-Device-Token`, add the token to `secrets.h` and reflash via USB.

## Verify on server

- Dashboard: http://localhost:61294 — device appears after registration + first heartbeat
- Or API: `curl http://localhost:52841/api/v1/dashboard/devices/`

## OTA updates

The sketch polls `/api/v1/agent/ota-check/` about every 5 minutes and applies updates with `HTTPUpdate` when the dashboard queues a deployment.

1. Export **`FleetManagerAgent.ino.bin`** (see root `README.md` → *Generate OTA binary locally*).
2. Open the dashboard **Firmware** tab → **Deploy OTA Update**.
3. Upload the `.bin`, enter version/HW (must match `secrets.h`), select target devices, click **Send OTA**.

Do **not** upload `bootloader.bin`, `partitions.bin`, or `merged.bin` for OTA — app image only.

**Serial shows `[ota] update available:` with a blank URL** — reflash this sketch (it disables HTTP redirect following so `Location` and `X-Firmware-Version` are read from the 302). Also set `AWS_S3_PUBLIC_ENDPOINT_URL` to your LAN MinIO URL in `.env` (see root README).

Cohort-based rollouts via Django admin still work for devices assigned to a cohort.
