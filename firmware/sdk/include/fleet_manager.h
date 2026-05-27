#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const char *base_url;
    const char *device_id;   /* 12-char lowercase hex MAC */
    const char *hw_version;
    const char *fw_version;
} fleet_config_t;

void fleet_manager_init(const fleet_config_t *config);

/** Encode and POST CBOR heartbeat. Returns true on HTTP 200. */
bool fleet_manager_heartbeat(
    uint32_t heap_free,
    uint32_t heap_min_free,
    int16_t wifi_rssi,
    uint16_t battery_mv
);

/** POST pending crash dump from RTC/SPIFFS if present. */
bool fleet_manager_send_pending_crash(const uint8_t *dump, size_t dump_len, const char *panic_reason);

/** Poll OTA; follows 302 to signed URL when update available. */
bool fleet_manager_ota_poll(void);

#ifdef __cplusplus
}
#endif
