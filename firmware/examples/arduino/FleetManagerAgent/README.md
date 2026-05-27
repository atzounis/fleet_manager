# Arduino-ESP32 example

Sends heartbeats every 60s and checks OTA every 5 minutes. On first boot it can POST a **simulated crash** so you see data in the dashboard immediately.

## Requirements

- [Arduino IDE](https://www.arduino.cc/) or Arduino CLI
- Board package: **esp32** by Espressif (3.x)
- Fleet Manager Docker stack running on your PC

## Configure

1. Copy `secrets.example.h` → `secrets.h`
2. Set `WIFI_SSID` / `WIFI_PASSWORD`
3. Set `FLEET_API_HOST` to your computer's **LAN IP** (e.g. `192.168.1.42`), **not** `127.0.0.1`
4. `FLEET_API_PORT` must match `WEB_PORT` in `.env` (default `52841`)

Find your LAN IP:

```bash
# macOS
ipconfig getifaddr en0
```

## Flash

1. Open `FleetManagerAgent.ino` in Arduino IDE
2. Select board: **ESP32 Dev Module** (or your module)
3. Upload
4. Open Serial Monitor @ **115200 baud**

You should see:

```text
Device ID: 240ac4a1b2c3
[heartbeat] HTTP 200
```

## Verify on server

- Dashboard: http://localhost:61294 — new device appears within ~60s
- Or API: `curl http://localhost:52841/api/v1/dashboard/devices/`

Assign the device to cohort `stable` in Django admin to test OTA (after registering a `FirmwareRelease`).
