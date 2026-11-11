# Home Assistant Configuration

Personal Home Assistant and ESPHome configuration. Entity IDs, device names, and automations are tailored to one installation; this is not a turnkey configuration for another home.

## Contents

- `configuration.yaml`, `automations.yaml`, `scripts.yaml`, and `scenes.yaml` define Home Assistant behavior.
- `esphome/` contains an ESP32 Bluetooth proxy configuration for a BLE light controller.
- `custom_components/` contains local copies of the HACS and Alexa Media integrations.
- `blueprints/` contains reusable Home Assistant automation, script, and template blueprints.

## Local Setup

Install Home Assistant and the integrations required by the configuration, then place the repository contents in the Home Assistant configuration directory. Review the entity IDs and device-specific settings before loading it.

Keep local values in separate files:

- `secrets.yaml` for Home Assistant secrets.
- `esphome/secrets.yaml` for ESPHome secrets such as `wifi_ssid`, `wifi_password`, `esphome_api_encryption_key`, and `c9_lights_mac_address`.
- Lutron client private keys must remain local.

Validate the Home Assistant and ESPHome configurations with their respective tools before deploying changes. Never commit local secret files or private keys.

## Before Publishing

Review the configuration for household details, device placement, security devices, and routines that should not be public. Ensure `.gitignore` excludes `secrets.yaml`, `esphome/secrets.yaml`, `.env` files, and private keys. Check every branch and tag, not only the current files. If credentials appeared in any published history, rotate them; removing a value from the latest commit does not revoke it or erase copies of old commits.
