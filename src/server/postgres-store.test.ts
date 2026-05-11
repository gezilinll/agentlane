import { describe, expect, it } from "vitest";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import type { RuntimeInventorySnapshot, RuntimeWorkStateSnapshot } from "../runtime";
import { createTemporaryPostgresDatabase, runMigrationsScript, shouldRunPostgresTests } from "../test/postgres";
import { createPostgresStore } from "./postgres-store";

const describeDb = shouldRunPostgresTests() ? describe : describe.skip;

describeDb("Postgres runtime store", () => {
  it("upserts inventory and work-state snapshots into queryable backend tables", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const store = createPostgresStore({ connectionString: database.url });
      try {
        const inventorySnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
        const workStateSnapshot = createWorkStateSnapshot(inventorySnapshot);

        await store.upsertInventorySnapshot(inventorySnapshot);
        await store.upsertWorkStateSnapshot(workStateSnapshot);

        expect(await store.readEntityCounts()).toEqual({
          agents: 2,
          channelBindings: 2,
          collectorIngestions: 2,
          devices: 1,
          runtimes: 2,
          workConversations: 1,
          workExecutions: 1,
          workItems: 1,
        });
        expect(await store.countWorkItemsBySource()).toEqual({ slock: 1 });
        expect(await store.readWorkItem(workStateSnapshot.workItems[0].id)).toMatchObject({
          externalId: "task-1",
          id: workStateSnapshot.workItems[0].id,
          source: "slock",
          stage: "processing",
          title: "AGTD-001 Fix queue handoff",
        });
        expect(await store.listCollectorIngestions("fixture-mac")).toEqual([
          expect.objectContaining({
            counts: { conversations: 1, executions: 1, workItems: 1 },
            deviceId: "fixture-mac",
            snapshotType: "work_state",
            status: "succeeded",
            warnings: ["fixture warning"],
          }),
          expect.objectContaining({
            counts: { agents: 2, channelBindings: 2, devices: 1, runtimes: 2 },
            deviceId: "fixture-mac",
            snapshotType: "inventory",
            status: "succeeded",
          }),
        ]);
      } finally {
        await store.close();
      }
    } finally {
      await database.drop();
    }
  });

  it("keeps query tables aligned to the latest snapshot for one device", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const store = createPostgresStore({ connectionString: database.url });
      try {
        const inventorySnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
        const workStateSnapshot = createWorkStateSnapshot(inventorySnapshot);
        const reducedInventorySnapshot: RuntimeInventorySnapshot = {
          ...inventorySnapshot,
          runtimes: [inventorySnapshot.runtimes[0]],
          agents: [inventorySnapshot.agents[0]],
        };
        const emptyWorkStateSnapshot: RuntimeWorkStateSnapshot = {
          ...workStateSnapshot,
          workItems: [],
          conversations: [],
          executions: [],
        };

        await store.upsertInventorySnapshot(inventorySnapshot);
        await store.upsertWorkStateSnapshot(workStateSnapshot);
        await store.upsertInventorySnapshot(reducedInventorySnapshot);
        await store.upsertWorkStateSnapshot(emptyWorkStateSnapshot);

        const fleet = await store.readRuntimeFleet();
        const workItems = await store.listRuntimeWorkItems();
        expect(fleet.summary).toEqual({ agentCount: 1, deviceCount: 1, runtimeCount: 1 });
        expect(fleet.runtimes.map((runtime) => runtime.id)).toEqual([inventorySnapshot.runtimes[0].id]);
        expect(fleet.agents.map((agent) => agent.id)).toEqual([inventorySnapshot.agents[0].id]);
        expect(workItems).toEqual({ items: [], total: 0 });
        expect(await store.readEntityCounts()).toMatchObject({
          agents: 1,
          channelBindings: inventorySnapshot.agents[0].channelBindings.length,
          runtimes: 1,
          workConversations: 0,
          workExecutions: 0,
          workItems: 0,
        });
      } finally {
        await store.close();
      }
    } finally {
      await database.drop();
    }
  });

  it("accepts executions whose optional work item link is missing from the latest snapshot", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const store = createPostgresStore({ connectionString: database.url });
      try {
        const inventorySnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
        const workStateSnapshot = createWorkStateSnapshot(inventorySnapshot);
        const danglingExecution = {
          ...workStateSnapshot.executions[0],
          id: `${workStateSnapshot.executions[0].id}:dangling-work-item`,
          externalId: "run-dangling-work-item",
          workItemId: "missing-work-item",
        };

        await store.upsertInventorySnapshot(inventorySnapshot);
        await store.upsertWorkStateSnapshot({
          ...workStateSnapshot,
          executions: [...workStateSnapshot.executions, danglingExecution],
        });

        await expect(store.readEntityCounts()).resolves.toMatchObject({
          workExecutions: 2,
          workItems: 1,
        });
      } finally {
        await store.close();
      }
    } finally {
      await database.drop();
    }
  });

  it("searches work items by task, creator, assignee, runtime, agent, and conversation context", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const store = createPostgresStore({ connectionString: database.url });
      try {
        const inventorySnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
        const workStateSnapshot = createWorkStateSnapshot(inventorySnapshot);

        await store.upsertInventorySnapshot(inventorySnapshot);
        await store.upsertWorkStateSnapshot(workStateSnapshot);

        for (const search of ["queue handoff", "PMO", "tester", "Slock daemon", "#AjisGTD"]) {
          const result = await store.listRuntimeWorkItems({ search });
          expect(result.items.map((item) => item.id)).toEqual([workStateSnapshot.workItems[0].id]);
        }
      } finally {
        await store.close();
      }
    } finally {
      await database.drop();
    }
  });

  it("paginates work items with a stable cursor", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const store = createPostgresStore({ connectionString: database.url });
      try {
        const inventorySnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
        const workStateSnapshot = createWorkStateSnapshot(inventorySnapshot);
        const workItems = [0, 1, 2].map((index) => ({
          ...workStateSnapshot.workItems[0],
          id: `${workStateSnapshot.workItems[0].id}-${index}`,
          externalId: `task-${index}`,
          title: `Cursor task ${index}`,
          lastSeenAt: `2026-05-10T10:0${index}:00.000Z`,
        }));

        await store.upsertInventorySnapshot(inventorySnapshot);
        await store.upsertWorkStateSnapshot({
          ...workStateSnapshot,
          workItems,
          executions: [],
        });

        const firstPage = await store.listRuntimeWorkItems({ limit: 2 });
        const secondPage = await store.listRuntimeWorkItems({ cursor: firstPage.nextCursor, limit: 2 });

        expect(firstPage.items.map((item) => item.title)).toEqual(["Cursor task 2", "Cursor task 1"]);
        expect(firstPage.total).toBe(3);
        expect(firstPage.nextCursor).toEqual(expect.any(String));
        expect(secondPage.items.map((item) => item.title)).toEqual(["Cursor task 0"]);
        expect(secondPage.nextCursor).toBeUndefined();
      } finally {
        await store.close();
      }
    } finally {
      await database.drop();
    }
  });
});

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
      participants: [
        { kind: "human", label: "PMO" },
        { kind: "agent", label: "tester", objectId: agent.id },
      ],
      startedAt: "2026-05-10T09:50:00.000Z",
      lastActivityAt: "2026-05-10T09:58:00.000Z",
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
      queuedAt: "2026-05-10T09:50:00.000Z",
      startedAt: "2026-05-10T09:51:00.000Z",
      lastSeenAt: "2026-05-10T10:00:00.000Z",
      sourceRefs: [{ source: "slock", externalId: "run-1" }],
    }],
    capabilities: [],
    warnings: ["fixture warning"],
  };
}
