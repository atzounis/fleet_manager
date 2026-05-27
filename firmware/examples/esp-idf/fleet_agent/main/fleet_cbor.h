#pragma once

#include <stddef.h>
#include <stdint.h>

size_t fleet_cbor_encode_heartbeat(
    uint8_t *out,
    size_t out_cap,
    uint32_t heap_free,
    uint32_t heap_min_free,
    int16_t wifi_rssi,
    uint16_t battery_mv,
    uint8_t battery_pct,
    int16_t cpu_temp_c);
