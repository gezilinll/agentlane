#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir, hostname, arch, platform } from "node:os";
import path from "node:path";

const COLLECTOR_VERSION = "0.1.0";
const DEFAULT_INTERVAL_MS = 60_000;

function parseArgs(argv) {
  const args = {
    once: false,
    printOnly: false,
    configPath: "",
    fixturePath: "",
    serverUrl: "",
    wsUrl: "",
    deviceId: "",
    deviceName: "",
    intervalMs: DEFAULT_INTERVAL_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    if (arg === "--once") args.once = true;
    else if (arg === "--print-only") args.printOnly = true;
    else if (arg === "--config") args.configPath = next();
    else if (arg === "--fixture") args.fixturePath = next();
    else if (arg === "--server-url") args.serverUrl = next();
    else if (arg === "--ws-url") args.wsUrl = next();
    else if (arg === "--device-id") args.deviceId = next();
    else if (arg === "--device-name") args.deviceName = next();
    else if (arg === "--interval-ms") args.intervalMs = Number(next());
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: agentlane-device-collector [options]

Options:
  --once                 Collect once and exit
  --print-only           Print snapshot instead of posting
  --config <path>        Read collector config JSON
  --fixture <path>       Load a fixture snapshot instead of probing the host
  --server-url <url>     Agentlane server URL
  --ws-url <url>         Agentlane device control WebSocket URL
  --device-id <id>       Override device id
  --device-name <name>   Override device name
  --interval-ms <ms>     Collection interval when not using --once
`);
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function homeDir() {
  return process.env.AGENTLANE_COLLECTOR_HOME || homedir();
}

function loadConfig(configPath) {
  if (!configPath) return {};
  if (!existsSync(configPath)) return {};
  return readJsonFile(configPath);
}

function isoNow() {
  return new Date().toISOString();
}

function sanitizeId(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function makeRuntimeId(deviceId, source, externalId) {
  return `${sanitizeId(deviceId)}:${sanitizeId(source)}:${sanitizeId(externalId)}`;
}

function makeAgentId(runtimeId, externalId) {
  return `${runtimeId}:agent:${sanitizeId(externalId)}`;
}

function commandExists(command) {
  return findExecutable(command) !== null;
}

function candidateExecutables(command) {
  const candidates = [];
  const pathDirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) candidates.push(path.join(dir, command));
  candidates.push(path.join(homeDir(), ".local", "bin", command));
  candidates.push(path.join(homeDir(), ".npm-global", "bin", command));
  candidates.push(path.join(homeDir(), ".volta", "bin", command));
  candidates.push(path.join("/opt/homebrew/bin", command));
  candidates.push(path.join("/usr/local/bin", command));

  const fnmRoot = path.join(homeDir(), ".local", "share", "fnm", "node-versions");
  try {
    for (const version of readdirSync(fnmRoot)) {
      candidates.push(path.join(fnmRoot, version, "installation", "bin", command));
    }
  } catch {
    // Ignore missing fnm installs.
  }

  return candidates;
}

function findExecutable(command) {
  for (const candidate of candidateExecutables(command)) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Keep scanning.
    }
  }

  try {
    const resolved = execFileSync("command", ["-v", command], {
      encoding: "utf8",
      shell: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return resolved || null;
  } catch {
    return null;
  }
}

function runJson(command, args, timeoutMs = 10_000) {
  const executable = findExecutable(command);
  if (!executable) return null;
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function runText(command, args, timeoutMs = 5_000) {
  const executable = findExecutable(command);
  if (!executable) return null;
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

function createDevice(config, observedAt) {
  const defaultId = sanitizeId(hostname());
  return {
    id: config.deviceId || defaultId,
    name: config.deviceName || config.deviceId || hostname(),
    hostname: hostname(),
    os: platform(),
    architecture: arch(),
    status: "unknown",
    connectionMode: "collector",
    lastSeenAt: observedAt,
  };
}

function createRuntime({ deviceId, source, externalId, kind, name, status, version, capabilities, lastSeenAt, health }) {
  return {
    id: makeRuntimeId(deviceId, source, externalId),
    deviceId,
    kind,
    name,
    status,
    ...(version ? { version } : {}),
    capabilities,
    lastSeenAt,
    sourceRefs: [{ source, externalId, label: name }],
    ...(health ? { health } : {}),
  };
}

function createAgent({ runtimeId, source, externalId, name, origin, status, channelBindings, lastSeenAt, load }) {
  return {
    id: makeAgentId(runtimeId, externalId),
    runtimeId,
    name,
    origin,
    status,
    channelBindings,
    sourceRefs: [{ source, externalId, label: name }],
    ...(lastSeenAt ? { lastSeenAt } : {}),
    ...(load ? { load } : {}),
  };
}

function rollupDeviceStatus(collectorStatus, runtimes) {
  if (collectorStatus === "offline") return "offline";
  if (collectorStatus === "degraded") return "degraded";
  if (runtimes.some((runtime) => runtime.status === "degraded")) return "degraded";
  if (runtimes.some((runtime) => runtime.status === "online")) return "online";
  if (runtimes.some((runtime) => runtime.status === "offline")) return "offline";
  return "unknown";
}

function readOpenClawConfig() {
  const configPath = path.join(homeDir(), ".openclaw", "openclaw.json");
  if (!existsSync(configPath)) return null;
  try {
    return readJsonFile(configPath);
  } catch {
    return null;
  }
}

function listOpenClawConfigAgentIds(config) {
  const list = config?.agents?.list;
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && typeof entry.id === "string") return entry.id;
      return "";
    })
    .filter(Boolean);
}

function channelKind(channel) {
  return channel === "dingtalk" ? "dingtalk" : "other";
}

function resolveOpenClawChannelBindings(config, health, agentId) {
  const fromHealth = Object.keys(health?.channels || {}).map((channel) => ({
    kind: channelKind(channel),
    label: health?.channelLabels?.[channel] || channel,
    status: health?.channels?.[channel]?.enabled === false ? "disabled" : "enabled",
  }));

  const fromConfig = Array.isArray(config?.bindings)
    ? config.bindings
        .filter((binding) => !binding?.agentId || binding.agentId === agentId)
        .map((binding) => {
          const channel = binding?.match?.channel || "other";
          const accountId = binding?.match?.accountId;
          const enabled = config?.channels?.[channel]?.enabled;
          return {
            kind: channelKind(channel),
            label: `${channel === "dingtalk" ? "DingTalk" : channel}${accountId ? ` ${accountId}` : ""}`,
            ...(accountId ? { externalId: accountId } : {}),
            status: enabled === false ? "disabled" : "enabled",
          };
        })
    : [];

  const deduped = new Map();
  for (const binding of [...fromHealth, ...fromConfig]) {
    deduped.set(`${binding.kind}:${binding.externalId || binding.label}`, binding);
  }
  return Array.from(deduped.values());
}

function collectOpenClaw(deviceId, observedAt) {
  const config = readOpenClawConfig();
  const health = runJson("openclaw", ["health", "--json", "--timeout", "5000"]);
  const status = runJson("openclaw", ["status", "--json", "--timeout", "5000"]);
  if (!health && !status && !config) return { runtimes: [], agents: [] };

  const gateway = status?.gateway;
  const runtimeStatus = health?.ok === false || gateway?.reachable === false ? "degraded" : health || status ? "online" : "unknown";
  const version = gateway?.self?.version || undefined;
  const runtime = createRuntime({
    deviceId,
    source: "openclaw",
    externalId: gateway?.url ? `gateway-${gateway.url}` : "gateway-local",
    kind: "openclaw",
    name: "OpenClaw Gateway",
    status: runtimeStatus,
    version,
    capabilities: ["config", ...(health ? ["health"] : []), ...(status ? ["status", "tasks"] : [])],
    lastSeenAt: observedAt,
    health: {
      historicalSessions: status?.agents?.totalSessions,
      lastError: health?.ok === false ? "openclaw health returned ok=false" : undefined,
    },
  });

  const openclawAgents = health?.agents || status?.agents?.agents || [];
  const agentIds = Array.from(new Set([
    ...openclawAgents.map((agent) => agent.agentId || agent.id || "main"),
    ...listOpenClawConfigAgentIds(config),
  ])).filter(Boolean);
  const agents = agentIds.map((agentId) => {
    const agent = openclawAgents.find((candidate) => (candidate.agentId || candidate.id || "main") === agentId) || {};
    return createAgent({
      runtimeId: runtime.id,
      source: "openclaw",
      externalId: agentId,
      name: agentId,
      origin: "openclaw",
      status: health || status ? "idle" : "unknown",
      channelBindings: resolveOpenClawChannelBindings(config, health, agentId),
      lastSeenAt: observedAt,
      load: {
        ...(agent.sessions?.count === undefined ? {} : { historicalSessions: agent.sessions.count }),
      },
    });
  });

  return { runtimes: [runtime], agents };
}

function collectMultica(deviceId, observedAt) {
  const daemonStatus = runJson("multica", ["daemon", "status", "--output", "json"]);
  const runtimeList = runJson("multica", ["runtime", "list", "--output", "json"]);
  const agentList = runJson("multica", ["agent", "list", "--output", "json"]);
  if (!daemonStatus && !Array.isArray(runtimeList) && !Array.isArray(agentList)) {
    return { runtimes: [], agents: [] };
  }

  const runtimes = Array.isArray(runtimeList)
    ? runtimeList.map((runtime) =>
        createRuntime({
          deviceId,
          source: "multica",
          externalId: runtime.id || runtime.name || "runtime",
          kind: runtime.provider === "openclaw" ? "openclaw" : runtime.provider === "codex" ? "codex" : "multica",
          name: runtime.name || runtime.provider || "Multica runtime",
          status: runtime.status === "online" ? "online" : runtime.status === "offline" ? "offline" : "unknown",
          version: runtime.metadata?.version || undefined,
          capabilities: ["daemon:status", "runtime:list", "agent:list"],
          lastSeenAt: runtime.last_seen_at || observedAt,
          health: { activeTasks: daemonStatus?.active_task_count },
        }),
      )
    : [];

  const runtimeIdByExternalId = new Map(runtimes.map((runtime) => [runtime.sourceRefs[0].externalId, runtime.id]));
  const agents = Array.isArray(agentList)
    ? agentList.map((agent) => {
        const runtimeId = runtimeIdByExternalId.get(agent.runtime_id) || makeRuntimeId(deviceId, "multica", agent.runtime_id || "unknown-runtime");
        return createAgent({
          runtimeId,
          source: "multica",
          externalId: agent.id || agent.name || "agent",
          name: agent.name || "Multica Agent",
          origin: "multica",
          status: normalizeMulticaAgentStatus(agent.status),
          channelBindings: [{ kind: "multica", label: "Multica", status: "enabled" }],
          lastSeenAt: agent.last_seen_at || agent.updated_at || observedAt,
          load: {
            ...(agent.max_concurrent_tasks === undefined ? {} : { maxConcurrency: agent.max_concurrent_tasks }),
          },
        });
      })
    : [];

  return { runtimes, agents };
}

function readSlockAgentName(agentDir, fallbackName) {
  try {
    const memory = readFileSync(path.join(agentDir, "MEMORY.md"), "utf8");
    const heading = memory.split("\n").find((line) => line.startsWith("# "));
    return heading ? heading.replace(/^#\s+/, "").trim() || fallbackName : fallbackName;
  } catch {
    return fallbackName;
  }
}

function collectSlock(deviceId, observedAt) {
  const slockAgentsDir = path.join(homeDir(), ".slock", "agents");
  if (!existsSync(slockAgentsDir)) return { runtimes: [], agents: [] };

  const agentDirs = readdirSync(slockAgentsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const runtime = createRuntime({
    deviceId,
    source: "slock",
    externalId: "slock-daemon",
    kind: "slock",
    name: "Slock daemon",
    status: commandExists("slock-daemon") || agentDirs.length > 0 ? "online" : "unknown",
    capabilities: ["agent:start", "agent:deliver", "workspace:files"],
    lastSeenAt: observedAt,
  });

  const agents = agentDirs.map((entry) =>
    createAgent({
      runtimeId: runtime.id,
      source: "slock",
      externalId: entry.name,
      name: readSlockAgentName(path.join(slockAgentsDir, entry.name), entry.name),
      origin: "slock",
      status: "unknown",
      channelBindings: [{ kind: "slock", label: "Slock", status: "enabled" }],
      lastSeenAt: observedAt,
    }),
  );

  return { runtimes: [runtime], agents };
}

function normalizeMulticaAgentStatus(status) {
  if (status === "active") return "active";
  if (status === "idle") return "idle";
  if (status === "inactive") return "inactive";
  if (status === "degraded") return "degraded";
  if (status === "unknown") return "unknown";
  return "idle";
}

function collectCliRuntime(deviceId, observedAt, command, kind, name) {
  const version = runText(command, ["--version"]);
  if (!version) return { runtimes: [], agents: [] };
  return {
    runtimes: [
      createRuntime({
        deviceId,
        source: kind,
        externalId: command,
        kind,
        name,
        status: "online",
        version,
        capabilities: ["cli:version"],
        lastSeenAt: observedAt,
      }),
    ],
    agents: [],
  };
}

function mergeParts(parts) {
  return {
    runtimes: parts.flatMap((part) => part.runtimes),
    agents: parts.flatMap((part) => part.agents),
  };
}

function applyDeviceOverrides(snapshot, config) {
  if (!config.deviceId && !config.deviceName) return snapshot;
  const nextDevice = {
    ...snapshot.device,
    id: config.deviceId || snapshot.device.id,
    name: config.deviceName || snapshot.device.name,
  };
  const idReplacements = new Map();
  const runtimes = snapshot.runtimes.map((runtime) => {
    const nextRuntime = {
      ...runtime,
      id: runtime.id.replace(`${snapshot.device.id}:`, `${nextDevice.id}:`),
      deviceId: nextDevice.id,
    };
    idReplacements.set(runtime.id, nextRuntime.id);
    return nextRuntime;
  });
  const agents = snapshot.agents.map((agent) => {
    const nextRuntimeId = idReplacements.get(agent.runtimeId) || agent.runtimeId.replace(`${snapshot.device.id}:`, `${nextDevice.id}:`);
    return {
      ...agent,
      id: agent.id.replace(`${snapshot.device.id}:`, `${nextDevice.id}:`),
      runtimeId: nextRuntimeId,
    };
  });
  return { ...snapshot, device: nextDevice, runtimes, agents };
}

function collectSnapshot(config, args) {
  const mergedConfig = {
    ...config,
    ...(args.serverUrl ? { serverUrl: args.serverUrl } : {}),
    ...(args.deviceId ? { deviceId: args.deviceId } : {}),
    ...(args.deviceName ? { deviceName: args.deviceName } : {}),
  };

  if (args.fixturePath) {
    return applyDeviceOverrides(readJsonFile(args.fixturePath), {
      deviceId: mergedConfig.deviceId,
      deviceName: mergedConfig.deviceName,
    });
  }

  const observedAt = isoNow();
  const device = createDevice(mergedConfig, observedAt);
  const collector = {
    version: COLLECTOR_VERSION,
    status: "online",
    installPath: config.installDir,
  };
  const collected = mergeParts([
    collectOpenClaw(device.id, observedAt),
    collectMultica(device.id, observedAt),
    collectSlock(device.id, observedAt),
    collectCliRuntime(device.id, observedAt, "codex", "codex", "Codex CLI"),
    collectCliRuntime(device.id, observedAt, "claude", "claude_code", "Claude Code"),
  ]);
  const deviceStatus = rollupDeviceStatus(collector.status, collected.runtimes);

  return {
    observedAt,
    collector,
    device: { ...device, status: deviceStatus },
    runtimes: collected.runtimes,
    agents: collected.agents,
    reports: [],
  };
}

async function postSnapshot(serverUrl, snapshot) {
  const url = new URL("/api/device-snapshots", serverUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error(`Snapshot post failed: HTTP ${response.status}`);
}

async function runOnce(config, args) {
  const snapshot = collectSnapshot(config, args);
  const serverUrl = args.serverUrl || config.serverUrl || "";
  if (serverUrl && !args.printOnly) await postSnapshot(serverUrl, snapshot);
  if (args.printOnly || !serverUrl) console.log(JSON.stringify(snapshot, null, 2));
  return snapshot;
}

function resolveServerUrl(config, args) {
  return args.serverUrl || config.serverUrl || "";
}

function resolveWsUrl(config, args) {
  const explicitWsUrl = args.wsUrl || config.wsUrl || "";
  if (explicitWsUrl) return explicitWsUrl;
  const serverUrl = resolveServerUrl(config, args);
  if (!serverUrl) return "";
  try {
    const url = new URL("/api/device-control/ws", serverUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  } catch {
    return "";
  }
}

function sendControlMessage(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ sentAt: isoNow(), ...message }));
}

function heartbeatPayload(config, args) {
  const observedAt = isoNow();
  const device = createControlDevice(config, args, observedAt);
  return {
    type: "heartbeat",
    deviceId: device.id,
    deviceName: device.name,
    hostname: device.hostname,
    collectorVersion: COLLECTOR_VERSION,
  };
}

function mergedControlConfig(config, args) {
  return {
    ...config,
    ...(args.deviceId ? { deviceId: args.deviceId } : {}),
    ...(args.deviceName ? { deviceName: args.deviceName } : {}),
  };
}

function createControlDevice(config, args, observedAt) {
  if (args.fixturePath) {
    try {
      return applyDeviceOverrides(readJsonFile(args.fixturePath), mergedControlConfig(config, args)).device;
    } catch {
      // Fall back to local device identity when the fixture cannot be read.
    }
  }
  return createDevice(mergedControlConfig(config, args), observedAt);
}

async function handleControlMessage(socket, rawMessage, config, args, seenCommandIds) {
  let message;
  try {
    message = JSON.parse(String(rawMessage));
  } catch {
    sendControlMessage(socket, { type: "error", error: "invalid control message json" });
    return;
  }

  if (message.type !== "inventory.refresh") return;
  if (!message.commandId) {
    sendControlMessage(socket, { type: "error", error: "inventory.refresh missing commandId" });
    return;
  }
  if (seenCommandIds.has(message.commandId)) {
    sendControlMessage(socket, {
      type: "command.result",
      commandId: message.commandId,
      deviceId: message.deviceId || config.deviceId || args.deviceId,
      status: "succeeded",
      result: { duplicate: true },
    });
    return;
  }

  seenCommandIds.add(message.commandId);
  sendControlMessage(socket, {
    type: "command.accepted",
    commandId: message.commandId,
    deviceId: message.deviceId || config.deviceId || args.deviceId,
  });

  try {
    const snapshot = await runOnce(config, args);
    sendControlMessage(socket, {
      type: "command.result",
      commandId: message.commandId,
      deviceId: snapshot.device.id,
      status: "succeeded",
      result: { observedAt: snapshot.observedAt },
    });
  } catch (error) {
    sendControlMessage(socket, {
      type: "command.result",
      commandId: message.commandId,
      deviceId: message.deviceId || config.deviceId || args.deviceId,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function startControlChannel(config, args) {
  const wsUrl = resolveWsUrl(config, args);
  if (!wsUrl || typeof WebSocket === "undefined") return;

  const serverUrl = resolveServerUrl(config, args);
  if (!serverUrl && !args.printOnly) return;

  const seenCommandIds = new Set();
  let heartbeatTimer;
  let reconnectTimer;
  let closed = false;

  const connect = () => {
    if (closed) return;
    const socket = new WebSocket(wsUrl);

    socket.addEventListener("open", () => {
      const observedAt = isoNow();
      const device = createControlDevice(config, args, observedAt);
      sendControlMessage(socket, {
        type: "hello",
        deviceId: device.id,
        deviceName: device.name,
        hostname: device.hostname,
        collectorVersion: COLLECTOR_VERSION,
      });
      sendControlMessage(socket, heartbeatPayload(config, args));
      heartbeatTimer = setInterval(() => {
        sendControlMessage(socket, heartbeatPayload(config, args));
      }, Math.min(Number(args.intervalMs || config.intervalMs || DEFAULT_INTERVAL_MS), 30_000));
    });

    socket.addEventListener("message", (event) => {
      void handleControlMessage(socket, event.data, config, args, seenCommandIds);
    });

    socket.addEventListener("close", () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (!closed) reconnectTimer = setTimeout(connect, 5_000);
    });

    socket.addEventListener("error", () => {
      // Close will schedule reconnect. Keep logs quiet so API keys in process args are never echoed.
    });
  };

  connect();
  return () => {
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(args.configPath);

  if (args.once) {
    await runOnce(config, args);
    return;
  }

  await runOnce(config, args);
  startControlChannel(config, args);
  setInterval(() => {
    runOnce(config, args).catch((error) => {
      console.error(`[agentlane-device-collector] ${error instanceof Error ? error.message : String(error)}`);
    });
  }, Number.isFinite(args.intervalMs) && args.intervalMs > 0 ? args.intervalMs : DEFAULT_INTERVAL_MS);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
