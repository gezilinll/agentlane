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
    workStateOnce: false,
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
    else if (arg === "--work-state-once") args.workStateOnce = true;
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
  --work-state-once      Collect one runtime work-state snapshot and exit
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

async function postWorkStateSnapshot(serverUrl, snapshot) {
  const url = new URL("/api/runtime-work-state-snapshots", serverUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error(`Work state snapshot post failed: HTTP ${response.status}`);
}

async function runOnce(config, args) {
  const snapshot = collectSnapshot(config, args);
  const serverUrl = args.serverUrl || config.serverUrl || "";
  if (serverUrl && !args.printOnly) await postSnapshot(serverUrl, snapshot);
  if (args.printOnly || !serverUrl) console.log(JSON.stringify(snapshot, null, 2));
  return snapshot;
}

function toArray(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key];
  }
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.items)) return value.items;
  return [];
}

function toIsoTimestamp(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    const epochMs = value > 10_000_000_000 ? value : value * 1000;
    return new Date(epochMs).toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (/^\d+$/.test(trimmed)) return toIsoTimestamp(Number(trimmed));
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return undefined;
}

function supportCapability(support, strategies, evidence, limitations) {
  return { support, strategies, evidence, limitations };
}

function openClawWorkStateCapability(collectedAt, options = {}) {
  return {
    source: "openclaw",
    collectedAt,
    workItems: supportCapability(
      "unsupported",
      ["cli", "native_api"],
      ["openclaw tasks list --json exposes executions, not project-management work items."],
      ["OpenClaw has no pending or review phase without an upstream work item source."],
    ),
    conversations: supportCapability(
      options.conversationsSupport || "unknown",
      ["cli", "native_api"],
      options.conversationsEvidence || ["openclaw health/status was not available for this snapshot."],
      options.conversationsLimitations || ["Session count can include historical sessions; recent sessions require health/status evidence."],
    ),
    executions: supportCapability(
      options.executionsSupport || "unknown",
      ["cli", "native_api"],
      options.executionsEvidence || ["openclaw tasks list --json was not available for this snapshot."],
      options.executionsLimitations || ["Lost and timed out statuses are normalized to failed when task data is available."],
    ),
  };
}

function multicaWorkStateCapability(collectedAt, options = {}) {
  return {
    source: "multica",
    collectedAt,
    workItems: supportCapability(
      options.workItemsSupport || "unknown",
      ["cli", "native_api"],
      options.workItemsEvidence || ["multica issue list --output json was not available for this snapshot."],
      options.workItemsLimitations || ["Backlog is normalized to todo when issue data is available."],
    ),
    conversations: supportCapability(
      options.conversationsSupport || "unknown",
      ["cli", "native_api"],
      options.conversationsEvidence || ["multica agent tasks did not expose chat_session_id in this snapshot."],
      options.conversationsLimitations || ["Conversation messages require separate issue run-message reads."],
    ),
    executions: supportCapability(
      options.executionsSupport || "unknown",
      ["cli", "native_api"],
      options.executionsEvidence || ["multica agent tasks --output json was not available for this snapshot."],
      options.executionsLimitations || ["Completed is normalized to succeeded when task data is available."],
    ),
  };
}

function slockWorkStateCapability(collectedAt, options = {}) {
  return {
    source: "slock",
    collectedAt,
    workItems: supportCapability(
      options.workItemsSupport || "unknown",
      options.workItemsStrategies || ["cli", "native_api"],
      options.workItemsEvidence || ["No Slock task-board probe was available for this snapshot."],
      options.workItemsLimitations || ["Workspace agent files prove local agent presence, not board state."],
    ),
    conversations: supportCapability(
      options.conversationsSupport || "unknown",
      options.conversationsStrategies || ["cli", "native_api"],
      options.conversationsEvidence || ["No Slock channel/thread history probe was available for this snapshot."],
      options.conversationsLimitations || ["DM and thread history depend on the active Slock agent context."],
    ),
    executions: supportCapability(
      "unknown",
      ["network_proxy", "managed_launcher"],
      ["Slock server active state is not treated as execution running evidence."],
      ["Execution state requires activity events, an observer, or a proxy path; task-board in_progress is not enough."],
    ),
  };
}

