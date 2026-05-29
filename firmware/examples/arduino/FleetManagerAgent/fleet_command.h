#pragma once

/*
 * Remote command handling for Fleet Manager heartbeat responses.
 * Persists last processed command_id so duplicate reboots are ignored.
 */

#include <Arduino.h>

#if defined(ESP8266)
#include <EEPROM.h>
#elif defined(ESP32)
#include <Preferences.h>
#else
#error "fleet_command.h supports ESP8266 and ESP32 only"
#endif

static bool g_fleet_reboot_requested = false;

static uint32_t fleet_command_parse_command_id(const String &body)
{
    const int key = body.indexOf("\"command_id\"");
    if (key < 0) {
        return 0;
    }

    const int colon = body.indexOf(':', key);
    if (colon < 0) {
        return 0;
    }

    int i = colon + 1;
    while (i < (int)body.length() && (body[i] == ' ' || body[i] == '\"')) {
        i++;
    }

    uint32_t value = 0;
    bool any = false;
    while (i < (int)body.length() && body[i] >= '0' && body[i] <= '9') {
        any = true;
        value = (value * 10U) + (uint32_t)(body[i] - '0');
        i++;
    }

    return any ? value : 0;
}

#if defined(ESP8266)

static const uint16_t FLEET_CMD_EEPROM_MAGIC = 0xFC01;
static const int FLEET_CMD_EEPROM_SIZE = 16;

static void fleet_command_storage_init()
{
    static bool initialized = false;
    if (!initialized) {
        EEPROM.begin(FLEET_CMD_EEPROM_SIZE);
        initialized = true;
    }
}

static uint32_t fleet_command_load_last_id()
{
    fleet_command_storage_init();

    uint16_t magic = 0;
    EEPROM.get(0, magic);
    if (magic != FLEET_CMD_EEPROM_MAGIC) {
        return 0;
    }

    uint32_t id = 0;
    EEPROM.get(4, id);
    return id;
}

static void fleet_command_save_last_id(uint32_t id)
{
    fleet_command_storage_init();

    const uint16_t magic = FLEET_CMD_EEPROM_MAGIC;
    EEPROM.put(0, magic);
    EEPROM.put(4, id);
    EEPROM.commit();
}

#elif defined(ESP32)

static uint32_t fleet_command_load_last_id()
{
    Preferences prefs;
    if (!prefs.begin("fleet_cmd", true)) {
        return 0;
    }
    const uint32_t id = prefs.getUInt("last_id", 0);
    prefs.end();
    return id;
}

static void fleet_command_save_last_id(uint32_t id)
{
    Preferences prefs;
    if (!prefs.begin("fleet_cmd", false)) {
        return;
    }
    prefs.putUInt("last_id", id);
    prefs.end();
}

#endif

static bool fleet_command_body_has_reboot(const String &body)
{
    return body.indexOf("\"command\"") >= 0 && body.indexOf("reboot") >= 0;
}

static bool fleet_command_handle_heartbeat_response(const String &body)
{
    if (!fleet_command_body_has_reboot(body)) {
        return false;
    }

    const uint32_t command_id = fleet_command_parse_command_id(body);
    if (command_id == 0) {
        Serial.println("[heartbeat] reboot command missing command_id — ignored");
        return false;
    }

    const uint32_t last_id = fleet_command_load_last_id();
    if (command_id == last_id) {
        Serial.printf(
            "[heartbeat] ignoring duplicate reboot command_id=%lu\n",
            (unsigned long)command_id);
        return false;
    }

    fleet_command_save_last_id(command_id);
    g_fleet_reboot_requested = true;
    Serial.printf(
        "[heartbeat] remote reboot queued (command_id=%lu)\n",
        (unsigned long)command_id);
    return true;
}

static void fleet_command_process_pending_reboot()
{
    if (!g_fleet_reboot_requested) {
        return;
    }

    Serial.println("[heartbeat] rebooting...");
    delay(1000);
    ESP.restart();
}
