# Arduino-ESP32 example

Sends heartbeats every 60s and checks OTA every 5 minutes. On first boot it can POST a **simulated crash** so you see data in the dashboard immediately.

## How it reports to the platform

| Data | Source | How it reaches Django |
|------|--------|------------------------|
| **Device ID** | Wi-Fi STA MAC (`esp_read_mac`) | `X-Device-Id` header (12 hex chars, e.g. `30aea4c2cdc4`) |
| **HW / FW version** | `secrets.h` constants | `X-Hw-Version`, `X-Fw-Version` headers |
| **Heap, RSSI, battery** | `collect_telemetry()` in sketch | CBOR body on `POST /api/v1/agent/heartbeat/` |

The server calls `get_or_create_device()` on the first heartbeat — no separate registration step. Metrics are buffered in Redis and written to Postgres about every 60s.

### CBOR fields (heartbeat body)

- `heap_free`, `heap_min_free` — from `ESP.getFreeHeap()` / `ESP.getMinFreeHeap()`
- `wifi_rssi` — from `WiFi.RSSI()` (or `-127` if disconnected)
- `battery_mv` — from ADC if `FLEET_BATTERY_ADC_PIN >= 0`, else `0` (unknown)

Encoding is implemented in `fleet_cbor.c` (same format as `firmware/sdk/`).

## Requirements

- [Arduino IDE](https://www.arduino.cc/) or Arduino CLI
- Board package: **esp32** by Espressif (3.x)
- Fleet Manager Docker stack running on your PC

## Configure

1. Copy `secrets.example.h` → `secrets.h`
2. Set `WIFI_SSID` / `WIFI_PASSWORD`
3. Set `FLEET_API_HOST` to your computer's **LAN IP** (e.g. `192.168.1.42`), **not** `127.0.0.1`
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
Device ID: 240ac4a1b2c3 (Wi-Fi MAC)
HW 1.0  FW 1.0.0
[heartbeat] OK heap=... min_heap=... rssi=-47 batt=0 mV
[heartbeat] HTTP 200 (63 bytes CBOR)
```

## Verify on server

- Dashboard: http://localhost:61294 — new device appears within ~60s
- Or API: `curl http://localhost:52841/api/v1/dashboard/devices/`

Assign the device to cohort `stable` in Django admin to test OTA (after registering a `FirmwareRelease`).
