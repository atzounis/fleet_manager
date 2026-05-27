#pragma once

/* Copy to secrets.h and fill in your values. */

#define WIFI_SSID "your-wifi-ssid"
#define WIFI_PASSWORD "your-wifi-password"

/* LAN IP of the machine running Docker (NOT 127.0.0.1 — the ESP cannot reach your PC's localhost). */
#define FLEET_API_HOST "192.168.1.100"
#define FLEET_API_PORT 52841

#define FLEET_HW_VERSION "1.0"
#define FLEET_FW_VERSION "1.0.0"

/* Send a test crash report once after boot (for dashboard testing). */
#define FLEET_SEND_TEST_CRASH 1
