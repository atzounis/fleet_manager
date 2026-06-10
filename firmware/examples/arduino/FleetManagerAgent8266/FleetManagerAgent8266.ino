/**
 * Fleet Manager — Arduino-ESP8266 example
 *
 * Features:
 * - MAC-address based unique device ID
 * - Optional human-readable device name
 * - WiFi heartbeat telemetry (CBOR)
 * - X-Device-Token auth (register device in dashboard first)
 * - OTA check + apply (ESP8266httpUpdate), polls every FLEET_OTA_MS
 * - Optional battery voltage on A0
 * - Remote reboot via heartbeat command
 *
 * Tested for:
 * - NodeMCU / Wemos D1 mini (ESP8266)
 * - Arduino-ESP8266 core 3.x
 *
 * Use FLEET_HW_VERSION "8266" in secrets.h so OTA deployments never mix
 * with ESP32 builds (different CPU and .bin format).
 */

#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include <ESP8266httpUpdate.h>
#include <WiFiClient.h>

#include "fleet_cbor.h"
#include "fleet_command.h"
#include "secrets.h"

#ifndef FLEET_DEVICE_TOKEN
#error "Define FLEET_DEVICE_TOKEN in secrets.h (register device in dashboard)"
#endif

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
#define FLEET_DEVICE_NAME "esp8266-device"
#endif

struct FleetTelemetry {
  uint32_t heap_free;
  uint32_t heap_min_free;
  int16_t wifi_rssi;
  uint16_t battery_mv;
  int16_t cpu_temp_c;
};

static char g_device_id[13];
static uint32_t g_min_heap_seen = UINT32_MAX;
static bool g_wifi_started = false;

static unsigned long g_last_heartbeat = 0;
static unsigned long g_last_ota = 0;

