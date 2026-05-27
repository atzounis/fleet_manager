#pragma once

#include <stdbool.h>
#include <stdint.h>

bool fleet_http_init(void);
bool fleet_http_send_heartbeat(void);
bool fleet_http_send_test_crash(void);
bool fleet_http_check_ota(void);
bool fleet_http_report_ota_status(const char *version, const char *status, const char *error);
const char *fleet_http_device_id(void);
