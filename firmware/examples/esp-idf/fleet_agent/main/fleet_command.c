#include "fleet_command.h"

#include <ctype.h>
#include <stdlib.h>
#include <string.h>

#include "esp_log.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs.h"
#include "nvs_flash.h"

static const char *TAG = "fleet_cmd";
static const char *NVS_NAMESPACE = "fleet_cmd";
static const char *NVS_LAST_ID_KEY = "last_id";

static bool s_reboot_requested = false;

static uint32_t fleet_command_parse_command_id(const char *body, size_t len)
{
    if (!body || len == 0) {
        return 0;
    }

    const char *key = strstr(body, "\"command_id\"");
    if (!key) {
        return 0;
    }

    const char *colon = strchr(key, ':');
    if (!colon) {
        return 0;
    }

    const char *cursor = colon + 1;
    while (cursor < body + len && (*cursor == ' ' || *cursor == '\"')) {
        cursor++;
    }

    if (cursor >= body + len || !isdigit((unsigned char)*cursor)) {
        return 0;
    }

    return (uint32_t)strtoul(cursor, NULL, 10);
}

static bool body_has_reboot_command(const char *body, size_t len)
{
    if (!body || len == 0) {
        return false;
    }

    char scratch[128];
    size_t copy_len = len;
    if (copy_len >= sizeof(scratch)) {
        copy_len = sizeof(scratch) - 1;
    }
    memcpy(scratch, body, copy_len);
    scratch[copy_len] = '\0';

    return strstr(scratch, "command") != NULL && strstr(scratch, "reboot") != NULL;
}

static uint32_t fleet_command_load_last_id(void)
{
    nvs_handle_t handle;
    if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) {
        return 0;
    }

    uint32_t last_id = 0;
    esp_err_t err = nvs_get_u32(handle, NVS_LAST_ID_KEY, &last_id);
    nvs_close(handle);
    return err == ESP_OK ? last_id : 0;
}

static void fleet_command_save_last_id(uint32_t command_id)
{
    nvs_handle_t handle;
    if (nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK) {
        return;
    }

    nvs_set_u32(handle, NVS_LAST_ID_KEY, command_id);
    nvs_commit(handle);
    nvs_close(handle);
}

bool fleet_command_handle_heartbeat_response(const char *body, size_t len)
{
    if (!body_has_reboot_command(body, len)) {
        return false;
    }

    const uint32_t command_id = fleet_command_parse_command_id(body, len);
    if (command_id == 0) {
        ESP_LOGW(TAG, "reboot command missing command_id — ignored");
        return false;
    }

    const uint32_t last_id = fleet_command_load_last_id();
    if (command_id == last_id) {
        ESP_LOGI(TAG, "ignoring duplicate reboot command_id=%lu", (unsigned long)command_id);
        return false;
    }

    fleet_command_save_last_id(command_id);
    s_reboot_requested = true;
    ESP_LOGI(TAG, "remote reboot queued (command_id=%lu)", (unsigned long)command_id);
    return true;
}

void fleet_http_process_pending_reboot(void)
{
    if (!s_reboot_requested) {
        return;
    }

    ESP_LOGI(TAG, "rebooting...");
    vTaskDelay(pdMS_TO_TICKS(1000));
    esp_restart();
}
