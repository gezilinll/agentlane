import { describe, expect, it } from "vitest";
import type { CreateNotificationEventInput, CreateNotificationEventResult } from "../notifications/notification-store";
import { createOperationJobRunner } from "./job-runner";
import type { OperationJobRow, OperationRow, OperationStore } from "./operation-store";

describe("operation job runner", () => {
  it("claims one due job and completes it through the matching handler", async () => {
    const job = createJob({ type: "skill_sync", payload: { assignmentId: "assignment_1" } });
    const store = createFakeOperationStore(job);
    const runner = createOperationJobRunner({
      handlers: {
        skill_sync: async (claimedJob) => {
          expect(claimedJob.payload).toEqual({ assignmentId: "assignment_1" });
          return { status: "succeeded" };
        },
      },
      leaseMs: 30_000,
      now: () => new Date("2026-05-14T12:00:00.000Z"),
      operationStore: store,
      runnerId: "runner-a",
    });

    await expect(runner.runDueJobOnce()).resolves.toEqual({
      jobId: "job_1",
      jobType: "skill_sync",
      outcome: "succeeded",
      status: "handled",
    });
    expect(store.completed).toEqual([{ jobId: "job_1", status: "succeeded" }]);
    expect(store.failed).toEqual([]);
  });

  it("marks unsupported jobs without retrying when no handler is registered", async () => {
    const store = createFakeOperationStore(createJob({ type: "notification_email" }));
    const runner = createOperationJobRunner({
      handlers: {},
      leaseMs: 30_000,
      now: () => new Date("2026-05-14T12:05:00.000Z"),
      operationStore: store,
      runnerId: "runner-a",
    });

    await expect(runner.runDueJobOnce()).resolves.toEqual({
      jobId: "job_1",
      jobType: "notification_email",
      outcome: "unsupported",
      status: "handled",
    });
    expect(store.completed).toEqual([{ jobId: "job_1", status: "unsupported" }]);
    expect(store.failed).toEqual([]);
  });

  it("passes manual-step handler results through the operation store and notification path", async () => {
    const notifications: CreateNotificationEventInput[] = [];
    const store = createFakeOperationStore(
      createJob({ type: "agent_migration" }),
      createOperation({
        requestedByUserId: "user_1",
        status: "queued",
        summary: "迁移 Agent",
        targetId: "agent-main",
        targetType: "agent",
        type: "agent_migration",
      }),
    );
    const runner = createOperationJobRunner({
      handlers: {
        agent_migration: () => ({
          manualInstruction: "目标设备缺少已知 runtime 安装入口，请先补齐 runtime。",
          status: "requires_manual_step",
        }),
      },
      notificationStore: {
        createNotificationEvent: async (input) => {
          notifications.push(input);
          return createNotificationResult(input);
        },
      },
      now: () => new Date("2026-05-14T12:07:00.000Z"),
      operationStore: store,
      runnerId: "runner-a",
    });

    await expect(runner.runDueJobOnce()).resolves.toEqual({
      jobId: "job_1",
      jobType: "agent_migration",
      outcome: "requires_manual_step",
      status: "handled",
    });
    expect(store.completed).toEqual([{
      jobId: "job_1",
      manualInstruction: "目标设备缺少已知 runtime 安装入口，请先补齐 runtime。",
      status: "requires_manual_step",
    }]);
    expect(notifications).toEqual([
      expect.objectContaining({
        dedupeKey: "operation:operation_1:requires_manual_step",
        eventType: "operation_requires_manual_step",
        severity: "warning",
        sourceModule: "migration",
        title: "迁移 Agent 需要人工处理",
      }),
    ]);
  });

  it("records failed handler attempts through the operation store", async () => {
    const store = createFakeOperationStore(createJob({ type: "skill_publish" }));
    const runner = createOperationJobRunner({
      handlers: {
        skill_publish: async () => {
          throw new Error("device write failed");
        },
      },
      leaseMs: 30_000,
      now: () => new Date("2026-05-14T12:10:00.000Z"),
      operationStore: store,
      retryAfterMs: 10_000,
      runnerId: "runner-a",
    });

    await expect(runner.runDueJobOnce()).resolves.toEqual({
      errorSummary: "device write failed",
      jobId: "job_1",
      jobType: "skill_publish",
      status: "failed",
    });
    expect(store.completed).toEqual([]);
    expect(store.failed).toEqual([
      {
        errorSummary: "device write failed",
        jobId: "job_1",
        retryAfterMs: 10_000,
      },
    ]);
  });

  it("returns idle when no due job can be claimed", async () => {
    const store = createFakeOperationStore(null);
    const runner = createOperationJobRunner({
      handlers: {},
      operationStore: store,
      runnerId: "runner-a",
    });

    await expect(runner.runDueJobOnce()).resolves.toEqual({ status: "idle" });
    expect(store.claims).toBe(1);
  });

  it("creates a notification when a user-requested operation reaches a terminal status", async () => {
    const notifications: CreateNotificationEventInput[] = [];
    const store = createFakeOperationStore(
      createJob({ type: "skill_publish" }),
      createOperation({
        requestedByUserId: "user_1",
        resourceId: "skill_1",
        resourceType: "skill",
        status: "queued",
        summary: "发布 Skill",
        type: "skill_publish",
      }),
    );
    const runner = createOperationJobRunner({
      handlers: {
        skill_publish: () => ({ status: "succeeded" }),
      },
      notificationStore: {
        createNotificationEvent: async (input) => {
          notifications.push(input);
          throw new Error("test should not depend on notification return value");
        },
      },
      now: () => new Date("2026-05-14T12:15:00.000Z"),
      operationStore: store,
      runnerId: "runner-a",
    });

    await expect(runner.runDueJobOnce()).resolves.toMatchObject({
      outcome: "succeeded",
      status: "handled",
    });
    expect(notifications).toEqual([
      expect.objectContaining({
        dedupeKey: "operation:operation_1:succeeded",
        eventType: "operation_succeeded",
        recipientUserIds: ["user_1"],
        resourceId: "skill_1",
        resourceType: "skill",
        severity: "info",
        sourceModule: "skill",
        summary: "发布 Skill",
        title: "发布 Skill 已完成",
      }),
    ]);
  });
});

