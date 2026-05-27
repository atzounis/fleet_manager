#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Minimal CBOR map encoder for heartbeat fields. */
size_t fleet_cbor_encode_heartbeat(
    uint8_t *out,
    size_t out_cap,
    uint32_t heap_free,
    uint32_t heap_min_free,
    int16_t wifi_rssi,
    uint16_t battery_mv
);

#ifdef __cplusplus
}
#endif
