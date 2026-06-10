#pragma once

/* Copy to secrets.h and fill in your values. */

#define WIFI_SSID "your-wifi-ssid"
#define WIFI_PASSWORD "your-wifi-password"

/* Server host: Mac Bonjour name (.local) or LAN IP — NOT 127.0.0.1 */
#define FLEET_API_HOST "your-mac-hostname.local"
#define FLEET_API_PORT 52841

/*
 * Use a dedicated HW version for ESP8266 so dashboard OTA never offers ESP32
 * binaries to 8266 devices (and vice versa).
 */
#define FLEET_HW_VERSION "8266"
#define FLEET_FW_VERSION "1.0.0"

/* Optional battery on A0 (NodeMCU/Wemos). Set to A0 or -1 for unknown. */
#define FLEET_BATTERY_ADC_PIN -1
/* Multiply ADC pin voltage to get pack mV (e.g. 2.0 for a 1:1 resistor divider). */
#define FLEET_BATTERY_DIVIDER_RATIO 2.0f

/* OTA poll interval in ms (default 5 min). Use 60000 for faster testing. */
/* #define FLEET_OTA_MS (60 * 1000UL) */

/* POST a simulated crash once after boot (dashboard testing). */
#define FLEET_SEND_TEST_CRASH 1