function normalizeOpenClawExecutionStatus(status) {
  if (status === "succeeded") return "succeeded";
  if (status === "cancelled") return "cancelled";
  if (status === "queued" || status === "pending") return "queued";
  if (status === "running" || status === "in_progress") return "running";
  if (status === "failed" || status === "lost" || status === "timed_out" || status === "timeout") return "failed";
  return "unknown";
}

function normalizeMulticaWorkItemStatus(status) {
  if (status === "todo" || status === "backlog" || status === "open") return "todo";
  if (status === "in_progress" || status === "running") return "in_progress";
  if (status === "in_review" || status === "review") return "in_review";
  if (status === "done" || status === "completed" || status === "succeeded") return "done";
  if (status === "blocked") return "blocked";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  return "unknown";
}

function normalizeMulticaExecutionStatus(status) {
  if (status === "completed" || status === "succeeded" || status === "done") return "succeeded";
  if (status === "failed" || status === "error") return "failed";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "queued" || status === "pending") return "queued";
  if (status === "running" || status === "in_progress") return "running";
  return "unknown";
}

function normalizeSlockWorkItemStatus(status) {
  if (status === "todo" || status === "backlog" || status === "open") return "todo";
  if (status === "in_progress" || status === "running") return "in_progress";
  if (status === "in_review" || status === "review") return "in_review";
  if (status === "done" || status === "completed" || status === "succeeded") return "done";
  if (status === "blocked") return "blocked";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  return "unknown";
}

function extractOpenClawSessionKey(session) {
  if (typeof session === "string") return session;
  if (!session || typeof session !== "object") return "";
  return session.sessionKey || session.session_key || session.key || session.id || session.requesterSessionKey || session.childSessionKey || "";
}

function addOpenClawSession(sessionMap, runtimeId, agentId, session, observedAt, fallbackStatus = "unknown") {
  const sessionKey = extractOpenClawSessionKey(session);
  if (!sessionKey) return;
  const existing = sessionMap.get(sessionKey) || {};
  const lastActivityAt = toIsoTimestamp(session?.updatedAt || session?.updated_at || session?.lastActivityAt || session?.last_activity_at || session?.lastEventAt);
  sessionMap.set(sessionKey, {
    id: `${runtimeId}:conversation:${sanitizeId(sessionKey)}`,
    source: "openclaw",
    externalId: sessionKey,
    status: session?.status === "active" || fallbackStatus === "active" ? "active" : existing.status || fallbackStatus,
    agentId: existing.agentId || agentId,
    runtimeId,
    ...(lastActivityAt || existing.lastActivityAt ? { lastActivityAt: lastActivityAt || existing.lastActivityAt } : {}),
    lastSeenAt: observedAt,
    sourceRefs: [{ source: "openclaw", externalId: sessionKey }],
  });
}

