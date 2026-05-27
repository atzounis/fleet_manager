# ESP-IDF / FreeRTOS example

FreeRTOS tasks send heartbeats and poll OTA while the main task stays idle. Uses `esp_http_client` and the same CBOR payload as the Arduino sketch.

## Requirements

- [ESP-IDF](https://docs.espressif.com/projects/esp-idf/) v5.1+
- Fleet Manager Docker stack on your LAN

## Configure

```bash
cd firmware/examples/esp-idf/fleet_agent
idf.py set-target esp32   # or esp32s3, etc.
idf.py menuconfig
```

Set under **Fleet Manager Agent**:

- `FLEET_WIFI_SSID` / `FLEET_WIFI_PASSWORD`
- `FLEET_API_BASE_URL` — e.g. `http://192.168.1.42:52841` (LAN IP, not localhost)

## Build and flash

```bash
idf.py build
idf.py -p /dev/tty.usbserial-* flash monitor
```

Expected log:

```text
I (xxxx) fleet_http: device_id=240ac4a1b2c3 api=http://192.168.1.42:52841
I (xxxx) fleet_http: heartbeat err=ESP_OK status=200
```

## Verify

Same as the Arduino example — check http://localhost:61294 or the devices API.

## Tasks

| Task | Default interval | Action |
|------|------------------|--------|
| `fleet_hb` | 60s | POST CBOR heartbeat |
| `fleet_ota` | 300s | GET OTA check |

Intervals are configurable in `menuconfig` → Fleet Manager Agent.
