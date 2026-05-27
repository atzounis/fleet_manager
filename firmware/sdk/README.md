# Fleet Manager ESP32 SDK

Reference headers and CBOR encoder under `include/` and `src/`. For immediate testing, use the complete examples:

- **Arduino:** [`../examples/arduino/FleetManagerAgent/`](../examples/arduino/FleetManagerAgent/)
- **ESP-IDF (FreeRTOS):** [`../examples/esp-idf/fleet_agent/`](../examples/esp-idf/fleet_agent/)

## Device identity

Factory Wi-Fi MAC as 12-character lowercase hex (no colons), sent in `X-Device-Id`.

## Agent endpoints

| Method | Path | Body |
|--------|------|------|
| POST | `/api/v1/agent/heartbeat/` | CBOR map |
| POST | `/api/v1/agent/crash-report/` | raw binary |
| GET | `/api/v1/agent/ota-check/` | query: `device_id`, `hw_version`, `fw_version` |

## CBOR heartbeat fields

| Field | Type | Description |
|-------|------|-------------|
| `heap_free` | uint | Free heap bytes |
| `heap_min_free` | uint | Minimum ever free heap |
| `wifi_rssi` | int | RSSI dBm (negative) |
| `battery_mv` | uint | Optional battery mV |

Panic handlers must not call `malloc()` or `printf()` in the panic path.
