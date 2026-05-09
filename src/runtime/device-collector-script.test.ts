import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const collectorScript = path.join(repoRoot, "scripts", "agentlane-device-collector.mjs");
const installerScript = path.join(repoRoot, "scripts", "install-device-collector.sh");
const fixturePath = path.join(repoRoot, "fixtures", "runtime", "collector-snapshot.sample.json");

describe("device collector scripts", () => {
  it("prints a normalized snapshot from a fixture in once mode", () => {
    const output = execFileSync(process.execPath, [
      collectorScript,
      "--once",
      "--fixture",
      fixturePath,
      "--print-only",
    ], { encoding: "utf8" });

    const snapshot = JSON.parse(output);

    expect(snapshot.device.id).toBe("fixture-mac");
    expect(snapshot.runtimes.map((runtime: { kind: string }) => runtime.kind)).toContain("openclaw");
    expect(snapshot.agents.map((agent: { name: string }) => agent.name)).toContain("tester");
  });

  it("installs the collector from a local source path and runs a once check", () => {
    const installDir = mkdtempSync(path.join(tmpdir(), "agentlane-collector-"));

    const output = execFileSync("bash", [
      installerScript,
      "--source-dir",
      repoRoot,
      "--install-dir",
      installDir,
      "--device-id",
      "test-device",
      "--device-name",
      "Test Device",
      "--ws-url",
      "ws://agentlane.local/api/device-control/ws",
      "--once",
      "--no-service",
      "--fixture",
      fixturePath,
    ], { encoding: "utf8" });

    const configPath = path.join(installDir, "config.json");
    const installedCollector = path.join(installDir, "agentlane-device-collector.mjs");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const snapshot = JSON.parse(output.slice(output.indexOf("{")));

    expect(existsSync(installedCollector)).toBe(true);
    expect(config).toMatchObject({
      deviceId: "test-device",
      deviceName: "Test Device",
      wsUrl: "ws://agentlane.local/api/device-control/ws",
    });
    expect(snapshot.device.id).toBe("test-device");
    expect(snapshot.device.name).toBe("Test Device");
  });

  it("posts during installer once mode when a server url is configured", async () => {
    const installDir = mkdtempSync(path.join(tmpdir(), "agentlane-collector-"));
    const { server, receivedSnapshot, baseUrl } = await startSnapshotServer();

    try {
      const output = await runCommand("bash", [
        installerScript,
        "--source-dir",
        repoRoot,
        "--install-dir",
        installDir,
        "--server-url",
        baseUrl,
        "--once",
        "--no-service",
        "--fixture",
        fixturePath,
      ]);
      const configPath = path.join(installDir, "config.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      const snapshot = await receivedSnapshot;

      expect(output).toBe("");
      expect(config.serverUrl).toBe(baseUrl);
      expect((snapshot.device as { id: string }).id).toBe("fixture-mac");
    } finally {
      server.close();
    }
  });

  it("uses config device identity during live once collection", () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), "agentlane-empty-home-"));
    const configDir = mkdtempSync(path.join(tmpdir(), "agentlane-collector-config-"));
    const configPath = path.join(configDir, "config.json");
    writeFileSync(configPath, JSON.stringify({
      deviceId: "config-device",
      deviceName: "Config Device",
      intervalMs: 60_000,
    }));

    const output = execFileSync(process.execPath, [
      collectorScript,
      "--once",
      "--config",
      configPath,
      "--print-only",
    ], {
      encoding: "utf8",
      env: { ...process.env, AGENTLANE_COLLECTOR_HOME: fakeHome, PATH: "/usr/bin:/bin" },
    });

    const snapshot = JSON.parse(output);

    expect(snapshot.device.id).toBe("config-device");
    expect(snapshot.device.name).toBe("Config Device");
  });

  it("posts a once snapshot to the Agentlane backend when server url is configured", async () => {
    const { server, receivedSnapshot, baseUrl } = await startSnapshotServer();

    try {
      const output = await runNodeScript([
        collectorScript,
        "--once",
        "--fixture",
        fixturePath,
        "--server-url",
        baseUrl,
      ]);
      const snapshot = await receivedSnapshot;

      expect(output).toBe("");
      expect((snapshot.device as { id: string }).id).toBe("fixture-mac");
      expect((snapshot.runtimes as Array<{ kind: string }>).map((runtime) => runtime.kind)).toContain("slock");
    } finally {
      server.close();
    }
  });

  it("does not fabricate runtime work-state when live probes are unavailable", () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), "agentlane-work-state-empty-home-"));

    const output = execFileSync(process.execPath, [
      collectorScript,
      "--work-state-once",
      "--device-id",
      "live-empty-device",
      "--print-only",
    ], {
      encoding: "utf8",
      env: { ...process.env, AGENTLANE_COLLECTOR_HOME: fakeHome, PATH: "/usr/bin:/bin" },
    });

    const snapshot = JSON.parse(output);

    expect(snapshot.deviceId).toBe("live-empty-device");
    expect(snapshot.workItems).toEqual([]);
    expect(snapshot.conversations).toEqual([]);
    expect(snapshot.executions).toEqual([]);
    expect(snapshot.capabilities.map((capability: { source: string }) => capability.source)).toEqual([
      "openclaw",
      "multica",
      "slock",
    ]);
    expect(snapshot.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("OpenClaw work-state probe unavailable"),
      expect.stringContaining("Multica work-state probe unavailable"),
      expect.stringContaining("Slock work-state probe unavailable"),
    ]));
  });

  it("maps live OpenClaw task probes into executions without creating work items", () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), "agentlane-openclaw-work-home-"));
    const fakeBin = mkdtempSync(path.join(tmpdir(), "agentlane-openclaw-work-bin-"));
    writeFakeOpenClaw(fakeBin, {
      health: {
        ok: true,
        agents: [{ id: "main", sessions: { recent: [{ sessionKey: "live-session", updatedAt: "2026-05-09T06:41:00.000Z", status: "active" }] } }],
      },
      status: { gateway: { url: "ws://127.0.0.1:18789", reachable: true } },
      tasks: {
        tasks: [
          {
            taskId: "task-live-1",
            runId: "run-live-1",
            status: "running",
            agentId: "main",
            requesterSessionKey: "live-session",
            createdAt: 1778308800000,
            startedAt: 1778308860000,
            lastEventAt: 1778308920000,
          },
          {
            taskId: "task-live-2",
            runId: "run-live-2",
            status: "lost",
            agentId: "main",
            createdAt: 1778308980000,
            startedAt: 1778309040000,
            endedAt: 1778309100000,
            lastEventAt: 1778309100000,
          },
        ],
      },
    });

    const output = execFileSync(process.execPath, [
      collectorScript,
      "--work-state-once",
      "--device-id",
      "openclaw-live-device",
      "--print-only",
    ], {
      encoding: "utf8",
      env: { ...process.env, AGENTLANE_COLLECTOR_HOME: fakeHome, PATH: `${fakeBin}:/usr/bin:/bin` },
    });

    const snapshot = JSON.parse(output);
    const runningExecution = snapshot.executions.find((execution: { externalId: string }) => execution.externalId === "run-live-1");
    const failedExecution = snapshot.executions.find((execution: { externalId: string }) => execution.externalId === "run-live-2");

    expect(snapshot.workItems.filter((item: { source: string }) => item.source === "openclaw")).toEqual([]);
    expect(runningExecution).toMatchObject({
      source: "openclaw",
      status: "running",
      queuedAt: "2026-05-09T06:40:00.000Z",
      startedAt: "2026-05-09T06:41:00.000Z",
      conversationId: expect.stringContaining("conversation:live-session"),
    });
    expect(failedExecution).toMatchObject({ source: "openclaw", status: "failed" });
    expect(snapshot.conversations).toContainEqual(expect.objectContaining({
      source: "openclaw",
      externalId: "live-session",
      status: "active",
    }));
  });

  it("keeps OpenClaw execution ids unique when the platform repeats run ids", () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), "agentlane-openclaw-duplicate-home-"));
    const fakeBin = mkdtempSync(path.join(tmpdir(), "agentlane-openclaw-duplicate-bin-"));
    writeFakeOpenClaw(fakeBin, {
      health: { ok: true, agents: [{ id: "main" }] },
      status: { gateway: { url: "ws://127.0.0.1:18789", reachable: true } },
      tasks: {
        tasks: [
          { taskId: "task-duplicate-1", runId: "reused-run", status: "succeeded", agentId: "main" },
          { taskId: "task-duplicate-2", runId: "reused-run", status: "failed", agentId: "main" },
        ],
      },
    });

    const output = execFileSync(process.execPath, [
      collectorScript,
      "--work-state-once",
      "--device-id",
      "openclaw-duplicate-device",
      "--print-only",
    ], {
      encoding: "utf8",
      env: { ...process.env, AGENTLANE_COLLECTOR_HOME: fakeHome, PATH: `${fakeBin}:/usr/bin:/bin` },
    });

    const snapshot = JSON.parse(output);
    const executionIds = snapshot.executions.map((execution: { id: string }) => execution.id);

    expect(snapshot.executions.map((execution: { externalId: string }) => execution.externalId)).toEqual([
      "reused-run",
      "reused-run",
    ]);
    expect(new Set(executionIds).size).toBe(executionIds.length);
    expect(executionIds.every((id: string) => id.includes("task-duplicate"))).toBe(true);
  });

  it("maps live Multica issue and agent task probes into work items and executions", () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), "agentlane-multica-work-home-"));
    const fakeBin = mkdtempSync(path.join(tmpdir(), "agentlane-multica-work-bin-"));
    writeFakeMultica(fakeBin, {
      runtimes: [{ id: "runtime-openclaw", provider: "openclaw", name: "Openclaw runtime", status: "online" }],
      agents: [{ id: "agent-1", name: "CMO", runtime_id: "runtime-openclaw", status: "idle" }],
      issues: {
        issues: [
          {
            id: "issue-1",
            identifier: "GDA-31",
            title: "Live Multica issue",
            status: "todo",
            assignee_id: "agent-1",
            assignee_type: "agent",
            creator_id: "member-1",
            creator_type: "member",
            created_at: "2026-05-09T06:30:00.000Z",
            updated_at: "2026-05-09T06:45:00.000Z",
          },
        ],
      },
      tasksByAgentId: {
        "agent-1": {
          tasks: [
            {
              id: "task-1",
              issue_id: "issue-1",
              agent_id: "agent-1",
              runtime_id: "runtime-openclaw",
              chat_session_id: "chat-1",
              status: "running",
              created_at: "2026-05-09T06:40:00.000Z",
              started_at: "2026-05-09T06:41:00.000Z",
            },
          ],
        },
      },
    });

    const output = execFileSync(process.execPath, [
      collectorScript,
      "--work-state-once",
      "--device-id",
      "multica-live-device",
      "--print-only",
    ], {
      encoding: "utf8",
      env: { ...process.env, AGENTLANE_COLLECTOR_HOME: fakeHome, PATH: `${fakeBin}:/usr/bin:/bin` },
    });

    const snapshot = JSON.parse(output);
    const workItem = snapshot.workItems.find((item: { externalId: string }) => item.externalId === "issue-1");
    const execution = snapshot.executions.find((item: { externalId: string }) => item.externalId === "task-1");

    expect(workItem).toMatchObject({
      source: "multica",
      title: "Live Multica issue",
      status: "todo",
      agentId: "multica-live-device:multica:runtime-openclaw:agent:agent-1",
      runtimeId: "multica-live-device:multica:runtime-openclaw",
    });
    expect(execution).toMatchObject({
      source: "multica",
      status: "running",
      workItemId: workItem.id,
      conversationId: "multica-live-device:multica:runtime-openclaw:conversation:chat-1",
    });
    expect(snapshot.conversations).toContainEqual(expect.objectContaining({
      source: "multica",
      externalId: "chat-1",
      status: "active",
    }));
  });

  it("does not invent Slock board state when only workspace agent files are present", () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), "agentlane-slock-work-home-"));
    const agentDir = path.join(fakeHome, ".slock", "agents", "tester");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(path.join(agentDir, "MEMORY.md"), "# tester\n");

    const output = execFileSync(process.execPath, [
      collectorScript,
      "--work-state-once",
      "--device-id",
      "slock-work-device",
      "--print-only",
    ], {
      encoding: "utf8",
      env: { ...process.env, AGENTLANE_COLLECTOR_HOME: fakeHome, PATH: "/usr/bin:/bin" },
    });

    const snapshot = JSON.parse(output);
    const slockCapability = snapshot.capabilities.find((capability: { source: string }) => capability.source === "slock");

    expect(snapshot.workItems.filter((item: { source: string }) => item.source === "slock")).toEqual([]);
    expect(snapshot.executions.filter((item: { source: string }) => item.source === "slock")).toEqual([]);
    expect(slockCapability).toMatchObject({
      source: "slock",
      workItems: { support: "unknown" },
      executions: { support: "unknown" },
    });
  });

  it("posts a runtime work-state once snapshot to the Agentlane backend when server url is configured", async () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), "agentlane-work-state-post-home-"));
    const { server, receivedSnapshot, baseUrl } = await startWorkStateServer();

    try {
      const output = await runNodeScript([
        collectorScript,
        "--work-state-once",
        "--device-id",
        "fixture-device",
        "--server-url",
        baseUrl,
      ], { env: { ...process.env, AGENTLANE_COLLECTOR_HOME: fakeHome, PATH: "/usr/bin:/bin" } });
      const snapshot = await receivedSnapshot;

      expect(output).toBe("");
      expect(snapshot.deviceId).toBe("fixture-device");
      expect(Array.isArray(snapshot.workItems)).toBe(true);
      expect(Array.isArray(snapshot.executions)).toBe(true);
    } finally {
      server.close();
    }
  });

  it("connects to the control channel and handles inventory refresh commands in daemon mode", async () => {
    const controlServer = await startControlServer();
    const child = spawn(process.execPath, [
      collectorScript,
      "--fixture",
      fixturePath,
      "--server-url",
      controlServer.baseUrl,
      "--interval-ms",
      "100000",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      const result = await controlServer.refreshResult;

      expect(result.hello).toMatchObject({
        type: "hello",
        deviceId: "fixture-mac",
        collectorVersion: "0.1.0",
      });
      expect(result.commandResult).toMatchObject({
        type: "command.result",
        commandId: "cmd-refresh-1",
        deviceId: "fixture-mac",
        status: "succeeded",
      });
      expect(result.snapshots.map((snapshot) => (snapshot.device as { id: string }).id)).toEqual([
        "fixture-mac",
        "fixture-mac",
      ]);
    } finally {
      child.kill();
      controlServer.close();
    }
  });

  it("discovers OpenClaw channel bindings from local config without requiring gateway health", () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), "agentlane-openclaw-home-"));
    const configDir = mkdtempSync(path.join(tmpdir(), "agentlane-openclaw-config-"));
    const openclawDir = path.join(fakeHome, ".openclaw");
    mkdirSync(openclawDir, { recursive: true });
    writeFileSync(path.join(openclawDir, "openclaw.json"), JSON.stringify({
      agents: { list: [{ id: "main", default: true }] },
      bindings: [{ agentId: "main", match: { channel: "dingtalk", accountId: "default" } }],
      channels: { dingtalk: { enabled: true } },
    }));
    const configPath = path.join(configDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ deviceId: "openclaw-config-device" }));

    const output = execFileSync(process.execPath, [
      collectorScript,
      "--once",
      "--config",
      configPath,
      "--print-only",
    ], {
      encoding: "utf8",
      env: { ...process.env, AGENTLANE_COLLECTOR_HOME: fakeHome, PATH: "/usr/bin:/bin" },
    });

    const snapshot = JSON.parse(output);
    const openclawAgent = snapshot.agents.find((agent: { origin: string }) => agent.origin === "openclaw");

    expect(openclawAgent?.channelBindings).toContainEqual({
      kind: "dingtalk",
      label: "DingTalk default",
      externalId: "default",
      status: "enabled",
    });
  });

  it("maps OpenClaw historical sessions without treating them as active sessions", () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), "agentlane-openclaw-home-"));
    const fakeBin = mkdtempSync(path.join(tmpdir(), "agentlane-openclaw-bin-"));
    writeFakeOpenClaw(fakeBin, {
      health: { ok: true, channels: { dingtalk: { enabled: true } } },
      status: {
        gateway: {
          url: "ws://127.0.0.1:18789",
          reachable: true,
          self: { version: "2026.4.27" },
        },
        agents: {
          agents: [{ id: "main", sessions: { count: 12 } }],
          totalSessions: 12,
        },
      },
    });

    const output = execFileSync(process.execPath, [
      collectorScript,
      "--once",
      "--device-id",
      "openclaw-device",
      "--print-only",
    ], {
      encoding: "utf8",
      env: { ...process.env, AGENTLANE_COLLECTOR_HOME: fakeHome, PATH: `${fakeBin}:/usr/bin:/bin` },
    });

    const snapshot = JSON.parse(output);
    const runtime = snapshot.runtimes.find((candidate: { kind: string }) => candidate.kind === "openclaw");
    const agent = snapshot.agents.find((candidate: { origin: string }) => candidate.origin === "openclaw");

    expect(runtime.health).toMatchObject({ historicalSessions: 12 });
    expect(runtime.health).not.toHaveProperty("activeSessions");
    expect(agent.status).toBe("idle");
    expect(agent.load).toMatchObject({ historicalSessions: 12 });
    expect(agent.load).not.toHaveProperty("activeSessions");
    expect(agent.lastSeenAt).toBe(snapshot.observedAt);
  });

  it("maps Slock workspace-only agents as unknown instead of active", () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), "agentlane-slock-home-"));
    const agentDir = path.join(fakeHome, ".slock", "agents", "tester");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(path.join(agentDir, "MEMORY.md"), "# tester\n");

    const output = execFileSync(process.execPath, [
      collectorScript,
      "--once",
      "--device-id",
      "slock-device",
      "--print-only",
    ], {
      encoding: "utf8",
      env: { ...process.env, AGENTLANE_COLLECTOR_HOME: fakeHome, PATH: "/usr/bin:/bin" },
    });

    const snapshot = JSON.parse(output);
    const agent = snapshot.agents.find((candidate: { origin: string }) => candidate.origin === "slock");

    expect(agent.status).toBe("unknown");
    expect(agent.lastSeenAt).toBe(snapshot.observedAt);
  });
});