function createJob(input: Partial<OperationJobRow>): OperationJobRow {
  const now = new Date("2026-05-14T12:00:00.000Z");
  return {
    attemptCount: 1,
    createdAt: now,
    finishedAt: null,
    id: "job_1",
    lastErrorSummary: null,
    lockedBy: "runner-a",
    lockedUntil: new Date("2026-05-14T12:01:00.000Z"),
    maxAttempts: 3,
    operationId: "operation_1",
    organizationId: "organization_1",
    payload: {},
    runAfter: now,
    startedAt: now,
    status: "running",
    type: "skill_sync",
    updatedAt: now,
    ...input,
  };
}

function createOperation(input: Partial<OperationRow>): OperationRow {
  const now = new Date("2026-05-14T12:00:00.000Z");
  return {
    createdAt: now,
    errorSummary: null,
    finishedAt: null,
    id: "operation_1",
    manualInstruction: null,
    metadata: {},
    organizationId: "organization_1",
    requestedByUserId: null,
    resourceId: null,
    resourceType: null,
    startedAt: null,
    status: "queued",
    summary: "Operation",
    targetId: null,
    targetType: null,
    type: "skill_sync",
    updatedAt: now,
    ...input,
  };
}

function createNotificationResult(input: CreateNotificationEventInput): CreateNotificationEventResult {
  const createdAt = input.createdAt ?? new Date("2026-05-14T12:00:00.000Z");
  return {
    deliveries: [],
    event: {
      actorUserId: input.actorUserId ?? null,
      createdAt,
      dedupeKey: input.dedupeKey,
      eventType: input.eventType,
      id: "notification_event_1",
      operationId: input.operationId ?? null,
      organizationId: input.organizationId,
      recipientUserIds: input.recipientUserIds,
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType ?? null,
      severity: input.severity,
      sourceModule: input.sourceModule,
      summary: input.summary,
      title: input.title,
    },
    thread: {
      cooldownUntil: null,
      createdAt,
      dedupeKey: input.dedupeKey,
      eventType: input.eventType,
      firstOccurredAt: createdAt,
      id: "notification_thread_1",
      lastOccurredAt: createdAt,
      latestSummary: input.summary,
      occurrenceCount: 1,
      organizationId: input.organizationId,
      resolvedAt: null,
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType ?? null,
      severity: input.severity,
      status: "open",
      title: input.title,
      updatedAt: createdAt,
    },
  };
}

function createFakeOperationStore(claimedJob: OperationJobRow | null, initialOperation?: OperationRow): OperationStore & {
  claims: number;
  completed: Array<{ jobId: string; manualInstruction?: string; status: "succeeded" | "unsupported" | "requires_manual_step" }>;
  failed: Array<{ jobId: string; errorSummary: string; retryAfterMs?: number }>;
  operation?: OperationRow;
} {
  return {
    claims: 0,
    completed: [],
    failed: [],
    operation: initialOperation,
    createOperation: async () => {
      throw new Error("not implemented");
    },
    enqueueJob: async () => {
      throw new Error("not implemented");
    },
    listOperations: async () => [],
    listJobs: async () => [],
    async claimNextJob() {
      this.claims += 1;
      return claimedJob;
    },
    async completeJob(input) {
      this.completed.push({
        jobId: input.jobId,
        manualInstruction: input.manualInstruction,
        status: input.status,
      });
      if (this.operation) {
        this.operation = {
          ...this.operation,
          finishedAt: input.now,
          manualInstruction: input.manualInstruction ?? this.operation.manualInstruction,
          status: input.status === "succeeded"
            ? "succeeded"
            : input.status === "requires_manual_step"
              ? "requires_manual_step"
              : "unsupported",
          updatedAt: input.now,
        };
      }
      return claimedJob ? { ...claimedJob, status: input.status } : null;
    },
    async failJob(input) {
      this.failed.push({
        errorSummary: input.errorSummary,
        jobId: input.jobId,
        retryAfterMs: input.retryAfterMs,
      });
      return claimedJob ? { ...claimedJob, lastErrorSummary: input.errorSummary, status: "queued" } : null;
    },
    async readOperation() {
      return this.operation ?? null;
    },
    close: async () => {},
  };
}