function collectOpenClawWorkState(deviceId, observedAt) {
  if (!commandExists("openclaw")) {
    return {
      workItems: [],
      conversations: [],
      executions: [],
      capabilities: [openClawWorkStateCapability(observedAt)],
      warnings: ["OpenClaw work-state probe unavailable: openclaw command not found."],
    };
  }

  const health = runJson("openclaw", ["health", "--json", "--timeout", "5000"]);
  const status = runJson("openclaw", ["status", "--json", "--timeout", "5000"]);
  const taskReport = runJson("openclaw", ["tasks", "list", "--json"], 20_000);
  const tasks = toArray(taskReport, ["tasks"]);
  const gateway = status?.gateway;
  const runtimeId = makeRuntimeId(deviceId, "openclaw", gateway?.url ? `gateway-${gateway.url}` : "gateway-local");
  const sessionMap = new Map();

  const healthAgents = toArray(health?.agents, ["agents"]);
  const statusAgents = toArray(status?.agents?.agents || status?.agents, ["agents"]);
  for (const agent of [...healthAgents, ...statusAgents]) {
    const agentExternalId = agent?.agentId || agent?.agent_id || agent?.id || "main";
    const agentId = makeAgentId(runtimeId, agentExternalId);
    const recentSessions = [
      ...toArray(agent?.sessions?.recent, ["sessions"]),
      ...toArray(agent?.sessions?.recentSessions, ["sessions"]),
      ...toArray(agent?.recentSessions, ["sessions"]),
    ];
    for (const session of recentSessions) addOpenClawSession(sessionMap, runtimeId, agentId, session, observedAt, session?.status || "unknown");
  }

  const executions = tasks.map((task) => {
    const taskId = task.taskId || task.task_id || task.id || task.runId || "task";
    const runId = task.runId || task.run_id || taskId;
    const agentExternalId = task.agentId || task.agent_id || "main";
    const agentId = makeAgentId(runtimeId, agentExternalId);
    const sessionKey = task.requesterSessionKey || task.requester_session_key || task.childSessionKey || task.child_session_key || task.sessionKey || task.session_key;
    if (sessionKey) {
      addOpenClawSession(
        sessionMap,
        runtimeId,
        agentId,
        {
          sessionKey,
          lastEventAt: task.lastEventAt || task.last_event_at || task.startedAt || task.started_at,
          status: normalizeOpenClawExecutionStatus(task.status) === "running" ? "active" : "idle",
        },
        observedAt,
        normalizeOpenClawExecutionStatus(task.status) === "running" ? "active" : "idle",
      );
    }
    const error = task.error || task.lastError || task.last_error;
    const executionKey = taskId && String(taskId) !== String(runId)
      ? `${sanitizeId(runId)}-${sanitizeId(taskId)}`
      : sanitizeId(runId);
    return {
      id: `${runtimeId}:execution:${executionKey}`,
      source: "openclaw",
      externalId: String(runId),
      runtimeId,
      agentId,
      ...(sessionKey ? { conversationId: `${runtimeId}:conversation:${sanitizeId(sessionKey)}` } : {}),
      status: normalizeOpenClawExecutionStatus(task.status),
      ...(toIsoTimestamp(task.createdAt || task.created_at) ? { queuedAt: toIsoTimestamp(task.createdAt || task.created_at) } : {}),
      ...(toIsoTimestamp(task.startedAt || task.started_at) ? { startedAt: toIsoTimestamp(task.startedAt || task.started_at) } : {}),
      ...(toIsoTimestamp(task.endedAt || task.ended_at || task.completedAt || task.completed_at) ? { endedAt: toIsoTimestamp(task.endedAt || task.ended_at || task.completedAt || task.completed_at) } : {}),
      lastSeenAt: toIsoTimestamp(task.lastEventAt || task.last_event_at || task.endedAt || task.ended_at || task.startedAt || task.started_at) || observedAt,
      ...(error ? { error: String(error).slice(0, 240) } : {}),
      sourceRefs: [{ source: "openclaw", externalId: String(taskId) }],
    };
  });

  const warnings = [];
  if (!taskReport) warnings.push("OpenClaw work-state probe unavailable: openclaw tasks list --json failed or returned non-JSON.");
  if (!health && !status) warnings.push("OpenClaw conversation probe unavailable: health/status failed or returned non-JSON.");

  return {
    workItems: [],
    conversations: Array.from(sessionMap.values()),
    executions,
    capabilities: [
      openClawWorkStateCapability(observedAt, {
        conversationsSupport: health || status || sessionMap.size > 0 ? "partial" : "unknown",
        conversationsEvidence: health || status || sessionMap.size > 0
          ? ["openclaw health/status or task session keys exposed recent session evidence."]
          : undefined,
        executionsSupport: taskReport ? "supported" : "unknown",
        executionsEvidence: taskReport ? ["openclaw tasks list --json exposed task and run status."] : undefined,
      }),
    ],
    warnings,
  };
}

