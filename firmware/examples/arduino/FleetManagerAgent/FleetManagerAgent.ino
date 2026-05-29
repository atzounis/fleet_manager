/**
 * Fleet Manager — Arduino-ESP32 example
 *
 * Features:
 * - MAC-address based unique device ID
 * - Optional human-readable device name
 * - WiFi heartbeat telemetry
 * - CBOR payloads
 * - OTA check + apply (HTTPUpdate), polls every FLEET_OTA_MS
 * - ESP32 internal temperature reading
 * - Optional battery voltage monitoring
 *
 * Tested for:
 * - ESP32-WROVER
 * - Arduino-ESP32
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
#include <HTTPUpdate.h>
#include <esp_mac.h>
#include <esp_system.h>

#include "fleet_cbor.h"
#include "fleet_command.h"
#include "secrets.h"

/* =========================================================
 * Defaults
 * ========================================================= */

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

#ifndef FLEET_DEVICE_NAME
#define FLEET_DEVICE_NAME "esp32-device"
#endif

/* =========================================================
 * Telemetry Structure
 * ========================================================= */

struct FleetTelemetry {
    uint32_t heap_free;
    uint32_t heap_min_free;
    int16_t wifi_rssi;
    uint16_t battery_mv;
    int16_t cpu_temp_c;
};

/* =========================================================
 * Globals
 * ========================================================= */

static char g_device_id[13];

static unsigned long g_last_heartbeat = 0;
static unsigned long g_last_ota = 0;

/* =========================================================
 * Device ID
 * ========================================================= */

static void format_device_id(char *out, size_t out_len)
{
#ifdef FLEET_DEVICE_ID

    strncpy(out, FLEET_DEVICE_ID, out_len);
    out[out_len - 1] = '\0';

#else

    uint8_t mac[6];

    esp_read_mac(mac, ESP_MAC_WIFI_STA);

    snprintf(
        out,
        out_len,
        "%02x%02x%02x%02x%02x%02x",
        mac[0],
        mac[1],
        mac[2],
        mac[3],
        mac[4],
        mac[5]);

#endif
}

/* =========================================================
 * Helpers
 * ========================================================= */

static String api_url(const char *path)
{
    return String("http://") +
           FLEET_API_HOST +
           ":" +
           String(FLEET_API_PORT) +
           path;
}

static void add_agent_headers(HTTPClient &http)
{
    http.addHeader("X-Device-Id", g_device_id);
    http.addHeader("X-Device-Name", FLEET_DEVICE_NAME);

    http.addHeader("X-Hw-Version", FLEET_HW_VERSION);
    http.addHeader("X-Fw-Version", FLEET_FW_VERSION);
}

static String json_escape(const String &value)
{
    String out;
    out.reserve(value.length() + 8);
    for (size_t i = 0; i < value.length(); i++) {
        const char c = value.charAt(i);
        if (c == '\\' || c == '"') {
            out += '\\';
        }
        out += c;
    }
    return out;
}

/* =========================================================
 * Battery Voltage
 * ========================================================= */

static uint16_t read_battery_mv()
{
#if FLEET_BATTERY_ADC_PIN >= 0

    analogReadResolution(12);

    analogSetPinAttenuation(
        FLEET_BATTERY_ADC_PIN,
        ADC_11db);

    delay(5);

    uint32_t sum = 0;

    for (int i = 0; i < 10; i++) {
        sum += analogRead(FLEET_BATTERY_ADC_PIN);
        delay(2);
    }

    const float raw = sum / 10.0f;

    /*
     * ADC correction factor.
     * ESP32 ADC often reads slightly low.
     */
    const float ADC_REFERENCE = 3.3f;
    const float ADC_CORRECTION = 1.08f;

    const float pin_voltage =
        (raw / 4095.0f) *
        ADC_REFERENCE *
        ADC_CORRECTION;

    const float battery_voltage =
        pin_voltage *
        FLEET_BATTERY_DIVIDER_RATIO;

    return (uint16_t)(battery_voltage * 1000.0f);

#else

    return 0;

#endif
}

/* =========================================================
 * CPU Temperature
 * ========================================================= */

static int16_t read_cpu_temp_c()
{
    /*
     * Undocumented ESP32 ROM function.
     * Works on ESP32/WROVER but is not calibrated.
     */

    return (int16_t)((temprature_sens_read() - 32) / 1.8f);
}

/* =========================================================
 * Collect Telemetry
 * ========================================================= */

