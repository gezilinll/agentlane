import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import type { RuntimeInventorySnapshot } from "../runtime";
import type { CreateNotificationEventInput } from "../notifications/notification-store";
import type { OperationRow, OperationStore } from "../operations/operation-store";
import { createRuntimeControlChannel, type RuntimeControlSocket } from "./runtime-control-channel";
import { createRuntimeHttpApiHandler } from "./runtime-http-api";
import { createRuntimeInventoryStore } from "./runtime-inventory-store";

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

describe("runtime HTTP API agent Skill probing", () => {
  it("stores and returns read-only probe snapshots", async () => {
    const { baseUrl } = await startRuntimeApi();
    const snapshot = createProbeSnapshot({ status: "succeeded" });

    const postResponse = await postJson(`${baseUrl}/api/agent-skill-probe-snapshots`, snapshot);
    const getResponse = await fetch(`${baseUrl}/api/agents/${encodeURIComponent(snapshot.targetAgentId)}/skill-probe`);

    expect(postResponse.status).toBe(201);
    await expect(getResponse.json()).resolves.toMatchObject({
      status: "succeeded",
      targetAgentId: snapshot.targetAgentId,
      skills: [
        expect.objectContaining({
          rootPath: "/Users/example/.codex/skills/reviewer",
          markdownFiles: [expect.objectContaining({ relativePath: "SKILL.md" })],
          nonMarkdownFiles: [expect.not.objectContaining({ content: expect.any(String) })],
        }),
      ],
    });
  });

  it("requests a connected device probe and records operation plus notification state", async () => {
    const operationStore = createFakeOperationStore();
    const notifications: CreateNotificationEventInput[] = [];
    const { baseUrl, channel } = await startRuntimeApi({
      createCommandId: () => "cmd-skill-probe-1",
      operationStore,
      skillProbeNotifications: {
        createNotificationEvent: async (input) => {
          notifications.push(input);
          return {};
        },
        listRecipientUserIds: async () => ["user-1"],
      },
    });
    const socket = new MemorySocket();
    channel.attach(socket);
    channel.receive(socket, JSON.stringify({ type: "hello", deviceId: "fixture-mac" }));

    const response = await postJson(
      `${baseUrl}/api/agents/${encodeURIComponent("fixture-mac:slock:slock-daemon:agent:tester")}/skill-probe`,
      { deviceId: "fixture-mac", runtimeId: "fixture-mac:slock:slock-daemon", organizationId: "org-1" },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      commandId: "cmd-skill-probe-1",
      operation: expect.objectContaining({ status: "running", type: "agent_skill_probe" }),
      snapshot: expect.objectContaining({ status: "requested" }),
    });
    expect(socket.sent).toContainEqual(expect.objectContaining({
      commandId: "cmd-skill-probe-1",
      type: "agent.skill_probe",
      payload: expect.objectContaining({
        runtimeId: "fixture-mac:slock:slock-daemon",
        targetAgentId: "fixture-mac:slock:slock-daemon:agent:tester",
      }),
    }));
    expect(notifications).toEqual([
      expect.objectContaining({
        eventType: "agent_skill_probe_requested",
        operationId: "op-1",
        recipientUserIds: ["user-1"],
        resourceType: "agent",
      }),
    ]);
  });

  it("returns device-disconnected probe state when the owning device is offline", async () => {
    const operationStore = createFakeOperationStore();
    const { baseUrl } = await startRuntimeApi({ operationStore });

    const response = await postJson(
      `${baseUrl}/api/agents/${encodeURIComponent("fixture-mac:slock:slock-daemon:agent:tester")}/skill-probe`,
      { deviceId: "fixture-mac", runtimeId: "fixture-mac:slock:slock-daemon", organizationId: "org-1" },
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: "device_not_connected",
      snapshot: expect.objectContaining({ status: "device_disconnected" }),
      operation: expect.objectContaining({ status: "failed" }),
    });
  });

  it("marks the probe operation succeeded and notifies recipients when a device reports results", async () => {
    const operationStore = createFakeOperationStore();
    const operation = await operationStore.createOperation({
      organizationId: "org-1",
      requestedByUserId: "requester-1",
      resourceId: "fixture-mac:slock:slock-daemon:agent:tester",
      resourceType: "agent",
      summary: "探测 tester 的 Skill",
      targetId: "fixture-mac",
      targetType: "device",
      type: "agent_skill_probe",
    });
    const notifications: CreateNotificationEventInput[] = [];
    const { baseUrl } = await startRuntimeApi({
      operationStore,
      skillProbeNotifications: {
        createNotificationEvent: async (input) => {
          notifications.push(input);
          return {};
        },
        listRecipientUserIds: async () => ["owner-1"],
      },
    });

    const response = await postJson(
      `${baseUrl}/api/agent-skill-probe-snapshots`,
      createProbeSnapshot({ operationId: operation.id, status: "succeeded" }),
    );
    const updatedOperation = await operationStore.readOperation({ operationId: operation.id });

    expect(response.status).toBe(201);
    expect(updatedOperation).toMatchObject({ status: "succeeded", errorSummary: null });
    expect(notifications).toEqual([
      expect.objectContaining({
        eventType: "agent_skill_probe_succeeded",
        operationId: operation.id,
        recipientUserIds: ["requester-1", "owner-1"],
        resourceId: "fixture-mac:slock:slock-daemon:agent:tester",
      }),
    ]);
  });
});

