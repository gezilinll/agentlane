import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
    expect(config).toMatchObject({ deviceId: "test-device", deviceName: "Test Device" });
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
});

function runNodeScript(args: string[]): Promise<string> {
  return runCommand(process.execPath, args);
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