function writeFakeOpenClaw(fakeBin: string, payload: { health: unknown; status: unknown; tasks?: unknown }): void {
  const executable = path.join(fakeBin, "openclaw");
  const script = path.join(fakeBin, "openclaw.js");
  writeFileSync(script, `
const payload = ${JSON.stringify(payload)};
const command = process.argv[2];
if (command === "health") {
  console.log(JSON.stringify(payload.health));
  process.exit(0);
}
if (command === "status") {
  console.log(JSON.stringify(payload.status));
  process.exit(0);
}
if (command === "tasks" && process.argv[3] === "list") {
  console.log(JSON.stringify(payload.tasks ?? { tasks: [] }));
  process.exit(0);
}
process.exit(1);
`);
  writeFileSync(executable, `#!/bin/sh
exec "${process.execPath}" "${script}" "$@"
`);
  chmodSync(executable, 0o755);
}

function writeFakeMultica(fakeBin: string, payload: {
  runtimes: unknown;
  agents: unknown;
  issues: unknown;
  tasksByAgentId: Record<string, unknown>;
}): void {
  const executable = path.join(fakeBin, "multica");
  const script = path.join(fakeBin, "multica.js");
  writeFileSync(script, `
const payload = ${JSON.stringify(payload)};
const [resource, action, id] = process.argv.slice(2);
if (resource === "runtime" && action === "list") {
  console.log(JSON.stringify(payload.runtimes));
  process.exit(0);
}
if (resource === "agent" && action === "list") {
  console.log(JSON.stringify(payload.agents));
  process.exit(0);
}
if (resource === "agent" && action === "tasks") {
  console.log(JSON.stringify(payload.tasksByAgentId[id] ?? { tasks: [] }));
  process.exit(0);
}
if (resource === "issue" && action === "list") {
  console.log(JSON.stringify(payload.issues));
  process.exit(0);
}
if (resource === "daemon" && action === "status") {
  console.log(JSON.stringify({ status: "running", active_task_count: 1 }));
  process.exit(0);
}
process.exit(1);
`);
  writeFileSync(executable, `#!/bin/sh
exec "${process.execPath}" "${script}" "$@"
`);
  chmodSync(executable, 0o755);
}

