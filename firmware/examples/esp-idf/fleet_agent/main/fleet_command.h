#pragma once

#include <stdbool.h>
#include <stddef.h>

bool fleet_command_handle_heartbeat_response(const char *body, size_t len);
void fleet_http_process_pending_reboot(void);