static FleetTelemetry collect_telemetry()
{
    FleetTelemetry t = {};

    t.heap_free = ESP.getFreeHeap();

    t.heap_min_free = ESP.getMinFreeHeap();

    t.wifi_rssi =
        (WiFi.status() == WL_CONNECTED)
            ? WiFi.RSSI()
            : -127;

    t.battery_mv = read_battery_mv();

    t.cpu_temp_c = read_cpu_temp_c();

    return t;
}

/* =========================================================
 * WiFi
 * ========================================================= */

static bool wifi_connect()
{
    if (WiFi.status() == WL_CONNECTED) {
        return true;
    }

    WiFi.mode(WIFI_STA);

    WiFi.begin(
        WIFI_SSID,
        WIFI_PASSWORD);

    Serial.printf(
        "WiFi connecting to %s",
        WIFI_SSID);

    for (int i = 0; i < 40; i++) {

        if (WiFi.status() == WL_CONNECTED) {

            Serial.printf(
                "\nWiFi OK\nIP=%s RSSI=%d\n",
                WiFi.localIP().toString().c_str(),
                WiFi.RSSI());

            return true;
        }

        Serial.print('.');

        delay(500);
    }

    Serial.println("\nWiFi failed");

    return false;
}

/* =========================================================
 * Heartbeat
 * ========================================================= */

static bool send_heartbeat()
{
    const FleetTelemetry t =
        collect_telemetry();

    uint8_t body[96];

    size_t len =
        fleet_cbor_encode_heartbeat(
            body,
            sizeof(body),

            t.heap_free,
            t.heap_min_free,

            t.wifi_rssi,

            t.battery_mv,

            t.cpu_temp_c);

    HTTPClient http;

    String url =
        api_url("/api/v1/agent/heartbeat/");

    http.begin(url);

    add_agent_headers(http);

    http.addHeader(
        "Content-Type",
        "application/cbor");

    int code =
        http.POST(body, len);

    if (code == 200) {

        String response = http.getString();

        Serial.printf(
            "[heartbeat] OK "
            "heap=%lu "
            "min_heap=%lu "
            "rssi=%d "
            "batt=%u mV "
            "cpu=%dC\n",

            (unsigned long)t.heap_free,

            (unsigned long)t.heap_min_free,

            (int)t.wifi_rssi,

            (unsigned)t.battery_mv,

            (int)t.cpu_temp_c);

        http.end();

        fleet_command_handle_heartbeat_response(response);

        return true;

    } else {

        Serial.printf(
            "[heartbeat] HTTP %d body: %s\n",
            code,
            http.getString().c_str());
    }

    http.end();

    return false;
}

/* =========================================================
 * Test Crash Upload
 * ========================================================= */

static bool send_test_crash()
{
    const uint8_t fake_dump[] = {
        0x45, 0x53, 0x50, 0x33,
        0x32, 0x20, 0x74, 0x65,
        0x73, 0x74, 0x20, 0x63,
        0x72, 0x61, 0x73, 0x68,
    };

    HTTPClient http;

    String url =
        api_url("/api/v1/agent/crash-report/");

    http.begin(url);

    http.addHeader(
        "Content-Type",
        "application/octet-stream");

    add_agent_headers(http);

    http.addHeader(
        "X-Panic-Reason",
        "Arduino test crash");

    int code =
        http.POST(
            (uint8_t *)fake_dump,
            sizeof(fake_dump));

    if (code == 202) {

        Serial.printf(
            "[crash-report] accepted\n");

    } else {

        Serial.printf(
            "[crash-report] HTTP %d body: %s\n",
            code,
            http.getString().c_str());
    }

    http.end();

    return code == 202;
}

/* =========================================================
 * OTA
 * ========================================================= */

static void report_ota_status(
    const String &version,
    const char *status,
    const String &error)
{
    HTTPClient http;

    String url =
        api_url("/api/v1/agent/ota-report/");

    http.begin(url);

    add_agent_headers(http);

    http.addHeader(
        "Content-Type",
        "application/json");

    String payload =
        String("{\"version\":\"") +
        json_escape(version) +
        "\",\"status\":\"" +
        status +
        "\",\"error\":\"" +
        json_escape(error) +
        "\"}";

    int code =
        http.POST(payload);

    if (code == 200 || code == 202) {
        Serial.printf(
            "[ota-report] %s sent\n",
            status);
    } else {
        Serial.printf(
            "[ota-report] HTTP %d\n",
            code);
    }

    http.end();
}

