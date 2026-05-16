import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthSessionContext } from "../auth/auth-store";
import type { PostgresStore } from "../server/postgres-store";
import { createAgentMigrationHttpApiHandler } from "./agent-migration-http-api";

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
});

describe("agent migration HTTP API", () => {
  it("builds a migration plan from the current Runtime Fleet snapshot", async () => {
    const api = await startApi({
      runtimeStore: createRuntimeStore({
        devices: [
          { id: "source-device", name: "Source Device", status: "online" },
          { id: "target-device", name: "Target Device", status: "online" },
        ],
        runtimes: [
          { id: "source-device:openclaw:main", deviceId: "source-device", kind: "openclaw", name: "OpenClaw", status: "online" },
          { id: "target-device:openclaw:main", deviceId: "target-device", kind: "openclaw", name: "OpenClaw", status: "online" },
        ],
        agents: [
          { id: "source-device:openclaw:main:agent:main", name: "main", runtimeId: "source-device:openclaw:main", status: "idle" },
        ],
      }),
      session: createSession(),
    });

    const response = await postJson(`${api.url}/api/agent-migrations/plan`, {
      desiredChannels: ["DingTalk"],
      organizationId: "org_1",
      sourceAgentId: "source-device:openclaw:main:agent:main",
      targetDeviceId: "target-device",
      targetRuntimeKind: "openclaw",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      plan: {
        sourceAgentName: "main",
        sourceRuntimeKind: "openclaw",
        status: "ready",
        targetRuntimeKind: "openclaw",
      },
      sourceAgent: { id: "source-device:openclaw:main:agent:main", name: "main" },
      targetDevice: { id: "target-device", name: "Target Device" },
      targetRuntime: { id: "target-device:openclaw:main", kind: "openclaw" },
    });
  });

  it("requires a manual step when the target device has not reported the requested runtime", async () => {
    const api = await startApi({
      runtimeStore: createRuntimeStore({
        devices: [
          { id: "source-device", name: "Source Device", status: "online" },
          { id: "target-device", name: "Target Device", status: "online" },
        ],
        runtimes: [
          { id: "source-device:openclaw:main", deviceId: "source-device", kind: "openclaw", name: "OpenClaw", status: "online" },
        ],
        agents: [
          { id: "source-device:openclaw:main:agent:main", name: "main", runtimeId: "source-device:openclaw:main", status: "idle" },
        ],
      }),
      session: createSession(),
    });

    const response = await postJson(`${api.url}/api/agent-migrations/plan`, {
      organizationId: "org_1",
      sourceAgentId: "source-device:openclaw:main:agent:main",
      targetDeviceId: "target-device",
      targetRuntimeKind: "openclaw",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      plan: {
        manualInstruction: "目标设备尚未识别到 openclaw Runtime，先安装或启动该 Runtime，并等待 Collector 完成一次采集。",
        status: "requires_manual_step",
      },
      targetRuntime: null,
    });
  });

  it("keeps migration planning scoped to the signed-in organization", async () => {
    const api = await startApi({
      runtimeStore: createRuntimeStore({ devices: [], runtimes: [], agents: [] }),
      session: createSession(),
    });

    const response = await postJson(`${api.url}/api/agent-migrations/plan`, {
      organizationId: "org_other",
      sourceAgentId: "agent_1",
      targetDeviceId: "device_1",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("requires an explicit source agent", async () => {
    const api = await startApi({
      runtimeStore: createRuntimeStore({ devices: [], runtimes: [], agents: [] }),
      session: createSession(),
    });

    const response = await postJson(`${api.url}/api/agent-migrations/plan`, {
      organizationId: "org_1",
      targetDeviceId: "device_1",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "source_agent_id_required" });
  });
});

function createSession(): AuthSessionContext {
  const now = new Date("2026-05-14T10:00:00.000Z");
  return {
    id: "session_1",
    organizations: [{
      id: "membership_1",
      name: "Lorume Team",
      organizationId: "org_1",
      role: "owner",
      slug: "lorume-team",
    }],
    user: {
      createdAt: now,
      displayName: null,
      email: "owner@example.com",
      id: "user_1",
      updatedAt: now,
    },
  };
}

function createRuntimeStore(snapshot: { devices: unknown[]; runtimes: unknown[]; agents: unknown[] }) {
  return {
    readRuntimeFleet: async () => ({
      observedAt: "2026-05-14T10:00:00.000Z",
      summary: {
        agentCount: snapshot.agents.length,
        deviceCount: snapshot.devices.length,
        runtimeCount: snapshot.runtimes.length,
      },
      ...snapshot,
    }),
  } as unknown as Pick<PostgresStore, "readRuntimeFleet">;
}

async function startApi(options: {
  runtimeStore: Pick<PostgresStore, "readRuntimeFleet">;
  session: AuthSessionContext | null;
}) {
  const handler = createAgentMigrationHttpApiHandler({
    requireUserSession: async () => options.session,
    runtimeStore: options.runtimeStore,
  });
  const server = createServer((request, response) => {
    void handler(request, response, () => {
      response.statusCode = 404;
      response.end("not found");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const api = {
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    url: `http://127.0.0.1:${address.port}`,
  };
  servers.push(api);
  return api;
}

function postJson(url: string, payload: unknown): Promise<Response> {
  return fetch(url, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}