function runtimeIdFromMulticaRuntime(deviceId, runtime) {
  return makeRuntimeId(deviceId, "multica", runtime?.id || runtime?.name || runtime?.provider || "runtime");
}

function runtimeIdForMulticaAgent(deviceId, agent, runtimeIdByExternalId) {
  return runtimeIdByExternalId.get(agent?.runtime_id || agent?.runtimeId) ||
    makeRuntimeId(deviceId, "multica", agent?.runtime_id || agent?.runtimeId || "unknown-runtime");
}

function collectMulticaWorkState(deviceId, observedAt) {
  if (!commandExists("multica")) {
    return {
      workItems: [],
      conversations: [],
      executions: [],
      capabilities: [multicaWorkStateCapability(observedAt)],
      warnings: ["Multica work-state probe unavailable: multica command not found."],
    };
  }

  const runtimeReport = runJson("multica", ["runtime", "list", "--output", "json"]);
  const agentReport = runJson("multica", ["agent", "list", "--output", "json"]);
  const issueReport = runJson("multica", ["issue", "list", "--output", "json"], 20_000);
  const runtimes = toArray(runtimeReport, ["runtimes"]);
  const agents = toArray(agentReport, ["agents"]);
  const issues = toArray(issueReport, ["issues"]);
  const runtimeIdByExternalId = new Map(
    runtimes.map((runtime) => [runtime.id || runtime.name || runtime.provider, runtimeIdFromMulticaRuntime(deviceId, runtime)]),
  );
  const agentByExternalId = new Map(agents.map((agent) => [agent.id || agent.name, agent]));
  const firstRuntimeId = runtimes.length ? runtimeIdFromMulticaRuntime(deviceId, runtimes[0]) : makeRuntimeId(deviceId, "multica", "unknown-runtime");

  const workItems = issues.map((issue) => {
    const issueId = issue.id || issue.identifier || issue.number || "issue";
    const assigneeId = issue.assignee_id || issue.assigneeId || issue.assignee?.id || issue.assignee;
    const assigneeAgent = assigneeId ? agentByExternalId.get(assigneeId) : undefined;
    const runtimeId = issue.runtime_id
      ? makeRuntimeId(deviceId, "multica", issue.runtime_id)
      : assigneeAgent
        ? runtimeIdForMulticaAgent(deviceId, assigneeAgent, runtimeIdByExternalId)
        : firstRuntimeId;
    const agentId = assigneeId && (issue.assignee_type === "agent" || assigneeAgent)
      ? makeAgentId(runtimeId, assigneeId)
      : undefined;
    return {
      id: `${runtimeId}:work-item:${sanitizeId(issueId)}`,
      source: "multica",
      externalId: String(issueId),
      title: issue.title || issue.name || issue.identifier || String(issueId),
      ...(issue.description ? { description: String(issue.description).slice(0, 500) } : {}),
      status: normalizeMulticaWorkItemStatus(issue.status),
      ...(assigneeId ? { assignee: { kind: issue.assignee_type === "agent" || assigneeAgent ? "agent" : "unknown", label: String(issue.assignee_name || issue.assigneeName || assigneeId), externalId: String(assigneeId) } } : {}),
      ...(issue.creator_id || issue.creatorId || issue.creator ? { creator: { kind: issue.creator_type === "agent" ? "agent" : "human", label: String(issue.creator_name || issue.creatorName || issue.creator_id || issue.creatorId || issue.creator), externalId: String(issue.creator_id || issue.creatorId || issue.creator) } } : {}),
      ...(agentId ? { agentId } : {}),
      runtimeId,
      ...(toIsoTimestamp(issue.created_at || issue.createdAt) ? { createdAt: toIsoTimestamp(issue.created_at || issue.createdAt) } : {}),
      ...(toIsoTimestamp(issue.updated_at || issue.updatedAt) ? { updatedAt: toIsoTimestamp(issue.updated_at || issue.updatedAt) } : {}),
      lastSeenAt: toIsoTimestamp(issue.updated_at || issue.updatedAt || issue.created_at || issue.createdAt) || observedAt,
      sourceRefs: [{ source: "multica", externalId: String(issue.identifier || issueId) }],
    };
  });

  const conversationsById = new Map();
  const executions = [];
  let taskProbeSucceeded = false;
  for (const agent of agents) {
    const agentExternalId = agent.id || agent.name;
    if (!agentExternalId) continue;
    const taskReport = runJson("multica", ["agent", "tasks", String(agentExternalId), "--output", "json"], 20_000);
    if (taskReport) taskProbeSucceeded = true;
    const tasks = toArray(taskReport, ["tasks", "runs"]);
    for (const task of tasks) {
      const taskId = task.id || task.task_id || task.run_id || task.runId || "task";
      const runtimeId = task.runtime_id
        ? makeRuntimeId(deviceId, "multica", task.runtime_id)
        : runtimeIdForMulticaAgent(deviceId, agent, runtimeIdByExternalId);
      const executionAgentId = makeAgentId(runtimeId, task.agent_id || task.agentId || agentExternalId);
      const issueId = task.issue_id || task.issueId;
      const workItemId = issueId ? `${runtimeId}:work-item:${sanitizeId(issueId)}` : undefined;
      const chatSessionId = task.chat_session_id || task.chatSessionId;
      const conversationId = chatSessionId ? `${runtimeId}:conversation:${sanitizeId(chatSessionId)}` : undefined;
      if (chatSessionId) {
        conversationsById.set(chatSessionId, {
          id: conversationId,
          source: "multica",
          externalId: String(chatSessionId),
          status: normalizeMulticaExecutionStatus(task.status) === "running" ? "active" : "idle",
          ...(workItemId ? { workItemId } : {}),
          agentId: executionAgentId,
          runtimeId,
          ...(toIsoTimestamp(task.started_at || task.startedAt || task.created_at || task.createdAt) ? { startedAt: toIsoTimestamp(task.started_at || task.startedAt || task.created_at || task.createdAt) } : {}),
          lastSeenAt: toIsoTimestamp(task.completed_at || task.completedAt || task.started_at || task.startedAt || task.created_at || task.createdAt) || observedAt,
          sourceRefs: [{ source: "multica", externalId: String(chatSessionId) }],
        });
      }
      executions.push({
        id: `${runtimeId}:execution:${sanitizeId(taskId)}`,
        source: "multica",
        externalId: String(taskId),
        runtimeId,
        agentId: executionAgentId,
        ...(workItemId ? { workItemId } : {}),
        ...(conversationId ? { conversationId } : {}),
        status: normalizeMulticaExecutionStatus(task.status),
        ...(toIsoTimestamp(task.created_at || task.createdAt) ? { queuedAt: toIsoTimestamp(task.created_at || task.createdAt) } : {}),
        ...(toIsoTimestamp(task.started_at || task.startedAt || task.dispatched_at || task.dispatchedAt) ? { startedAt: toIsoTimestamp(task.started_at || task.startedAt || task.dispatched_at || task.dispatchedAt) } : {}),
        ...(toIsoTimestamp(task.completed_at || task.completedAt || task.ended_at || task.endedAt) ? { endedAt: toIsoTimestamp(task.completed_at || task.completedAt || task.ended_at || task.endedAt) } : {}),
        lastSeenAt: toIsoTimestamp(task.updated_at || task.updatedAt || task.completed_at || task.completedAt || task.started_at || task.startedAt) || observedAt,
        ...(task.error ? { error: String(task.error).slice(0, 240) } : {}),
        sourceRefs: [{ source: "multica", externalId: String(taskId) }],
      });
    }
  }

  const warnings = [];
  if (!issueReport) warnings.push("Multica work-state probe unavailable: multica issue list --output json failed or returned non-JSON.");
  if (!agentReport) warnings.push("Multica execution probe unavailable: multica agent list --output json failed or returned non-JSON.");
  if (agents.length > 0 && !taskProbeSucceeded) warnings.push("Multica execution probe unavailable: multica agent tasks failed for every agent.");

  return {
    workItems,
    conversations: Array.from(conversationsById.values()),
    executions,
    capabilities: [
      multicaWorkStateCapability(observedAt, {
        workItemsSupport: issueReport ? "supported" : "unknown",
        workItemsEvidence: issueReport ? ["multica issue list --output json exposed issue lifecycle fields."] : undefined,
        conversationsSupport: conversationsById.size > 0 ? "partial" : taskProbeSucceeded ? "partial" : "unknown",
        conversationsEvidence: conversationsById.size > 0 || taskProbeSucceeded ? ["multica agent tasks can expose chat_session_id for task-linked conversations."] : undefined,
        executionsSupport: taskProbeSucceeded ? "supported" : "unknown",
        executionsEvidence: taskProbeSucceeded ? ["multica agent tasks <agent-id> --output json exposed task status and timestamps."] : undefined,
      }),
    ],
    warnings,
  };
}

