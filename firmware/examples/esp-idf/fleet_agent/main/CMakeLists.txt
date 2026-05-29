idf_component_register(
    SRCS "main.c" "fleet_http.c" "fleet_cbor.c" "fleet_command.c"
    INCLUDE_DIRS "."
    REQUIRES esp_wifi esp_event esp_netif nvs_flash esp_http_client esp_https_ota app_update esp_timer
)
