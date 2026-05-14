import { describe, expect, it } from "vitest";
import { createOperationJobRunner } from "./job-runner";
import type { OperationJobRow, OperationStore } from "./operation-store";

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

function createFakeOperationStore(claimedJob: OperationJobRow | null): OperationStore & {
  claims: number;
  completed: Array<{ jobId: string; status: "succeeded" | "unsupported" }>;
  failed: Array<{ jobId: string; errorSummary: string; retryAfterMs?: number }>;
} {
  return {
    claims: 0,
    completed: [],
    failed: [],
    createOperation: async () => {
      throw new Error("not implemented");
    },
    enqueueJob: async () => {
      throw new Error("not implemented");
    },
    async claimNextJob() {
      this.claims += 1;
      return claimedJob;
    },
    async completeJob(input) {
      this.completed.push({ jobId: input.jobId, status: input.status });
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
    readOperation: async () => null,
    close: async () => {},
  };
}
