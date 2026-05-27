/**
 * Fleet Manager — Arduino-ESP32 example
 *
 * Board: ESP32 (Arduino core 3.x)
 * Sends CBOR heartbeats every 60s, OTA check every 5 min.
 *
 * Setup: copy secrets.example.h → secrets.h
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_mac.h>
#include <esp_system.h>

#include "fleet_cbor.h"
#include "secrets.h"

#ifndef FLEET_HEARTBEAT_MS
#define FLEET_HEARTBEAT_MS (60 * 1000UL)
#endif
#ifndef FLEET_OTA_MS
#define FLEET_OTA_MS (5 * 60 * 1000UL)
#endif

static char g_device_id[13];
static unsigned long g_last_heartbeat = 0;
static unsigned long g_last_ota = 0;

static void format_device_id(char *out, size_t out_len)
{
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(out, out_len, "%02x%02x%02x%02x%02x%02x",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

static String api_url(const char *path)
{
    return String("http://") + FLEET_API_HOST + ":" + String(FLEET_API_PORT) + path;
}

static void add_agent_headers(HTTPClient &http)
{
    http.addHeader("X-Device-Id", g_device_id);
    http.addHeader("X-Hw-Version", FLEET_HW_VERSION);
    http.addHeader("X-Fw-Version", FLEET_FW_VERSION);
}

static bool wifi_connect()
{
    if (WiFi.status() == WL_CONNECTED) {
        return true;
    }
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.printf("WiFi connecting to %s", WIFI_SSID);
    for (int i = 0; i < 40; i++) {
        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf("\nWiFi OK, IP=%s RSSI=%d\n",
                          WiFi.localIP().toString().c_str(), WiFi.RSSI());
            return true;
        }
        Serial.print('.');
        delay(500);
    }
    Serial.println("\nWiFi failed");
    return false;
}

static bool send_heartbeat()
{
    uint8_t body[64];
    size_t len = fleet_cbor_encode_heartbeat(
        body, sizeof(body),
        (uint32_t)ESP.getFreeHeap(),
        (uint32_t)ESP.getMinFreeHeap(),
        (int16_t)WiFi.RSSI(),
        3700);

    HTTPClient http;
    String url = api_url("/api/v1/agent/heartbeat/");
    http.begin(url);
    add_agent_headers(http);
    http.addHeader("Content-Type", "application/cbor");

    int code = http.POST(body, len);
    http.end();

    Serial.printf("[heartbeat] HTTP %d (%u bytes)\n", code, (unsigned)len);
    return code == 200;
}

static bool send_test_crash()
{
    const uint8_t fake_dump[] = {
        0x45, 0x53, 0x50, 0x33, 0x32, 0x20, 0x74, 0x65,
        0x73, 0x74, 0x20, 0x63, 0x72, 0x61, 0x73, 0x68,
    };

    HTTPClient http;
    String url = api_url("/api/v1/agent/crash-report/");
    http.begin(url);
    http.addHeader("Content-Type", "application/octet-stream");
    http.addHeader("X-Device-Id", g_device_id);
    http.addHeader("X-Hw-Version", FLEET_HW_VERSION);
    http.addHeader("X-Fw-Version", FLEET_FW_VERSION);
    http.addHeader("X-Panic-Reason", "Arduino test crash (simulated)");

    int code = http.POST((uint8_t *)fake_dump, sizeof(fake_dump));
    http.end();

    Serial.printf("[crash-report] HTTP %d\n", code);
    return code == 202;
}

static bool check_ota()
{
    HTTPClient http;
    String url = api_url("/api/v1/agent/ota-check/?device_id=") + g_device_id
               + "&hw_version=" + FLEET_HW_VERSION
               + "&fw_version=" + FLEET_FW_VERSION;
    http.begin(url);
    http.addHeader("X-Device-Id", g_device_id);

    int code = http.GET();
    if (code == 302) {
        Serial.printf("[ota] update available: %s\n", http.header("Location").c_str());
        Serial.printf("[ota] version: %s\n", http.header("X-Firmware-Version").c_str());
    } else if (code == 204) {
        Serial.println("[ota] no update");
    } else {
        Serial.printf("[ota] HTTP %d\n", code);
    }
    http.end();
    return code == 204 || code == 302;
}

void setup()
{
    Serial.begin(115200);
    delay(500);
    Serial.println("\n=== Fleet Manager Arduino Agent ===");

    format_device_id(g_device_id, sizeof(g_device_id));
    Serial.printf("Device ID: %s\n", g_device_id);
    Serial.printf("API: http://%s:%d\n", FLEET_API_HOST, FLEET_API_PORT);

    if (!wifi_connect()) {
        return;
    }

#if FLEET_SEND_TEST_CRASH
    send_test_crash();
#endif

    send_heartbeat();
    g_last_heartbeat = millis();
    g_last_ota = millis();
}

void loop()
{
    if (!wifi_connect()) {
        delay(5000);
        return;
    }

    unsigned long now = millis();

    if (now - g_last_heartbeat >= FLEET_HEARTBEAT_MS) {
        send_heartbeat();
        g_last_heartbeat = now;
    }

    if (now - g_last_ota >= FLEET_OTA_MS) {
        check_ota();
        g_last_ota = now;
    }

    delay(1000);
}
