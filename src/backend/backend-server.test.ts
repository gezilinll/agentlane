import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import type { RuntimeInventorySnapshot } from "../runtime";
import { createAgentlaneBackendServer, type AgentlaneBackendServer } from "./backend-server";

const backends: AgentlaneBackendServer[] = [];

afterEach(async () => {
  await Promise.all(backends.map((backend) => backend.close()));
  backends.length = 0;
});

describe("standalone Agentlane backend server", () => {
  it("accepts collector snapshots and returns latest runtime state over HTTP", async () => {
    const backend = await startBackend();
    const snapshot = {
      ...(fixtureSnapshot as RuntimeInventorySnapshot),
      device: { ...(fixtureSnapshot as RuntimeInventorySnapshot).device, name: "Standalone Backend Mac" },
    };

    const initialResponse = await fetch(`${backend.url}/api/runtime-inventory/latest`);
    expect(initialResponse.status).toBe(404);

    const postResponse = await fetch(`${backend.url}/api/device-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    const latestResponse = await fetch(`${backend.url}/api/runtime-inventory/latest`);
    const latestBody = (await latestResponse.json()) as RuntimeInventorySnapshot;

    expect(postResponse.status).toBe(201);
    expect(latestResponse.status).toBe(200);
    expect(latestBody.device.name).toBe("Standalone Backend Mac");
  });

  it("keeps the device control websocket available outside Vite", async () => {
    const backend = await startBackend({ createCommandId: () => "cmd-standalone-refresh" });
    const socket = new WebSocket(`${backend.wsUrl}/api/device-control/ws`);
    await waitForOpen(socket);

    const helloAckPromise = waitForMessage(socket);
    socket.send(JSON.stringify({
      type: "hello",
      deviceId: "standalone-device",
      deviceName: "Standalone Device",
      collectorVersion: "0.1.0",
    }));
    const helloAck = await helloAckPromise;
    expect(helloAck).toMatchObject({ type: "hello.ack", deviceId: "standalone-device" });

    const commandPromise = waitForMessage(socket);
    const refreshResponse = await fetch(`${backend.url}/api/devices/standalone-device/refresh`, { method: "POST" });
    const refreshBody = await refreshResponse.json();
    const command = await commandPromise;

    expect(refreshResponse.status).toBe(202);
    expect(refreshBody).toMatchObject({
      commandId: "cmd-standalone-refresh",
      status: "sent",
    });
    expect(command).toMatchObject({
      type: "inventory.refresh",
      commandId: "cmd-standalone-refresh",
      deviceId: "standalone-device",
    });

    socket.close();
  });
});

async function startBackend(options: { createCommandId?: () => string } = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "agentlane-standalone-backend-"));
  const backend = createAgentlaneBackendServer({
    createCommandId: options.createCommandId,
    host: "127.0.0.1",
    inventorySnapshotPath: path.join(dataDir, "runtime-inventory.json"),
    port: 0,
    workStateSnapshotPath: path.join(dataDir, "runtime-work-state.json"),
  });
  backends.push(backend);
  await backend.listen();
  return backend;
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

function waitForMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => {
      try {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}
