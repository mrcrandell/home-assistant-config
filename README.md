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

## Security and Privacy

This public repository includes installation-specific entity IDs, device names, and routines. Review those details before adapting the configuration for another home. Keep credentials in local `secrets.yaml` files and never commit secret values or private keys.
