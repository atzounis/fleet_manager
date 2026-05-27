/**
 * Fleet Manager — Arduino-ESP32 example
 *
 * Identity: Wi-Fi STA MAC → 12-char hex device ID (X-Device-Id header).
 * Telemetry: heap + RSSI (+ optional battery ADC) → CBOR POST /api/v1/agent/heartbeat/
 * Versions: FLEET_HW_VERSION / FLEET_FW_VERSION in secrets.h → request headers.
 *
 * Setup: copy secrets.example.h → secrets.h
 */


#ifdef __cplusplus
extern "C" {
#endif

uint8_t temprature_sens_read();

#ifdef __cplusplus
}
#endif


#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_mac.h>
#include <esp_system.h>

#include "fleet_cbor.h"
#include "secrets.h"

#ifndef FLEET_BATTERY_ADC_PIN
#define FLEET_BATTERY_ADC_PIN -1
#endif
#ifndef FLEET_BATTERY_DIVIDER_RATIO
#define FLEET_BATTERY_DIVIDER_RATIO 2.0f
#endif

#ifndef FLEET_HEARTBEAT_MS
#define FLEET_HEARTBEAT_MS (60 * 1000UL)
#endif
#ifndef FLEET_OTA_MS
#define FLEET_OTA_MS (5 * 60 * 1000UL)
#endif

/** Snapshot of values sent in each heartbeat CBOR body. */
struct FleetTelemetry {
    uint32_t heap_free;
    uint32_t heap_min_free;
    int16_t wifi_rssi;
    uint16_t battery_mv;
    int16_t cpu_temp_c;
};

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

static uint16_t read_battery_mv()
{
#if FLEET_BATTERY_ADC_PIN >= 0
    /*
     * Example: 100k + 100k divider from battery to GPIO → ratio 2.0
     * Adjust FLEET_BATTERY_DIVIDER_RATIO for your hardware.
     */
    analogReadResolution(12);
#if defined(ESP32) || defined(ESP32S2) || defined(ESP32S3) || defined(ESP32C3)
    analogSetPinAttenuation(FLEET_BATTERY_ADC_PIN, ADC_11db);
#endif
    const int raw = analogRead(FLEET_BATTERY_ADC_PIN);
    const float pin_mv = (raw / 4095.0f) * 3300.0f;
    return (uint16_t)(pin_mv * FLEET_BATTERY_DIVIDER_RATIO);
#else
    return 0; /* 0 = unknown / no battery sense wired */
#endif
}

static float_t read_cpu_temp_c()
{
    return (float_t)(temprature_sens_read() - 32) / 1.8;
}

static FleetTelemetry collect_telemetry()
{
    FleetTelemetry t = {};
    t.heap_free = (uint32_t)ESP.getFreeHeap();
    t.heap_min_free = (uint32_t)ESP.getMinFreeHeap();
    t.wifi_rssi = (WiFi.status() == WL_CONNECTED) ? (int16_t)WiFi.RSSI() : (int16_t)-127;
    t.battery_mv = read_battery_mv();
    t.cpu_temp_c = read_cpu_temp_c();
    return t;
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
    const FleetTelemetry t = collect_telemetry();

    uint8_t body[96];
    size_t len = fleet_cbor_encode_heartbeat(
        body, sizeof(body),
        t.heap_free,
        t.heap_min_free,
        t.wifi_rssi,
        t.battery_mv,
        t.cpu_temp_c);

    HTTPClient http;
    String url = api_url("/api/v1/agent/heartbeat/");
    http.begin(url);
    add_agent_headers(http);
    http.addHeader("Content-Type", "application/cbor");

    int code = http.POST(body, len);
    if (code == 200) {
        Serial.printf(
            "[heartbeat] OK heap=%lu min_heap=%lu rssi=%d batt=%u mV cpu=%dC\n",
                      (unsigned long)t.heap_free,
                      (unsigned long)t.heap_min_free,
                      (int)t.wifi_rssi,
                      (unsigned)t.battery_mv,
                      (int)t.cpu_temp_c);
    } else {
        Serial.printf("[heartbeat] HTTP %d body: %s\n", code, http.getString().c_str());
    }
    http.end();

    Serial.printf("[heartbeat] HTTP %d (%u bytes CBOR)\n", code, (unsigned)len);
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
    if (code != 202) {
        Serial.printf("[crash-report] HTTP %d body: %s\n", code, http.getString().c_str());
    } else {
        Serial.printf("[crash-report] HTTP %d accepted\n", code);
    }
    http.end();
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
    Serial.printf("Device ID: %s (Wi-Fi MAC)\n", g_device_id);
    Serial.printf("HW %s  FW %s\n", FLEET_HW_VERSION, FLEET_FW_VERSION);
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
