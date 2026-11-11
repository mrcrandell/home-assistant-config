# Home Assistant Configuration

## Local Secret-File Setup

The repository uses separate secret-file locations for Home Assistant and ESPHome:

- `secrets.yaml` for Home Assistant.
- `esphome/secrets.yaml` for ESPHome.
- `.env` as an optional scaffold for tools that explicitly read environment files; Home Assistant does not load it automatically.
- Lutron client private keys (`lutron_caseta-*-key.pem`) remain local and are ignored by Git.

The setup helpers create ignored files when missing, preserve local values, and recover the ESPHome API key and BLE controller address from the current config or local Git history into `esphome/secrets.yaml`. They do not change tracked configuration. The HAOS helper preserves existing Wi-Fi secrets and reports missing `!secret` names without printing values.

First, run on Home Assistant OS from the repository checkout under `/config`:

```sh
sh scripts/setup-secrets-haos.sh --dry-run
sh scripts/setup-secrets-haos.sh
```

Then, on macOS with Node.js installed, import the Pi's ignored files over SSH. Configure an SSH alias in `~/.ssh/config` and replace `pi-alias` below with that alias:

```sh
node scripts/setup-secrets.mjs --dry-run --sync-from pi-alias
node scripts/setup-secrets.mjs --sync-from pi-alias
```

The Mac helper merges remote values into local files without printing them; existing Mac values win if a key already exists. `.env` remains a comment-only scaffold because Home Assistant and ESPHome do not load it. After both machines report the required secret names are present, the tracked config can be changed to reference them. Never commit the generated files.

This removes inline values from the current config only. Before making the repository public, replace its history with a clean initial commit or otherwise purge old commits, and rotate the ESPHome API encryption key and any exposed Lutron private key; earlier commits contain these credentials.
