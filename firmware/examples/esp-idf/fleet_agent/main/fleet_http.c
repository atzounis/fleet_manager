#include "fleet_http.h"

#include <stdio.h>
#include <string.h>

#include "esp_heap_caps.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_wifi.h"
#include "fleet_cbor.h"

static const char *TAG = "fleet_http";

static char s_device_id[13];

static esp_err_t http_event(esp_http_client_event_t *evt)
{
    return ESP_OK;
}

static void set_common_headers(esp_http_client_handle_t client)
{
    esp_http_client_set_header(client, "X-Device-Id", s_device_id);
    esp_http_client_set_header(client, "X-Hw-Version", CONFIG_FLEET_HW_VERSION);
    esp_http_client_set_header(client, "X-Fw-Version", CONFIG_FLEET_FW_VERSION);
}

bool fleet_http_init(void)
{
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(s_device_id, sizeof(s_device_id), "%02x%02x%02x%02x%02x%02x",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    ESP_LOGI(TAG, "device_id=%s api=%s", s_device_id, CONFIG_FLEET_API_BASE_URL);
    return true;
}

const char *fleet_http_device_id(void)
{
    return s_device_id;
}

bool fleet_http_send_heartbeat(void)
{
    uint8_t body[64];
    wifi_ap_record_t ap = {0};
    int16_t rssi = -127;
    if (esp_wifi_sta_get_ap_info(&ap) == ESP_OK) {
        rssi = ap.rssi;
    }

    size_t len = fleet_cbor_encode_heartbeat(
        body, sizeof(body),
        (uint32_t)heap_caps_get_free_size(MALLOC_CAP_DEFAULT),
        (uint32_t)heap_caps_get_minimum_free_size(MALLOC_CAP_DEFAULT),
        rssi,
        0,   /* battery_mv unknown */
        255, /* battery_pct unknown */
        -127 /* cpu_temp_c unknown */
    );

    char url[160];
    snprintf(url, sizeof(url), "%s/api/v1/agent/heartbeat/", CONFIG_FLEET_API_BASE_URL);

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .event_handler = http_event,
        .timeout_ms = 15000,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    esp_http_client_set_header(client, "Content-Type", "application/cbor");
    set_common_headers(client);
    esp_http_client_set_post_field(client, (const char *)body, len);

    esp_err_t err = esp_http_client_perform(client);
    int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    ESP_LOGI(TAG, "heartbeat err=%s status=%d", esp_err_to_name(err), status);
    return err == ESP_OK && status == 200;
}

bool fleet_http_send_test_crash(void)
{
    static const uint8_t fake_dump[] = {
        0x45, 0x53, 0x50, 0x33, 0x32, 0x20, 0x74, 0x65,
        0x73, 0x74, 0x20, 0x63, 0x72, 0x61, 0x73, 0x68,
    };

    char url[160];
    snprintf(url, sizeof(url), "%s/api/v1/agent/crash-report/", CONFIG_FLEET_API_BASE_URL);

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .event_handler = http_event,
        .timeout_ms = 15000,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    esp_http_client_set_header(client, "Content-Type", "application/octet-stream");
    set_common_headers(client);
    esp_http_client_set_header(client, "X-Panic-Reason", "ESP-IDF test crash (simulated)");
    esp_http_client_set_post_field(client, (const char *)fake_dump, sizeof(fake_dump));

    esp_err_t err = esp_http_client_perform(client);
    int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    ESP_LOGI(TAG, "crash-report err=%s status=%d", esp_err_to_name(err), status);
    return err == ESP_OK && status == 202;
}

bool fleet_http_check_ota(void)
{
    char url[256];
    snprintf(url, sizeof(url),
             "%s/api/v1/agent/ota-check/?device_id=%s&hw_version=%s&fw_version=%s",
             CONFIG_FLEET_API_BASE_URL,
             s_device_id,
             CONFIG_FLEET_HW_VERSION,
             CONFIG_FLEET_FW_VERSION);

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .event_handler = http_event,
        .timeout_ms = 15000,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    set_common_headers(client);

    esp_err_t err = esp_http_client_perform(client);
    int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    ESP_LOGI(TAG, "ota-check err=%s status=%d", esp_err_to_name(err), status);
    return err == ESP_OK && (status == 204 || status == 302);
}
