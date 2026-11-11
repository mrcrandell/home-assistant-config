#!/bin/sh

set -eu
umask 077

dry_run=false
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=true
  shift
fi
if [ "$#" -gt 0 ]; then
  printf '%s\n' "Usage: sh scripts/setup-secrets-haos.sh [--dry-run]" >&2
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
cd "$repo_root"

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  printf '%s\n' "Run this helper from the repository checkout under /config." >&2
  exit 1
fi

for path in secrets.yaml esphome/secrets.yaml .env; do
  if ! git check-ignore -q -- "$path"; then
    printf 'Refusing to create %s because Git does not ignore it.\n' "$path" >&2
    exit 1
  fi
done

create_if_missing() {
  path=$1
  if [ -e "$path" ]; then
    cat >/dev/null
    printf 'Preserved existing %s\n' "$path"
  elif [ "$dry_run" = true ]; then
    cat >/dev/null
    printf 'Would create %s\n' "$path"
  elif (set -C; cat > "$path"); then
    chmod 600 "$path"
    printf 'Created %s\n' "$path"
  elif [ -e "$path" ]; then
    printf 'Preserved existing %s\n' "$path"
  else
    printf 'Could not create %s\n' "$path" >&2
    return 1
  fi
}

create_if_missing secrets.yaml <<'EOF'
# Home Assistant secrets. Add local values here when ready to migrate settings.
EOF

create_if_missing esphome/secrets.yaml <<'EOF'
# ESPHome secrets. Add local values here when ready to migrate settings.
# wifi_ssid: ""
# wifi_password: ""
# esphome_api_encryption_key: ""
EOF

create_if_missing .env <<'EOF'
# Optional variables for local tools that explicitly load this file.
EOF

config_file=esphome/esp32-bluetooth-proxy-2df374.yaml
secrets_file=esphome/secrets.yaml
extract_value() {
  awk -v secret="$1" '
    {
      if (secret == "esphome_api_encryption_key") {
        if ($0 ~ /^api:[[:space:]]*$/) { in_api=1; next }
        if (in_api && $0 ~ /^ota:/) exit
        if (in_api && $0 ~ /^    key:[[:space:]]*/) {
          sub(/^    key:[[:space:]]*/, "")
          gsub(/"/, "")
          if ($0 !~ /^!/) print
          exit
        }
      }
      if (secret == "c9_lights_mac_address") {
        if ($0 ~ /^ble_client:[[:space:]]*$/) { in_ble=1; next }
        if (in_ble && $0 ~ /^api:/) exit
        if (in_ble && $0 ~ /^  - id:/) { in_target=($3 == "c9_lights"); next }
        if (in_target && $0 ~ /^    mac_address:[[:space:]]*/) {
          sub(/^    mac_address:[[:space:]]*/, "")
          gsub(/"/, "")
          if ($0 !~ /^!/) print
          exit
        }
      }
    }
  '
}

find_value() {
  secret=$1
  value=$(extract_value "$secret" < "$config_file")
  if [ -n "$value" ]; then
    printf '%s\n' "$value"
    return
  fi
  for revision in $(git log --all --format=%H -- "$config_file"); do
    value=$(git show "$revision:$config_file" 2>/dev/null | extract_value "$secret")
    if [ -n "$value" ]; then
      printf '%s\n' "$value"
      return
    fi
  done
}

planned_secrets=""
for secret_name in esphome_api_encryption_key c9_lights_mac_address; do
  if grep -q "^${secret_name}:" "$secrets_file"; then
    printf 'Preserved existing %s in %s\n' "$secret_name" "$secrets_file"
    continue
  fi
  value=$(find_value "$secret_name")
  if [ -n "$value" ]; then
    if [ "$dry_run" = true ]; then
      planned_secrets="$planned_secrets $secret_name"
      printf 'Would add %s to %s from local Git history/config\n' "$secret_name" "$secrets_file"
    else
      printf '%s: "%s"\n' "$secret_name" "$value" >> "$secrets_file"
      chmod 600 "$secrets_file"
      printf 'Added %s to %s without displaying its value\n' "$secret_name" "$secrets_file"
    fi
  else
    printf 'No local or historical source found for %s\n' "$secret_name" >&2
  fi
done

missing=false
for secret in $(awk '
  /^[[:space:]]*#/ { next }
  {
    for (field=1; field<NF; field++) {
      if ($field == "!secret") print $(field + 1)
    }
  }
' "$config_file" | sort -u); do
  case " $planned_secrets " in
    *" $secret "*) continue ;;
  esac
  if ! grep -q "^${secret}:" "$secrets_file"; then
    printf 'Missing ESPHome secret name: %s\n' "$secret"
    missing=true
  fi
done
if [ "$missing" = false ]; then
  printf '%s\n' "All current ESPHome !secret references have local entries."
fi

if [ "$dry_run" = false ]; then
  chmod 600 "$repo_root/secrets.yaml" "$secrets_file" "$repo_root/.env"
fi