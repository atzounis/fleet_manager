# Fleet Manager — device examples

Ready-to-flash samples that talk to the Docker API.

| Example | Path | Stack |
|---------|------|--------|
| **Arduino (ESP32)** | [`arduino/FleetManagerAgent/`](arduino/FleetManagerAgent/) | `loop()` + HTTPClient |
| **Arduino (ESP8266)** | [`arduino/FleetManagerAgent8266/`](arduino/FleetManagerAgent8266/) | `loop()` + ESP8266httpUpdate |
| **ESP-IDF** | [`esp-idf/fleet_agent/`](esp-idf/fleet_agent/) | FreeRTOS tasks + `esp_http_client` |

## Before you flash

1. Start the server:

   ```bash
   docker compose up -d
   ```

2. Use your computer's **LAN IP** in device config (the ESP cannot use `127.0.0.1`).

3. Ensure Docker publishes API on port **52841** (default `WEB_PORT`).

4. **ESP8266:** set `FLEET_HW_VERSION` to **`8266`** and deploy only 8266-built `.bin` files. **ESP32:** use HW `1.0` (or your own) and ESP32 `.bin` files — never mix chip families in one OTA deployment.

## Quick test without hardware

Simulate a device from your laptop:

```bash
# Replace MAC with any 12-char hex ID
export DEVICE_ID=240ac4dead01
export API=http://127.0.0.1:52841

python3 - <<'PY'
import cbor2, os, urllib.request

api = os.environ["API"]
did = os.environ["DEVICE_ID"]
body = cbor2.dumps({
    "heap_free": 45000,
    "heap_min_free": 32000,
    "wifi_rssi": -55,
    "battery_mv": 3700,
})
req = urllib.request.Request(
    f"{api}/api/v1/agent/heartbeat/",
    data=body,
    method="POST",
    headers={
        "Content-Type": "application/cbor",
        "X-Device-Id": did,
        "X-Hw-Version": "1.0",
        "X-Fw-Version": "1.0.0",
    },
)
print(urllib.request.urlopen(req).read())
PY
```

Then open http://localhost:61294 — the device should appear after Celery flushes Redis (~60s) or immediately if you hit the API with Postgres path for local dev.
