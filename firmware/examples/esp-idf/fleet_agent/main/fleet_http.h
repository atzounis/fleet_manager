#pragma once

#include <stdbool.h>
#include <stdint.h>

bool fleet_http_init(void);
bool fleet_http_send_heartbeat(void);
bool fleet_http_send_test_crash(void);
bool fleet_http_check_ota(void);
const char *fleet_http_device_id(void);