async function startRuntimeApi(options: {
  createCommandId?: () => string;
  operationStore?: OperationStore;
  skillProbeNotifications?: Parameters<typeof createRuntimeHttpApiHandler>[0]["skillProbeNotifications"];
} = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "lorume-skill-probe-api-"));
  const store = createRuntimeInventoryStore({
    snapshotPath: path.join(dataDir, "latest.json"),
    staleAfterMs: 24 * 60 * 60 * 1000,
  });
  store.writeLatestSnapshot(fixtureSnapshot as RuntimeInventorySnapshot);
  const channel = createRuntimeControlChannel({
    store,
    createCommandId: options.createCommandId,
    now: () => new Date("2026-05-18T10:00:00.000Z"),
  });
  const handler = createRuntimeHttpApiHandler({
    store,
    controlChannel: channel,
    operationStore: options.operationStore,
    skillProbeNotifications: options.skillProbeNotifications,
  });
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
    channel,
    store,
  };
}

function createProbeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    targetAgentId: "fixture-mac:slock:slock-daemon:agent:tester",
    targetAgentName: "tester",
    deviceId: "fixture-mac",
    deviceName: "Fixture Mac",
    runtimeId: "fixture-mac:slock:slock-daemon",
    runtimeName: "Slock daemon",
    status: "succeeded",
    observedAt: "2026-05-18T10:00:00.000Z",
    skills: [{
      name: "reviewer",
      rootPath: "/Users/example/.codex/skills/reviewer",
      entryPath: "/Users/example/.codex/skills/reviewer/SKILL.md",
      markdownFiles: [{
        name: "SKILL.md",
        path: "/Users/example/.codex/skills/reviewer/SKILL.md",
        relativePath: "SKILL.md",
      }],
      nonMarkdownFiles: [{
        name: "probe.sh",
        path: "/Users/example/.codex/skills/reviewer/scripts/probe.sh",
        relativePath: "scripts/probe.sh",
        content: "not exposed",
      }],
    }],
    ...overrides,
  };
}

function createFakeOperationStore(): OperationStore {
  const operations = new Map<string, OperationRow>();
  return {
    async createOperation(input) {
      const operation = createOperationRow({
        id: "op-1",
        organizationId: input.organizationId,
        requestedByUserId: input.requestedByUserId,
        resourceId: input.resourceId,
        resourceType: input.resourceType,
        status: "queued",
        summary: input.summary,
        targetId: input.targetId,
        targetType: input.targetType,
        type: input.type,
      });
      operations.set(operation.id, operation);
      return operation;
    },
    async updateOperationStatus(input) {
      const operation = operations.get(input.operationId);
      if (!operation) return null;
      const nextOperation = {
        ...operation,
        status: input.status,
        errorSummary: input.errorSummary ?? null,
      };
      operations.set(operation.id, nextOperation);
      return nextOperation;
    },
    async readOperation({ operationId }) {
      return operations.get(operationId) ?? null;
    },
    async enqueueJob() {
      throw new Error("not used");
    },
    async listOperations() {
      return [];
    },
    async listJobs() {
      return [];
    },
    async claimNextJob() {
      return null;
    },
    async completeJob() {
      return null;
    },
    async failJob() {
      return null;
    },
    async close() {},
  };
}

function createOperationRow(overrides: Partial<OperationRow>): OperationRow {
  const now = new Date("2026-05-18T10:00:00.000Z");
  return {
    id: "op-1",
    organizationId: "org-1",
    type: "agent_skill_probe",
    status: "queued",
    resourceType: null,
    resourceId: null,
    targetType: null,
    targetId: null,
    requestedByUserId: null,
    summary: "探测 Agent Skill",
    errorSummary: null,
    manualInstruction: null,
    metadata: {},
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}
