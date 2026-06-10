# Arduino-ESP8266 example

Heartbeats every 60s and OTA checks every 5 minutes (configurable). Uses the same Fleet Manager agent API as the ESP32 sketch, but builds a **separate** `.bin` for the 8266 CPU.

## ESP32 vs ESP8266

| | ESP32 agent | This sketch |
|---|-------------|-------------|
| Board package | `esp32` (Espressif) | `esp8266` (ESP8266 Community) |
| HW version in `secrets.h` | e.g. `1.0` | **`8266`** (required — do not reuse ESP32 HW) |
| OTA library | `HTTPUpdate` | `ESP8266httpUpdate` |
| Dashboard OTA binary | `FleetManagerAgent.ino.bin` (ESP32 build) | **`FleetManagerAgent8266.ino.bin`** (8266 build) |

Never deploy an ESP32 `.bin` to ESP8266 or vice versa.

## Requirements

- [Arduino IDE](https://www.arduino.cc/) 2.x or Arduino CLI
- Board package: **esp8266** by ESP8266 Community (3.x)
- Fleet Manager server reachable from the device (Docker locally or Hetzner)

Install the board package: **Tools → Board → Boards Manager** → search **esp8266** → install **esp8266 by ESP8266 Community**.

## Configure

```bash
cp secrets.example.h secrets.h   # secrets.h is gitignored — stays on your machine
```

1. Set `WIFI_SSID` / `WIFI_PASSWORD`
2. Set `FLEET_API_HOST` / `FLEET_API_PORT` (e.g. Hetzner `YOUR_HETZNER_SERVER_IP` / `8993`, or your LAN IP / `52841` for local Docker)
3. **Register the device** in the dashboard (**Register device**) using the MAC shown in Serial after first boot, then paste the one-time token into `FLEET_DEVICE_TOKEN`
4. Keep `FLEET_HW_VERSION` as **`8266`** unless you use a custom scheme
5. For local Docker: add your LAN IP to `ALLOWED_HOSTS` in `.env` and restart `web` (see root `README.md`)

### Agent headers (all requests)

| Header | Source |
|--------|--------|
| `X-Device-Id` | Wi-Fi STA MAC (12 hex chars) |
| `X-Device-Token` | `FLEET_DEVICE_TOKEN` in `secrets.h` |
| `X-Device-Name` | `FLEET_DEVICE_NAME` |
| `X-Hw-Version` / `X-Fw-Version` | `secrets.h` |

Without a valid token the server returns **401**.

## Flash (USB)

1. Open `FleetManagerAgent8266.ino`
2. **Tools → Board** — e.g. **LOLIN(WEMOS) D1 R2 & mini** or **NodeMCU 1.0**
3. **Tools → Flash Size** — pick an **OTA-capable** layout (e.g. **4MB (FS:none OTA:~1019KB)**)
4. Upload, Serial Monitor @ **115200**

Expected output:

```text
=== Fleet Manager Arduino Agent (ESP8266) ===
Device ID: aabbccddeeff
HW 8266  FW 1.0.0
[heartbeat] device_id=aabbccddeeff sending...
[heartbeat] OK device_id=aabbccddeeff heap=... min_heap=... rssi=-50 batt=0 mV
[ota] checking for update (fw 1.0.0)...
```

If you see `HTTP 401` with `Missing X-Device-Token`, add the token to `secrets.h` and reflash via USB (OTA cannot fix a missing token header).

## OTA from the dashboard

1. **Sketch → Export Compiled Binary**
2. Use **`FleetManagerAgent8266.ino.bin`** from the sketch `build/esp8266.*/` folder
3. Dashboard **Firmware** tab → **Deploy OTA Update**
4. **Version** = `FLEET_FW_VERSION` in `secrets.h` (must be newer than running FW)
5. **HW version** = **`8266`** (must match `FLEET_HW_VERSION`)
6. Select target device(s), **Send OTA**

Cohort-based rollouts via Django admin still work for devices assigned to a cohort.
