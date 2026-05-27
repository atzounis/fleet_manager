/**
 * Fleet Manager — ESP-IDF / FreeRTOS example
 *
 * Wi-Fi station + background tasks for heartbeat and OTA polling.
 */

#include <string.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "fleet_http.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"

static const char *TAG = "fleet_agent";

static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG, "Wi-Fi disconnected, reconnecting...");
        esp_wifi_connect();
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
    }
}

static void wifi_init_sta(void)
{
    esp_netif_init();
    esp_event_loop_create_default();
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);

    esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL);
    esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL);

    wifi_config_t wifi_config = {0};
    strncpy((char *)wifi_config.sta.ssid, CONFIG_FLEET_WIFI_SSID, sizeof(wifi_config.sta.ssid) - 1);
    strncpy((char *)wifi_config.sta.password, CONFIG_FLEET_WIFI_PASSWORD, sizeof(wifi_config.sta.password) - 1);

    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    esp_wifi_start();
    esp_wifi_connect();
}

static void heartbeat_task(void *arg)
{
    const int interval_ms = CONFIG_FLEET_HEARTBEAT_INTERVAL_SEC * 1000;
    (void)arg;

    vTaskDelay(pdMS_TO_TICKS(3000));
    for (;;) {
        fleet_http_send_heartbeat();
        vTaskDelay(pdMS_TO_TICKS(interval_ms));
    }
}

static void ota_task(void *arg)
{
    const int interval_ms = CONFIG_FLEET_OTA_INTERVAL_SEC * 1000;
    (void)arg;

    vTaskDelay(pdMS_TO_TICKS(5000));
    for (;;) {
        fleet_http_check_ota();
        vTaskDelay(pdMS_TO_TICKS(interval_ms));
    }
}

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_LOGI(TAG, "Fleet Manager ESP-IDF agent starting");
    wifi_init_sta();
    fleet_http_init();

    vTaskDelay(pdMS_TO_TICKS(4000));

#if CONFIG_FLEET_SEND_TEST_CRASH
    fleet_http_send_test_crash();
#endif

    fleet_http_send_heartbeat();

    xTaskCreate(heartbeat_task, "fleet_hb", 8192, NULL, 5, NULL);
    xTaskCreate(ota_task, "fleet_ota", 8192, NULL, 4, NULL);

    ESP_LOGI(TAG, "Tasks running (device %s)", fleet_http_device_id());
}
