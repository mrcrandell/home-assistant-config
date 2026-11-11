#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const secretNames = ["esphome_api_encryption_key", "c9_lights_mac_address"];
const generatedFiles = ["secrets.yaml", "esphome/secrets.yaml", ".env"];
const templates = {
  "secrets.yaml": "# Home Assistant secrets. Existing values are preserved.\n",
  "esphome/secrets.yaml": "# ESPHome secrets. Existing values are preserved.\n",
  ".env": "# Optional variables for tools that explicitly load this file.\n",
};

let dryRun = false;
let syncFrom;
let remoteConfigDir = "/config";
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--dry-run") {
    dryRun = true;
  } else if (argument === "--sync-from" && process.argv[index + 1]) {
    syncFrom = process.argv[++index];
  } else if (argument === "--remote-config-dir" && process.argv[index + 1]) {
    remoteConfigDir = process.argv[++index];
  } else {
    console.error(
      "Usage: node scripts/setup-secrets.mjs [--dry-run] [--sync-from SSH_HOST] [--remote-config-dir /config]",
    );
    process.exit(1);
  }
}

if (process.platform !== "darwin") {
  console.error(
    "Run this helper on macOS. Use setup-secrets-haos.sh on Home Assistant OS.",
  );
  process.exit(1);
}
if (
  !remoteConfigDir.startsWith("/") ||
  !/^[A-Za-z0-9_./-]+$/.test(remoteConfigDir)
) {
  console.error(
    "The remote config directory must be an absolute path without shell-special characters.",
  );
  process.exit(1);
}

function parseYamlBlocks(content, filePath) {
  const blocks = [];
  let current;
  for (const line of content.split(/\r?\n/)) {
    if (line.trim() && !line.trimStart().startsWith("#") && !/^\s/.test(line)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t].*)?$/);
      if (!match)
        throw new Error(
          `Unsupported top-level YAML in ${filePath}; no files were written.`,
        );
      if (current) blocks.push(current);
      current = { key: match[1], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function mergeYaml(localContent, sourceContent, filePath) {
  const localBlocks = parseYamlBlocks(localContent, filePath);
  const sourceBlocks = parseYamlBlocks(sourceContent, filePath);
  const localKeys = new Set(localBlocks.map(({ key }) => key));
  const added = [];
  const conflicts = [];
  for (const block of sourceBlocks) {
    if (localKeys.has(block.key)) conflicts.push(block.key);
    else {
      added.push(block);
      localKeys.add(block.key);
    }
  }

  const base = localContent.replace(/\s*$/, "");
  const additions = added.flatMap(({ lines }) => lines).join("\n");
  return {
    content: added.length
      ? [base, additions].filter(Boolean).join("\n") + "\n"
      : localContent,
    added: added.map(({ key }) => key),
    conflicts,
    keys: localKeys,
  };
}

function mergeEnv(localContent, sourceContent) {
  const localKeys = new Set(
    [
      ...localContent.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/gm),
    ].map((match) => match[1]),
  );
  const added = [];
  const conflicts = [];
  for (const line of sourceContent.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) continue;
    if (localKeys.has(match[1])) conflicts.push(match[1]);
    else {
      localKeys.add(match[1]);
      added.push(line);
    }
  }
  const base = localContent.replace(/\s*$/, "");
  const additions = added.join("\n");
  return {
    content: added.length
      ? [base, additions].filter(Boolean).join("\n") + "\n"
      : localContent,
    added: added.map(
      (line) => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/)[1],
    ),
    conflicts,
  };
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function extractInlineSecrets(config) {
  const match = config.match(
    /^api:[ \t]*\r?\n[ \t]{2}encryption:[ \t]*\r?\n[ \t]{4}key:[ \t]*(?:"([^"]*)"|'([^']*)'|([^#\s]+))[ \t]*(?:#.*)?$/m,
  );
  const apiKey = match?.[1] ?? match?.[2] ?? match?.[3];
  const values = {};
  if (apiKey && !apiKey.startsWith("!")) {
    values.esphome_api_encryption_key = apiKey;
  }

  let inBleClient = false;
  let inTargetClient = false;
  for (const line of config.split(/\r?\n/)) {
    if (line === "ble_client:") {
      inBleClient = true;
      continue;
    }
    if (inBleClient && /^[^\s#]/.test(line)) break;
    if (inBleClient && /^  - id:/.test(line)) {
      inTargetClient = line.trim() === "- id: c9_lights";
      continue;
    }
    if (inTargetClient) {
      const mac = line.match(
        /^    mac_address:[ \t]*(?:"([^"]*)"|'([^']*)'|([^#\s]+))/,
      );
      const value = mac?.[1] ?? mac?.[2] ?? mac?.[3];
      if (value && !value.startsWith("!")) {
        values.c9_lights_mac_address = value;
      }
      if (mac) inTargetClient = false;
    }
  }
  return values;
}

