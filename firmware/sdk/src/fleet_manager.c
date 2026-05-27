/*
 * Reference stubs — implement HTTP client with esp_http_client (IDF) or
 * HTTPClient (Arduino). Keep panic-path code in a separate compilation unit
 * with zero heap allocation.
 */

#include "fleet_manager.h"
#include "fleet_cbor.h"

static fleet_config_t g_cfg;

void fleet_manager_init(const fleet_config_t *config)
{
    g_cfg = *config;
}

bool fleet_manager_heartbeat(
    uint32_t heap_free,
    uint32_t heap_min_free,
    int16_t wifi_rssi,
    uint16_t battery_mv)
{
    (void)heap_free;
    (void)heap_min_free;
    (void)wifi_rssi;
    (void)battery_mv;
    (void)g_cfg;
    /* TODO: esp_http_client POST application/cbor to {base_url}/api/v1/agent/heartbeat/ */
    return false;
}

bool fleet_manager_send_pending_crash(const uint8_t *dump, size_t dump_len, const char *panic_reason)
{
    (void)dump;
    (void)dump_len;
    (void)panic_reason;
    return false;
}

bool fleet_manager_ota_poll(void)
{
    /* TODO: GET {base_url}/api/v1/agent/ota-check/?hw_version=&fw_version= */
    return false;
}