static bool apply_ota_update(
    const String &ota_url,
    const String &target_version)
{
    if (ota_url.isEmpty()) {
        Serial.println("[ota] update failed: empty download URL");
        if (!target_version.isEmpty()) {
            report_ota_status(target_version, "failed", "empty Location URL");
        }
        return false;
    }

    Serial.printf(
        "[ota] downloading: %s\n",
        ota_url.c_str());

    WiFiClient client;
    client.setTimeout(30000);

    httpUpdate.rebootOnUpdate(false);

    t_httpUpdate_return result =
        httpUpdate.update(
            client,
            ota_url,
            FLEET_FW_VERSION);

    if (result == HTTP_UPDATE_OK) {
        Serial.printf(
            "[ota] update applied, rebooting to %s\n",
            target_version.c_str());

        report_ota_status(
            target_version,
            "updated",
            "");

        delay(300);
        ESP.restart();
        return true;
    }

    if (result == HTTP_UPDATE_NO_UPDATES) {
        Serial.println("[ota] no updates from updater");
        return true;
    }

    String err =
        String("err=") +
        String(httpUpdate.getLastError());

    Serial.printf(
        "[ota] update failed: %s (%s)\n",
        httpUpdate.getLastErrorString().c_str(),
        err.c_str());

    report_ota_status(
        target_version,
        "failed",
        err);

    return false;
}

static bool check_ota()
{
    HTTPClient http;

    String url =
        api_url("/api/v1/agent/ota-check/?device_id=") +
        g_device_id +
        "&hw_version=" +
        FLEET_HW_VERSION +
        "&fw_version=" +
        FLEET_FW_VERSION;

    Serial.printf(
        "[ota] checking for update (fw %s)...\n",
        FLEET_FW_VERSION);

    http.begin(url);

    add_agent_headers(http);

    /* Must not follow 302 — presigned URL is in Location / X-Firmware-Version. */
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);

    const char *collectKeys[] = {"X-Firmware-Version"};
    http.collectHeaders(collectKeys, 1);

    int code =
        http.GET();

    if (code == 302) {
        String location = http.getLocation();
        if (location.isEmpty()) {
            location = http.header("Location");
        }

        String target_version =
            http.header("X-Firmware-Version");

        Serial.printf(
            "[ota] update available: %s\n",
            location.c_str());

        Serial.printf(
            "[ota] version: %s\n",
            target_version.c_str());

        http.end();

        if (location.isEmpty()) {
            Serial.println(
                "[ota] 302 without Location — check AWS_S3_PUBLIC_ENDPOINT_URL");
            return false;
        }

        return apply_ota_update(
            location,
            target_version);

    } else if (code == 204) {

        Serial.println("[ota] no update");

    } else {

        Serial.printf(
            "[ota] HTTP %d\n",
            code);
    }

    http.end();

    return code == 204;
}

/* =========================================================
 * Setup
 * ========================================================= */

void setup()
{
    Serial.begin(115200);

    delay(500);

    Serial.println(
        "\n=== Fleet Manager Arduino Agent ===");

    Serial.printf(
        "Chip: %s\n",
        ESP.getChipModel());

    format_device_id(
        g_device_id,
        sizeof(g_device_id));

    Serial.printf(
        "Device ID: %s\n",
        g_device_id);

    Serial.printf(
        "Device Name: %s\n",
        FLEET_DEVICE_NAME);

    Serial.printf(
        "HW %s FW %s\n",
        FLEET_HW_VERSION,
        FLEET_FW_VERSION);

    Serial.printf(
        "API: http://%s:%d\n",
        FLEET_API_HOST,
        FLEET_API_PORT);

    Serial.printf(
        "OTA poll every %lu s\n",
        (unsigned long)(FLEET_OTA_MS / 1000UL));

    if (!wifi_connect()) {
        return;
    }

#if FLEET_SEND_TEST_CRASH

    send_test_crash();

#endif

    send_heartbeat();

    g_last_heartbeat = millis();

    /* First OTA check right after boot; loop repeats every FLEET_OTA_MS. */
    check_ota();
    g_last_ota = millis();
}

/* =========================================================
 * Main Loop
 * ========================================================= */

void loop()
{
    fleet_command_process_pending_reboot();

    if (!wifi_connect()) {

        delay(5000);

        return;
    }

    unsigned long now = millis();

    if (now - g_last_heartbeat >=
        FLEET_HEARTBEAT_MS) {

        send_heartbeat();

        g_last_heartbeat = now;
    }

    if (now - g_last_ota >= FLEET_OTA_MS) {
        Serial.println("[ota] periodic check");
        check_ota();
        g_last_ota = now;
    }

    delay(1000);
}