function normalizeSlockTask(rawTask, runtimeId, agentId, channel, observedAt) {
  const taskId = rawTask.id || rawTask.taskId || rawTask.messageId || rawTask.taskNumber || "task";
  const threadId = rawTask.threadId || rawTask.thread_id;
  return {
    id: `${runtimeId}:work-item:${sanitizeId(taskId)}`,
    source: "slock",
    externalId: String(taskId),
    title: rawTask.title || rawTask.content || rawTask.summary || String(taskId),
    status: normalizeSlockWorkItemStatus(rawTask.status || rawTask.taskStatus || rawTask.task_status),
    channel: { kind: "slock", label: channel.label, externalId: channel.externalId },
    ...(rawTask.claimedByName || rawTask.assigneeName ? { assignee: { kind: "agent", label: rawTask.claimedByName || rawTask.assigneeName } } : {}),
    ...(rawTask.createdByName || rawTask.creatorName ? { creator: { kind: "human", label: rawTask.createdByName || rawTask.creatorName } } : {}),
    agentId,
    runtimeId,
    ...(threadId ? { conversationId: `${runtimeId}:conversation:${sanitizeId(threadId)}` } : {}),
    ...(toIsoTimestamp(rawTask.createdAt || rawTask.created_at) ? { createdAt: toIsoTimestamp(rawTask.createdAt || rawTask.created_at) } : {}),
    ...(toIsoTimestamp(rawTask.updatedAt || rawTask.updated_at || rawTask.completedAt || rawTask.completed_at) ? { updatedAt: toIsoTimestamp(rawTask.updatedAt || rawTask.updated_at || rawTask.completedAt || rawTask.completed_at) } : {}),
    lastSeenAt: toIsoTimestamp(rawTask.updatedAt || rawTask.updated_at || rawTask.completedAt || rawTask.completed_at || rawTask.createdAt || rawTask.created_at) || observedAt,
    sourceRefs: [{ source: "slock", externalId: String(rawTask.taskNumber || rawTask.task_number || taskId) }],
  };
}

