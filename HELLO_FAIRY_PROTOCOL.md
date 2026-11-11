# Decoding the Hello Fairy Bluetooth Protocol: A Reverse-Engineering Guide

This guide details how to reverse-engineer and extract raw Bluetooth Low Energy (BLE) control commands from smart light strings using the **Hello Fairy** app.

Many budget smart light strips and seasonal lights (such as C9 Christmas strings) use proprietary or undocumented BLE protocols. Rather than relying on trial-and-error payload guessing, sniffing the BLE traffic between your mobile app and the light controller lets you capture exact hex structures for Home Assistant, ESPHome, or custom microcontrollers.

---

## Prerequisites

- **Hello Fairy App** installed on an iOS device (iPhone) or Android phone.
- **Apple Silicon Mac** (for Wireshark/PacketLogger analysis) or a PC running Wireshark.
- **Target BLE Light Controller** paired with the Hello Fairy app.
- **Home Assistant / ESPHome** setup (if porting commands into automations).

---

## Step 1: Capture Raw BLE Traffic

The most reliable way to capture Hello Fairy app commands is by creating a system-level Bluetooth trace on your smartphone while controlling the lights.

### Option A: iOS Trace Capture (Recommended)

1. **Install Apple's Bluetooth Logging Profile:**

- Open Safari on your iPhone and go to `[developer.apple.com/bug-reporting/profiles-and-logs/](https://developer.apple.com/bug-reporting/profiles-and-logs/)`.
- Locate **Bluetooth** and tap **Profile** to download.
- Open **Settings > Profile Downloaded** on your iPhone and tap **Install**.

2. **Execute the Command Sequence:**

- Open the **Hello Fairy** app.
- Perform distinct, isolated actions with a 3-second pause between each:
- Toggle **Power OFF** $\rightarrow$ **Power ON**.
- Select **Pure Red** ($0^\circ$).
- Select **Pure Green** ($120^\circ$).
- Select **Pure Blue** ($240^\circ$).
- Cycle through built-in **Effects/Scenes** or adjust **Speed** sliders.

3. **Trigger the Sysdiagnose Dump:**

- Press and hold **Volume Up + Volume Down + Side/Power Button** simultaneously for 1–2 seconds until you feel a brief haptic vibration.
- Wait 2–3 minutes for iOS to gather and compress the archive.

4. **Export the Trace:**

- Go to **Settings > Privacy & Security > Analytics & Improvements > Analytics Data**.
- Locate the file starting with `sysdiagnose_YYYY.MM.DD...`.
- AirDrop or transfer the archive to your computer and extract it.

### Option B: Android HCI Snoop Logging

1. Enable **Developer Options** on your Android device (`Settings > About Phone > Tap Build Number 7 times`).
2. Inside Developer Options, toggle **Enable Bluetooth HCI snoop log** to **ON**.
3. Open **Hello Fairy** and perform your test actions (Power, Colors, Effects).
4. Turn off Bluetooth or reboot to flush the buffer.
5. Retrieve the capture file via ADB:

```bash
adb pull /sdcard/btsnoop_hci.log

```

---

## Step 2: Locate and Inspect the Trace File

1. Extract the downloaded `sysdiagnose` archive on your Mac/PC.
2. Open Terminal and search for the BLE log file inside the unzipped directory:

```bash
find . -iname "*bluetoothd-hci-latest.pklg*" -o -iname "*.btsnoop"

```

_(On iOS, the key trace file is typically located at `logs/Bluetooth/bluetoothd-hci-latest.pklg`)._ 3. Open the file using **PacketLogger** (part of Apple's _Additional Tools for Xcode_) or **Wireshark**. 4. Set the search/display filter to **`ATT`** or **`Write`** to isolate Attribute Write Requests/Commands sent to the controller's GATT characteristic handle.

---

## Step 3: Decipher the Protocol Payload

Hello Fairy controllers typically communicate using **9-byte array payloads** sent as hex values.

### Reverse-Engineered Packet Structure

| Byte Index | Field                | Hex Example       | Description / Function                               |
| ---------- | -------------------- | ----------------- | ---------------------------------------------------- |
| **0–1**    | **Header & Command** | `AA 03`           | Frame Start & Main Command ID                        |
| **2–3**    | **Sub-function**     | `07 01`           | Sub-mode ID (e.g., Static Color Mode)                |
| **4–5**    | **Hue Word**         | `00 00` – `01 68` | 16-bit Hue degree integer ($0^\circ$ to $360^\circ$) |
| **6–7**    | **Sat / Brightness** | `03 E8`           | Color Saturation or Level ($1000$ in decimal = 100%) |
| **8**      | **Checksum / Tail**  | `BB`              | Frame Termination Byte                               |

### Decoded Example Commands

- **Power ON:** `[170, 2, 1, 1, 174]` _(5-byte framing)_
- **Power OFF:** `[170, 2, 1, 0, 173]` _(5-byte framing)_
- **Pure Red ($0^\circ$ Hue):**
- Hex: `AA 03 07 01 00 00 03 E8 BB`
- Decimal Payload: `[170, 3, 7, 1, 0, 0, 3, 232, 187]`

- **Pure Green ($120^\circ$ Hue / `0x0078`):**
- Hex: `AA 03 07 01 00 78 03 E8 BB`
- Decimal Payload: `[170, 3, 7, 1, 0, 120, 3, 232, 187]`

- **Pure Blue ($240^\circ$ Hue / `0x00F0`):**
- Hex: `AA 03 07 01 00 F0 03 E8 BB`
- Decimal Payload: `[170, 3, 7, 1, 0, 240, 3, 232, 187]`

---

## Step 4: Home Assistant Integration Example

Once you have verified your controller's payload structure, you can implement it in Home Assistant using a **Template Light** paired with an ESP32 Bluetooth Proxy or local BLE integration:

```yaml
light:
  - platform: template
    lights:
      christmas_light:
        friendly_name: "Christmas Light"
        unique_id: christmas_light
        turn_on:
          action: esphome.esp32_bluetooth_proxy_send_command
          data:
            payload: [170, 2, 1, 1, 174]
        turn_off:
          action: esphome.esp32_bluetooth_proxy_send_command
          data:
            payload: [170, 2, 1, 0, 173]
        set_hs:
          action: esphome.esp32_bluetooth_proxy_send_command
          data:
            payload: >-
              {% set hue = h | default(0) | int %}
              {% set h_high = hue // 256 %}
              {% set h_low = hue % 256 %}
              {{ [170, 3, 7, 1, h_high, h_low, 3, 232, 187] }}
```

---

## Unexplored Protocol Gaps (Help Wanted!)

If you have captured trace logs for other features in the Hello Fairy app, please open a PR or issue to help map the remaining protocol bytes:

- [ ] **Dynamic Scene / Effect Modes:** Exact byte maps for animation presets (e.g., Rainbow, Strobe, Twinkle).
- [ ] **Effect Speed & Direction:** Sub-command bytes controlling pattern speed and movement.
- [ ] **Segmented Color Mapping:** Individual LED addressing commands on multi-segment strings.
- [ ] **Hardware White Channels:** Dedicated RGBW / Cool White / Warm White payload variants.
