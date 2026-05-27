#include "fleet_cbor.h"

static size_t write_uint32(uint8_t *out, uint32_t v)
{
    if (v < 24) {
        out[0] = (uint8_t)v;
        return 1;
    }
    out[0] = 0x1a;
    out[1] = (uint8_t)((v >> 24) & 0xff);
    out[2] = (uint8_t)((v >> 16) & 0xff);
    out[3] = (uint8_t)((v >> 8) & 0xff);
    out[4] = (uint8_t)(v & 0xff);
    return 5;
}

static size_t write_text_key(uint8_t *out, const char *key)
{
    size_t len = 0;
    while (key[len] != '\0') {
        len++;
    }
    if (len < 24) {
        out[0] = (uint8_t)(0x60 + len);
    } else {
        out[0] = 0x78;
        out[1] = (uint8_t)len;
        for (size_t i = 0; i < len; i++) {
            out[2 + i] = (uint8_t)key[i];
        }
        return 2 + len;
    }
    for (size_t i = 0; i < len; i++) {
        out[1 + i] = (uint8_t)key[i];
    }
    return 1 + len;
}

static size_t write_int(int32_t v, uint8_t *out)
{
    if (v >= 0) {
        return write_uint32(out, (uint32_t)v);
    }
    uint32_t u = (uint32_t)(-(v + 1));
    if (u < 24) {
        out[0] = (uint8_t)(0x20 + u);
        return 1;
    }
    out[0] = 0x38;
    out[1] = (uint8_t)u;
    return 2;
}

size_t fleet_cbor_encode_heartbeat(
    uint8_t *out,
    size_t out_cap,
    uint32_t heap_free,
    uint32_t heap_min_free,
    int16_t wifi_rssi,
    uint16_t battery_mv,
    int16_t cpu_temp_c)
{
    if (out_cap < 96) {
        return 0;
    }

    size_t i = 0;
    out[i++] = 0xa5; /* map(6) */

    i += write_text_key(out + i, "heap_free");
    i += write_uint32(out + i, heap_free);

    i += write_text_key(out + i, "heap_min_free");
    i += write_uint32(out + i, heap_min_free);

    i += write_text_key(out + i, "wifi_rssi");
    i += write_int(wifi_rssi, out + i);

    i += write_text_key(out + i, "battery_mv");
    i += write_uint32(out + i, battery_mv);


    i += write_text_key(out + i, "cpu_temp_c");
    i += write_int(cpu_temp_c, out + i);

    return i;
}