function runNodeScript(args: string[], options: { env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  return runCommand(process.execPath, args, options);
}

function runCommand(command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `node script exited with ${code ?? "unknown status"}`));
    });
  });
}

async function startSnapshotServer(): Promise<{
  server: Server;
  receivedSnapshot: Promise<Record<string, unknown>>;
  baseUrl: string;
}> {
  let server: Server | undefined;
  const receivedSnapshot = new Promise<Record<string, unknown>>((resolve) => {
    server = createServer((request, response) => {
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/api/device-snapshots");

      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        resolve(JSON.parse(body));
      });
    });
  });

  if (!server) throw new Error("failed to create snapshot server");
  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");

  return {
    server,
    receivedSnapshot,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function startWorkStateServer(): Promise<{
  server: Server;
  receivedSnapshot: Promise<Record<string, unknown>>;
  baseUrl: string;
}> {
  let server: Server | undefined;
  const receivedSnapshot = new Promise<Record<string, unknown>>((resolve) => {
    server = createServer((request, response) => {
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/api/runtime-work-state-snapshots");

      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        resolve(JSON.parse(body));
      });
    });
  });

  if (!server) throw new Error("failed to create work state server");
  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");

  return {
    server,
    receivedSnapshot,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function startControlServer(): Promise<{
  baseUrl: string;
  close: () => void;
  refreshResult: Promise<{
    hello: Record<string, unknown>;
    commandResult: Record<string, unknown>;
    snapshots: Array<Record<string, unknown>>;
  }>;
}> {
  const snapshots: Array<Record<string, unknown>> = [];
  let webSocketServer: WebSocketServer | undefined;
  let server: Server | undefined;
  let helloMessage: Record<string, unknown> | undefined;

  const refreshResult = new Promise<{
    hello: Record<string, unknown>;
    commandResult: Record<string, unknown>;
    snapshots: Array<Record<string, unknown>>;
  }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("collector control refresh timed out")), 5000);

    server = createServer((request, response) => {
      if (request.method !== "POST" || request.url !== "/api/device-snapshots") {
        response.writeHead(404);
        response.end();
        return;
      }

      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        snapshots.push(JSON.parse(body));
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      });
    });

    webSocketServer = new WebSocketServer({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
      if (request.url !== "/api/device-control/ws") {
        socket.destroy();
        return;
      }
      webSocketServer?.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer?.emit("connection", webSocket, request);
      });
    });
    webSocketServer.on("connection", (webSocket) => {
      webSocket.on("message", (data) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        if (message.type === "hello") {
          helloMessage = message;
          webSocket.send(JSON.stringify({
            type: "inventory.refresh",
            deviceId: message.deviceId,
            commandId: "cmd-refresh-1",
          }));
        }
        if (message.type === "command.result") {
          clearTimeout(timeout);
          resolve({
            hello: helloMessage ?? {},
            commandResult: message,
            snapshots,
          });
        }
      });
    });
  });

  if (!server) throw new Error("failed to create control server");
  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close() {
      webSocketServer?.close();
      server?.close();
    },
    refreshResult,
  };
}
