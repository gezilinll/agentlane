import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import type { RuntimeInventorySnapshot } from "../runtime";
import { createRuntimeControlChannel, type RuntimeControlSocket } from "./runtime-control-channel";
import { createRuntimeHttpApiHandler } from "./runtime-http-api";
import { createRuntimeInventoryStore } from "./runtime-inventory-store";
import { createRuntimeWorkStateStore } from "./runtime-work-state-store";

class MemorySocket implements RuntimeControlSocket {
  readonly sent: unknown[] = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

describe("runtime HTTP API", () => {
  it("returns the latest runtime inventory snapshot", async () => {
    const { baseUrl, store } = await startRuntimeApi();
    const snapshot = {
      ...(fixtureSnapshot as RuntimeInventorySnapshot),
      device: { ...(fixtureSnapshot as RuntimeInventorySnapshot).device, name: "Backend Device" },
    };
    store.writeLatestSnapshot(snapshot);

    const response = await fetch(`${baseUrl}/api/runtime-inventory/latest`);
    const body = (await response.json()) as RuntimeInventorySnapshot;

    expect(response.status).toBe(200);
    expect(body.device.name).toBe("Backend Device");
  });

  it("dispatches a refresh command to a connected device", async () => {
    const { baseUrl, channel } = await startRuntimeApi({ createCommandId: () => "cmd-refresh-1" });
    const socket = new MemorySocket();
    channel.attach(socket);
    channel.receive(socket, JSON.stringify({ type: "hello", deviceId: "fixture-mac" }));

    const response = await fetch(`${baseUrl}/api/devices/fixture-mac/refresh`, { method: "POST" });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      ok: true,
      commandId: "cmd-refresh-1",
      status: "sent",
    });
    expect(socket.sent).toContainEqual(expect.objectContaining({
      type: "inventory.refresh",
      commandId: "cmd-refresh-1",
    }));
  });

  it("returns a clear refresh error when the device is disconnected", async () => {
    const { baseUrl } = await startRuntimeApi();

    const response = await fetch(`${baseUrl}/api/devices/missing-device/refresh`, { method: "POST" });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: "device_not_connected",
      deviceId: "missing-device",
    });
  });

  it("returns command status by device and command id", async () => {
    const { baseUrl, channel } = await startRuntimeApi({ createCommandId: () => "cmd-refresh-1" });
    const socket = new MemorySocket();
    channel.attach(socket);
    channel.receive(socket, JSON.stringify({ type: "hello", deviceId: "fixture-mac" }));
    await fetch(`${baseUrl}/api/devices/fixture-mac/refresh`, { method: "POST" });

    const response = await fetch(`${baseUrl}/api/devices/fixture-mac/commands/cmd-refresh-1`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      commandId: "cmd-refresh-1",
      deviceId: "fixture-mac",
      status: "sent",
    });
  });

  it("accepts and returns the latest runtime work state snapshot", async () => {
    const { baseUrl } = await startRuntimeApi();
    const snapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: [],
      conversations: [],
      executions: [],
      capabilities: [],
    };

    const postResponse = await fetch(`${baseUrl}/api/runtime-work-state-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    const latestResponse = await fetch(`${baseUrl}/api/runtime-work-state/latest`);
    const latestBody = await latestResponse.json();

    expect(postResponse.status).toBe(201);
    expect(latestResponse.status).toBe(200);
    expect(latestBody).toEqual(snapshot);
  });

  it("accepts real-sized runtime work state snapshots from remote collectors", async () => {
    const { baseUrl } = await startRuntimeApi();
    const snapshot = {
      observedAt: "2026-05-10T02:44:20.000Z",
      deviceId: "remote-device",
      workItems: Array.from({ length: 2_200 }, (_, index) => ({
        id: `remote-device:openclaw:work-item:${index}`,
        title: `真实远端工作项 ${index}`,
        description: "x".repeat(1_024),
      })),
      conversations: [],
      executions: [],
      capabilities: [],
    };
    const payload = JSON.stringify(snapshot);

    expect(payload.length).toBeGreaterThan(2_000_000);

    const postResponse = await fetch(`${baseUrl}/api/runtime-work-state-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    const latestResponse = await fetch(`${baseUrl}/api/runtime-work-state/latest`);
    const latestBody = await latestResponse.json();

    expect(postResponse.status).toBe(201);
    expect(latestResponse.status).toBe(200);
    expect(latestBody.workItems).toHaveLength(2_200);
  });

  it("returns not found when no runtime work state snapshot exists", async () => {
    const { baseUrl } = await startRuntimeApi();

    const response = await fetch(`${baseUrl}/api/runtime-work-state/latest`);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "not_found" });
  });
});

async function startRuntimeApi(options: { createCommandId?: () => string } = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "agentlane-runtime-api-"));
  const store = createRuntimeInventoryStore({
    snapshotPath: path.join(dataDir, "latest.json"),
    staleAfterMs: 24 * 60 * 60 * 1000,
  });
  const workStateStore = createRuntimeWorkStateStore({
    snapshotPath: path.join(dataDir, "work-state-latest.json"),
  });
  const channel = createRuntimeControlChannel({
    store,
    createCommandId: options.createCommandId,
    now: () => new Date("2026-05-08T08:00:00.000Z"),
  });
  const handler = createRuntimeHttpApiHandler({ store, controlChannel: channel, workStateStore });
  const server = createServer((request, response) => {
    void handler(request, response, () => {
      response.statusCode = 404;
      response.end("not found");
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    store,
    workStateStore,
    channel,
  };
}