function findInlineSecrets(configPath, currentConfig) {
  const values = extractInlineSecrets(currentConfig);
  if (secretNames.every((name) => values[name])) return values;

  const commits = execFileSync(
    "git",
    ["log", "--all", "--format=%H", "--", configPath],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  for (const commit of commits) {
    const result = execFileSync("git", ["show", `${commit}:${configPath}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const [name, value] of Object.entries(extractInlineSecrets(result))) {
      values[name] ??= value;
    }
    if (secretNames.every((name) => values[name])) break;
  }
  return values;
}

function fetchRemote(path) {
  const remotePath = `${remoteConfigDir.replace(/\/$/, "")}/${path}`;
  try {
    return execFileSync("ssh", ["-T", syncFrom, "cat", remotePath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "ignore"],
    });
  } catch (error) {
    if (error.status === 1) return "";
    throw new Error(
      `Could not read ${remotePath} over SSH; check the host and SSH access.`,
    );
  }
}

try {
  const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (resolve(gitRoot) !== resolve(repoRoot))
    throw new Error("Run this helper from a checkout of this repository.");

  for (const path of generatedFiles) {
    execFileSync("git", ["check-ignore", "--quiet", "--", path], {
      cwd: repoRoot,
      stdio: "ignore",
    });
  }

  const localContent = new Map();
  const sourceContent = new Map();
  for (const path of generatedFiles) {
    localContent.set(
      path,
      (await readOptional(join(repoRoot, path))) || templates[path],
    );
    sourceContent.set(path, "");
  }
  if (syncFrom) {
    for (const path of generatedFiles)
      sourceContent.set(path, fetchRemote(path));
  }

  const planned = new Map();
  const conflicts = new Map();
  for (const path of ["secrets.yaml", "esphome/secrets.yaml"]) {
    const merged = mergeYaml(
      localContent.get(path),
      sourceContent.get(path),
      path,
    );
    planned.set(path, merged);
    conflicts.set(path, merged.conflicts);
  }
  const env = mergeEnv(localContent.get(".env"), sourceContent.get(".env"));
  planned.set(".env", env);
  conflicts.set(".env", env.conflicts);

  const configPath = join(
    repoRoot,
    "esphome/esp32-bluetooth-proxy-2df374.yaml",
  );
  const config = await readFile(configPath, "utf8");
  const inlineSecrets = findInlineSecrets(
    "esphome/esp32-bluetooth-proxy-2df374.yaml",
    config,
  );
  const esphome = planned.get("esphome/secrets.yaml");
  for (const [name, value] of Object.entries(inlineSecrets)) {
    if (value && !esphome.keys.has(name)) {
      esphome.content += `${name}: ${JSON.stringify(value)}\n`;
      esphome.keys.add(name);
      esphome.added.push(name);
    }
  }

  const requiredKeys = new Set(
    [...config.matchAll(/!secret\s+([A-Za-z_][A-Za-z0-9_]*)/g)].map(
      (match) => match[1],
    ),
  );
  const missing = [...requiredKeys].filter((key) => !esphome.keys.has(key));

  for (const path of generatedFiles) {
    const result = planned.get(path);
    const target = join(repoRoot, path);
    const previous = await readOptional(target);
    const content = result.content || templates[path];
    if (dryRun) {
      const verb = previous
        ? content === previous
          ? "Would preserve"
          : "Would update"
        : "Would create";
      console.log(
        `${verb} ${path}${result.added.length ? `; add keys: ${result.added.join(", ")}` : ""}`,
      );
    } else if (content !== previous) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, { encoding: "utf8", mode: 0o600 });
      await chmod(target, 0o600);
      console.log(
        `${previous ? "Updated" : "Created"} ${path}${result.added.length ? `; added keys: ${result.added.join(", ")}` : ""}`,
      );
    } else {
      console.log(`Preserved ${path}`);
    }
  }

  for (const [path, keys] of conflicts) {
    if (keys.length)
      console.warn(
        `Kept local values for existing key(s) in ${path}: ${[...new Set(keys)].join(", ")}`,
      );
  }
  if (missing.length)
    console.warn(`Still missing ESPHome secret names: ${missing.join(", ")}`);
  for (const name of secretNames) {
    if (!esphome.keys.has(name)) {
      console.warn(
        `No local or historical source found for ${name}; no value was generated.`,
      );
    }
  }
  if (!syncFrom)
    console.log(
      "No SSH source specified; remote secret files were not read. Use --sync-from <SSH_HOST> to import them.",
    );
} catch (error) {
  console.error(`Secret setup stopped: ${error.message}`);
  process.exitCode = 1;
}