function collectSlockWorkState(deviceId, observedAt, config) {
  const runtimeId = makeRuntimeId(deviceId, "slock", "slock-daemon");
  const agentId = makeAgentId(runtimeId, config.slockAgentId || "unknown-agent");
  const channels = Array.isArray(config.slockTaskChannels) ? config.slockTaskChannels : [];
  const hasWorkspace = existsSync(path.join(homeDir(), ".slock", "agents"));

  if (!commandExists("slock") || channels.length === 0) {
    const reason = !commandExists("slock")
      ? "slock command not found"
      : "config.slockTaskChannels is empty";
    return {
      workItems: [],
      conversations: [],
      executions: [],
      capabilities: [
        slockWorkStateCapability(observedAt, {
          workItemsEvidence: hasWorkspace
            ? [`Slock workspace agent files exist, but task-board probe is unavailable: ${reason}.`]
            : [`Slock task-board probe is unavailable: ${reason}.`],
          conversationsEvidence: [`Slock conversation probe is unavailable: ${reason}.`],
        }),
      ],
      warnings: [`Slock work-state probe unavailable: ${reason}.`],
    };
  }

  const workItems = [];
  const conversations = [];
  const warnings = [];
  for (const channelEntry of channels) {
    const channel = typeof channelEntry === "string"
      ? { label: channelEntry, externalId: channelEntry }
      : { label: channelEntry.label || channelEntry.externalId || channelEntry.id || "Slock channel", externalId: channelEntry.externalId || channelEntry.id || channelEntry.label || "unknown" };
    const taskReport = runJson("slock", ["task", "list", "--channel", channel.externalId, "--output", "json"], 20_000) ||
      runJson("slock", ["task", "list", "--channel", channel.externalId], 20_000);
    if (!taskReport) {
      warnings.push(`Slock task-board probe failed for channel ${channel.label}.`);
      continue;
    }
    const tasks = toArray(taskReport, ["tasks"]);
    for (const rawTask of tasks) {
      const workItem = normalizeSlockTask(rawTask, runtimeId, agentId, channel, observedAt);
      workItems.push(workItem);
      const threadId = rawTask.threadId || rawTask.thread_id;
      if (threadId) {
        conversations.push({
          id: `${runtimeId}:conversation:${sanitizeId(threadId)}`,
          source: "slock",
          externalId: String(threadId),
          status: workItem.status === "done" || workItem.status === "cancelled" ? "closed" : "open",
          channel: workItem.channel,
          title: workItem.title,
          workItemId: workItem.id,
          agentId,
          runtimeId,
          lastActivityAt: workItem.updatedAt,
          lastSeenAt: observedAt,
          sourceRefs: [{ source: "slock", externalId: String(rawTask.messageId || rawTask.id || threadId) }],
        });
      }
    }
  }

  return {
    workItems,
    conversations,
    executions: [],
    capabilities: [
      slockWorkStateCapability(observedAt, {
        workItemsSupport: workItems.length > 0 || warnings.length < channels.length ? "supported" : "unknown",
        workItemsEvidence: workItems.length > 0 || warnings.length < channels.length
          ? ["slock task list --channel <channel> exposed task board fields."]
          : undefined,
        conversationsSupport: conversations.length > 0 ? "partial" : "unknown",
        conversationsEvidence: conversations.length > 0 ? ["Slock task board exposed threadId/messageId for conversation linkage."] : undefined,
      }),
    ],
    warnings,
  };
}

