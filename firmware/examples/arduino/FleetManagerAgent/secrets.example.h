#pragma once

/* Copy to secrets.h and fill in your values. */

#define WIFI_SSID "your-wifi-ssid"
#define WIFI_PASSWORD "your-wifi-password"

/* Server host: LAN IP or hostname — NOT 127.0.0.1 from the device */
#define FLEET_API_HOST "your-mac-hostname.local"
#define FLEET_API_PORT 52841

/* Per-device token from dashboard → Register device (shown once). */
#define FLEET_DEVICE_TOKEN "paste-token-from-dashboard"

/* Reported in X-Hw-Version / X-Fw-Version headers; used for OTA matching. */
#define FLEET_HW_VERSION "1.0"
#define FLEET_FW_VERSION "1.0.0"

/* Optional human-readable label in the dashboard */
#define FLEET_DEVICE_NAME "esp32-device"

/* Optional battery sense: GPIO number, or -1 to send battery_mv=0 (unknown). */
#define FLEET_BATTERY_ADC_PIN -1
/* Multiply ADC pin voltage to get pack mV (e.g. 2.0 for a 1:1 resistor divider). */
#define FLEET_BATTERY_DIVIDER_RATIO 2.0f

/* OTA poll interval in ms (default 5 min). Use 60000 for faster testing. */
/* #define FLEET_OTA_MS (60 * 1000UL) */

/* POST a simulated crash once after boot (dashboard testing). */
/* #define FLEET_SEND_TEST_CRASH 1 */