static void format_device_id(char *out, size_t out_len) {
#ifdef FLEET_DEVICE_ID
  strncpy(out, FLEET_DEVICE_ID, out_len);
  out[out_len - 1] = '\0';
#else
  uint8_t mac[6];
  WiFi.macAddress(mac);
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

static String api_url(const char *path) {
  return String("http://") +
         FLEET_API_HOST +
         ":" +
         String(FLEET_API_PORT) +
         path;
}

static void add_agent_headers(HTTPClient &http) {
  http.addHeader("X-Device-Id", g_device_id);
  http.addHeader("X-Device-Token", FLEET_DEVICE_TOKEN);
  http.addHeader("X-Device-Name", FLEET_DEVICE_NAME);
  http.addHeader("X-Hw-Version", FLEET_HW_VERSION);
  http.addHeader("X-Fw-Version", FLEET_FW_VERSION);
}

static String json_escape(const String &value) {
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

static uint16_t read_battery_mv() {
#if FLEET_BATTERY_ADC_PIN >= 0
  delay(5);
  uint32_t sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(FLEET_BATTERY_ADC_PIN);
    delay(2);
    yield();
  }
  const float raw = sum / 10.0f;
  /* ESP8266 ADC input is 0–1.0 V at the pin (after onboard divider on A0). */
  const float pin_voltage = (raw / 1023.0f) * 1.0f;
  const float battery_voltage = pin_voltage * FLEET_BATTERY_DIVIDER_RATIO;
  return (uint16_t)(battery_voltage * 1000.0f);
#else
  return 0;
#endif
}

static FleetTelemetry collect_telemetry() {
  FleetTelemetry t = {};
  t.heap_free = ESP.getFreeHeap();
  if (t.heap_free < g_min_heap_seen) {
    g_min_heap_seen = t.heap_free;
  }
  t.heap_min_free = g_min_heap_seen;
  t.wifi_rssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : -127;
  t.battery_mv = read_battery_mv();
  t.cpu_temp_c = 0;
  return t;
}

static bool wifi_connect() {
  if (!g_wifi_started) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    g_wifi_started = true;
  }
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }
  Serial.printf("WiFi connecting to %s", WIFI_SSID);
  for (int i = 0; i < 40; i++) {
    yield();
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

static bool send_heartbeat() {
  const FleetTelemetry t = collect_telemetry();

  uint8_t body[96];
  const size_t len = fleet_cbor_encode_heartbeat(
      body,
      sizeof(body),
      t.heap_free,
      t.heap_min_free,
      t.wifi_rssi,
      t.battery_mv,
      t.cpu_temp_c);
  if (len == 0) {
    Serial.println("[heartbeat] encode failed");
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(10000);
  const String url = api_url("/api/v1/agent/heartbeat/");
  if (!http.begin(client, url)) {
    Serial.println("[heartbeat] HTTP begin failed");
    return false;
  }

  add_agent_headers(http);
  http.addHeader("Content-Type", "application/cbor");

  Serial.printf("[heartbeat] device_id=%s sending...\n", g_device_id);

  const int code = http.POST(body, len);

  if (code == 200) {
    const String response = http.getString();
    Serial.printf(
        "[heartbeat] OK device_id=%s heap=%lu min_heap=%lu rssi=%d batt=%u mV\n",
        g_device_id,
        (unsigned long)t.heap_free,
        (unsigned long)t.heap_min_free,
        (int)t.wifi_rssi,
        (unsigned)t.battery_mv);
    http.end();
    fleet_command_handle_heartbeat_response(response);
    return true;
  }

  Serial.printf(
      "[heartbeat] device_id=%s HTTP %d body: %s\n",
      g_device_id,
      code,
      http.getString().c_str());

  http.end();
  return false;
}

static bool send_test_crash() {
  const uint8_t fake_dump[] = {
      0x45, 0x53, 0x50, 0x38, 0x32, 0x36, 0x36, 0x20,
      0x74, 0x65, 0x73, 0x74, 0x20, 0x63, 0x72, 0x61,
      0x73, 0x68,
  };

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(10000);
  const String url = api_url("/api/v1/agent/crash-report/");
  if (!http.begin(client, url)) {
    return false;
  }

  http.addHeader("Content-Type", "application/octet-stream");
  add_agent_headers(http);
  http.addHeader("X-Panic-Reason", "Arduino ESP8266 test crash");

  const int code = http.POST((uint8_t *)fake_dump, sizeof(fake_dump));

  if (code == 202) {
    Serial.println("[crash-report] accepted");
  } else {
    Serial.printf(
        "[crash-report] HTTP %d body: %s\n",
        code,
        http.getString().c_str());
  }

  http.end();
  return code == 202;
}

static void report_ota_status(
    const String &version,
    const char *status,
    const String &error) {
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(10000);
  const String url = api_url("/api/v1/agent/ota-report/");
  if (!http.begin(client, url)) {
    Serial.println("[ota-report] HTTP begin failed");
    return;
  }

  add_agent_headers(http);
  http.addHeader("Content-Type", "application/json");

  const String payload =
      String("{\"version\":\"") +
      json_escape(version) +
      "\",\"status\":\"" +
      status +
      "\",\"error\":\"" +
      json_escape(error) +
      "\"}";

  const int code = http.POST(payload);

  if (code == 200 || code == 202) {
    Serial.printf("[ota-report] %s sent\n", status);
  } else {
    Serial.printf("[ota-report] HTTP %d\n", code);
  }

  http.end();
}

static bool apply_ota_update(const String &ota_url, const String &target_version) {
  if (ota_url.isEmpty()) {
    Serial.println("[ota] update failed: empty download URL");
    if (!target_version.isEmpty()) {
      report_ota_status(target_version, "failed", "empty Location URL");
    }
    return false;
  }

  Serial.printf("[ota] downloading: %s\n", ota_url.c_str());

  WiFiClient client;
  client.setTimeout(30000);

  ESPhttpUpdate.rebootOnUpdate(false);

  const t_httpUpdate_return result =
      ESPhttpUpdate.update(client, ota_url, FLEET_FW_VERSION);

  if (result == HTTP_UPDATE_OK) {
    Serial.printf(
        "[ota] update applied, rebooting to %s\n",
        target_version.c_str());

    report_ota_status(target_version, "updated", "");
    delay(300);
    ESP.restart();
    return true;
  }

  if (result == HTTP_UPDATE_NO_UPDATES) {
    Serial.println("[ota] no updates from updater");
    return true;
  }

  const String err = String("err=") + String(ESPhttpUpdate.getLastError());

  Serial.printf(
      "[ota] update failed: %s (%s)\n",
      ESPhttpUpdate.getLastErrorString().c_str(),
      err.c_str());

  report_ota_status(target_version, "failed", err);
  return false;
}

static bool check_ota() {
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(10000);

  const String url =
      api_url("/api/v1/agent/ota-check/?device_id=") +
      g_device_id +
      "&hw_version=" +
      FLEET_HW_VERSION +
      "&fw_version=" +
      FLEET_FW_VERSION;

  Serial.printf("[ota] checking for update (fw %s)...\n", FLEET_FW_VERSION);

  if (!http.begin(client, url)) {
    Serial.println("[ota] HTTP begin failed");
    return false;
  }

  add_agent_headers(http);

  /* Must not follow 302 — presigned URL is in Location / X-Firmware-Version. */
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);

  const char *collectKeys[] = {"X-Firmware-Version", "Location"};
  http.collectHeaders(collectKeys, 2);

  const int code = http.GET();

  if (code == 302) {
    String location = http.getLocation();
    if (location.isEmpty()) {
      location = http.header("Location");
    }

    const String target_version = http.header("X-Firmware-Version");

    Serial.printf("[ota] update available: %s\n", location.c_str());
    Serial.printf("[ota] version: %s\n", target_version.c_str());

    http.end();

    if (location.isEmpty()) {
      Serial.println(
          "[ota] 302 without Location — check AWS_S3_PUBLIC_ENDPOINT_URL");
      return false;
    }

    return apply_ota_update(location, target_version);
  }

  if (code == 204) {
    Serial.println("[ota] no update");
  } else {
    Serial.printf("[ota] HTTP %d\n", code);
  }

  http.end();
  return code == 204;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n=== Fleet Manager Arduino Agent (ESP8266) ===");

  WiFi.setSleepMode(WIFI_NONE_SLEEP);

  Serial.printf("Chip ID: 0x%06X\n", ESP.getChipId());

  format_device_id(g_device_id, sizeof(g_device_id));

  Serial.printf("Device ID: %s\n", g_device_id);
  Serial.printf("Device Name: %s\n", FLEET_DEVICE_NAME);
  Serial.printf("HW %s FW %s\n", FLEET_HW_VERSION, FLEET_FW_VERSION);
  Serial.printf("API: http://%s:%d\n", FLEET_API_HOST, FLEET_API_PORT);
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

  check_ota();
  g_last_ota = millis();
}

void loop() {
  fleet_command_process_pending_reboot();

  if (!wifi_connect()) {
    delay(5000);
    return;
  }

  const unsigned long now = millis();

  if (now - g_last_heartbeat >= FLEET_HEARTBEAT_MS) {
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