function mergeWorkStateParts(parts) {
  return {
    workItems: parts.flatMap((part) => part.workItems),
    conversations: parts.flatMap((part) => part.conversations),
    executions: parts.flatMap((part) => part.executions),
    capabilities: parts.flatMap((part) => part.capabilities),
    warnings: parts.flatMap((part) => part.warnings || []),
  };
}

function collectWorkStateSnapshot(config, args) {
  const mergedConfig = {
    ...config,
    ...(args.deviceId ? { deviceId: args.deviceId } : {}),
    ...(args.deviceName ? { deviceName: args.deviceName } : {}),
  };
  const observedAt = isoNow();
  const device = createDevice(mergedConfig, observedAt);
  const collected = mergeWorkStateParts([
    collectOpenClawWorkState(device.id, observedAt),
    collectMulticaWorkState(device.id, observedAt),
    collectSlockWorkState(device.id, observedAt, mergedConfig),
  ]);

  return {
    observedAt,
    deviceId: device.id,
    workItems: collected.workItems,
    conversations: collected.conversations,
    executions: collected.executions,
    capabilities: collected.capabilities,
    ...(collected.warnings.length ? { warnings: collected.warnings } : {}),
  };
}

async function runWorkStateOnce(config, args) {
  const snapshot = collectWorkStateSnapshot(config, args);
  const serverUrl = args.serverUrl || config.serverUrl || "";
  if (serverUrl && !args.printOnly) await postWorkStateSnapshot(serverUrl, snapshot);
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

  if (args.workStateOnce) {
    await runWorkStateOnce(config, args);
    return;
  }

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
