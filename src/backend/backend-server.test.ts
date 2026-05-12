import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import { hashSecret } from "../auth/auth-crypto";
import type { AuthStore } from "../auth/auth-store";
import type { RuntimeInventorySnapshot, RuntimeWorkStateSnapshot } from "../runtime";
import { createTemporaryPostgresDatabase, runMigrationsScript, shouldRunPostgresTests } from "../test/postgres";
import { createAgentlaneBackendServer, type AgentlaneBackendServer } from "./backend-server";

const describeDb = shouldRunPostgresTests() ? describe : describe.skip;
const backends: AgentlaneBackendServer[] = [];

afterEach(async () => {
  await Promise.all(backends.map((backend) => backend.close()));
  backends.length = 0;
});

describe("standalone Agentlane backend server", () => {
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

  it("authenticates device control websocket with the hello device token", async () => {
    const backend = await startBackend({
      authPepper: "test-pepper",
      authStore: createDeviceTokenAuthStore("device-token-ok"),
      deviceTokenRequired: true,
    });
    const socket = new WebSocket(`${backend.wsUrl}/api/device-control/ws`);
    await waitForOpen(socket);

    const helloAckPromise = waitForMessage(socket);
    socket.send(JSON.stringify({
      type: "hello",
      deviceId: "secured-device",
      deviceToken: "device-token-ok",
    }));
    const helloAck = await helloAckPromise;

    expect(helloAck).toMatchObject({ type: "hello.ack", deviceId: "secured-device" });

    socket.close();
  });

  it("closes device control websocket when the hello device token is invalid", async () => {
    const backend = await startBackend({
      authPepper: "test-pepper",
      authStore: createDeviceTokenAuthStore("device-token-ok"),
      deviceTokenRequired: true,
    });
    const socket = new WebSocket(`${backend.wsUrl}/api/device-control/ws`);
    await waitForOpen(socket);

    const closePromise = waitForClose(socket);
    socket.send(JSON.stringify({
      type: "hello",
      deviceId: "secured-device",
      deviceToken: "wrong-token",
    }));

    await expect(closePromise).resolves.toBe(1008);
  });
});

describeDb("standalone Agentlane backend server with Postgres", () => {
  it("persists collector posts and serves formal query APIs", async () => {
    const database = await createTemporaryPostgresDatabase();
    let backend: AgentlaneBackendServer | null = null;
    try {
      runMigrationsScript(database.url);
      backend = await startBackend({ databaseUrl: database.url });
      const inventorySnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
      const workStateSnapshot = createWorkStateSnapshot(inventorySnapshot);

      const inventoryResponse = await postJson(`${backend.url}/api/device-snapshots`, inventorySnapshot);
      const workStateResponse = await postJson(`${backend.url}/api/runtime-work-state-snapshots`, workStateSnapshot);
      const fleetResponse = await fetch(`${backend.url}/api/runtime-fleet`);
      const workItemsResponse = await fetch(`${backend.url}/api/runtime-work-items?source=slock&stage=processing`);

      expect(inventoryResponse.status).toBe(201);
      expect(workStateResponse.status).toBe(201);
      await expect(fleetResponse.json()).resolves.toMatchObject({
        summary: { agentCount: 2, deviceCount: 1, runtimeCount: 2 },
        devices: [expect.objectContaining({ id: "fixture-mac" })],
      });
      await expect(workItemsResponse.json()).resolves.toMatchObject({
        total: 1,
        items: [expect.objectContaining({
          id: workStateSnapshot.workItems[0].id,
          source: "slock",
          stage: "processing",
          title: "AGTD-001 Fix queue handoff",
        })],
      });
    } finally {
      if (backend) await closeRegisteredBackend(backend);
      await database.drop();
    }
  });
});

async function startBackend(options: {
  authPepper?: string;
  authStore?: AuthStore;
  createCommandId?: () => string;
  databaseUrl?: string;
  deviceTokenRequired?: boolean;
} = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "agentlane-standalone-backend-"));
  const backend = createAgentlaneBackendServer({
    createCommandId: options.createCommandId,
    databaseUrl: options.databaseUrl,
    authPepper: options.authPepper,
    authStore: options.authStore,
    deviceTokenRequired: options.deviceTokenRequired,
    host: "127.0.0.1",
    inventorySnapshotPath: path.join(dataDir, "runtime-inventory.json"),
    port: 0,
    workStateSnapshotPath: path.join(dataDir, "runtime-work-state.json"),
  });
  backends.push(backend);
  await backend.listen();
  return backend;
}

function createDeviceTokenAuthStore(validToken: string): AuthStore {
  const validHash = hashSecret(validToken, "device-token", "test-pepper");
  return {
    verifyDeviceToken: async (tokenHash: string) => (
      tokenHash === validHash
        ? { id: "devtok_1", organizationId: "org_1", tokenPrefix: "agt_device_" }
        : null
    ),
  } as unknown as AuthStore;
}

async function closeRegisteredBackend(backend: AgentlaneBackendServer): Promise<void> {
  await backend.close();
  const index = backends.indexOf(backend);
  if (index >= 0) backends.splice(index, 1);
}

function postJson(url: string, payload: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function createWorkStateSnapshot(snapshot: RuntimeInventorySnapshot): RuntimeWorkStateSnapshot {
  const runtime = snapshot.runtimes.find((item) => item.kind === "slock");
  const agent = snapshot.agents.find((item) => item.origin === "slock");
  if (!runtime || !agent) throw new Error("fixture must include slock runtime and agent");

  const workItemId = `${runtime.id}:work-item:task-1`;
  const conversationId = `${runtime.id}:conversation:thread-1`;
  return {
    observedAt: "2026-05-10T10:00:00.000Z",
    deviceId: snapshot.device.id,
    workItems: [{
      id: workItemId,
      source: "slock",
      externalId: "task-1",
      title: "AGTD-001 Fix queue handoff",
      description: "PMO asked the Slock agent to inspect queue handoff.",
      status: "in_progress",
      channel: { kind: "other", label: "#AjisGTD", externalId: "AjisGTD" },
      creator: { kind: "human", label: "PMO" },
      assignee: { kind: "agent", label: "tester", objectId: agent.id },
      agentId: agent.id,
      runtimeId: runtime.id,
      conversationId,
      createdAt: "2026-05-10T09:50:00.000Z",
      updatedAt: "2026-05-10T09:58:00.000Z",
      lastSeenAt: "2026-05-10T10:00:00.000Z",
      sourceRefs: [{ source: "slock", externalId: "task-1" }],
    }],
    conversations: [{
      id: conversationId,
      source: "slock",
      externalId: "thread-1",
      status: "active",
      channel: { kind: "other", label: "#AjisGTD", externalId: "AjisGTD" },
      title: "#AjisGTD",
      workItemId,
      agentId: agent.id,
      runtimeId: runtime.id,
      lastSeenAt: "2026-05-10T10:00:00.000Z",
      sourceRefs: [{ source: "slock", externalId: "thread-1" }],
    }],
    executions: [{
      id: `${runtime.id}:execution:run-1`,
      source: "slock",
      externalId: "run-1",
      runtimeId: runtime.id,
      agentId: agent.id,
      workItemId,
      conversationId,
      status: "running",
      startedAt: "2026-05-10T09:51:00.000Z",
      lastSeenAt: "2026-05-10T10:00:00.000Z",
      sourceRefs: [{ source: "slock", externalId: "run-1" }],
    }],
    capabilities: [],
  };
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

function waitForClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    socket.once("close", (code) => resolve(code));
  });
}
