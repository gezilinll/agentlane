import { describe, expect, it } from "vitest";
import { createPostgresAuthStore } from "../auth/auth-store";
import {
  createTemporaryPostgresDatabase,
  runMigrationsScript,
  shouldRunPostgresTests,
} from "../test/postgres";
import { createPostgresOperationStore } from "./operation-store";

const describeDb = shouldRunPostgresTests() ? describe : describe.skip;

describeDb("Postgres operation store", () => {
  it("claims one due job with a lease and completes the owning operation", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const operationStore = createPostgresOperationStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("ops-owner@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Ops Team",
          slug: "ops-team",
        });
        const operation = await operationStore.createOperation({
          organizationId: organization.id,
          requestedByUserId: user.id,
          resourceId: "skill_1",
          resourceType: "skill",
          summary: "Publish Skill version",
          type: "skill_publish",
        });
        const job = await operationStore.enqueueJob({
          operationId: operation.id,
          organizationId: organization.id,
          payload: { skillId: "skill_1", skillVersionId: "version_1" },
          runAfter: new Date("2026-05-14T09:59:00.000Z"),
          type: "skill_publish",
        });

        const claimed = await operationStore.claimNextJob({
          leaseMs: 30_000,
          now: new Date("2026-05-14T10:00:00.000Z"),
          runnerId: "runner-a",
        });
        const duplicate = await operationStore.claimNextJob({
          leaseMs: 30_000,
          now: new Date("2026-05-14T10:00:10.000Z"),
          runnerId: "runner-b",
        });
        await operationStore.completeJob({
          jobId: job.id,
          now: new Date("2026-05-14T10:00:12.000Z"),
          status: "succeeded",
        });
        const completed = await operationStore.readOperation({ operationId: operation.id });

        expect(claimed).toMatchObject({
          attemptCount: 1,
          id: job.id,
          lockedBy: "runner-a",
          operationId: operation.id,
          status: "running",
        });
        expect(duplicate).toBeNull();
        expect(completed).toMatchObject({
          id: operation.id,
          status: "succeeded",
        });
      } finally {
        await Promise.all([authStore.close(), operationStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("requeues failed jobs until max attempts and then fails the operation", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const operationStore = createPostgresOperationStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("ops-retry@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Retry Team",
          slug: "retry-team",
        });
        const operation = await operationStore.createOperation({
          organizationId: organization.id,
          requestedByUserId: user.id,
          summary: "Sync Skill to agent",
          targetId: "agent-main",
          targetType: "agent",
          type: "skill_sync",
        });
        await operationStore.enqueueJob({
          maxAttempts: 2,
          operationId: operation.id,
          organizationId: organization.id,
          payload: { assignmentId: "assignment_1" },
          runAfter: new Date("2026-05-14T10:59:00.000Z"),
          type: "skill_sync",
        });

        const firstClaim = await operationStore.claimNextJob({
          leaseMs: 1_000,
          now: new Date("2026-05-14T11:00:00.000Z"),
          runnerId: "runner-a",
        });
        await operationStore.failJob({
          errorSummary: "target runtime unavailable",
          jobId: firstClaim?.id ?? "",
          now: new Date("2026-05-14T11:00:01.000Z"),
          retryAfterMs: 5_000,
        });
        const waiting = await operationStore.readOperation({ operationId: operation.id });
        const earlyClaim = await operationStore.claimNextJob({
          leaseMs: 1_000,
          now: new Date("2026-05-14T11:00:02.000Z"),
          runnerId: "runner-b",
        });
        const secondClaim = await operationStore.claimNextJob({
          leaseMs: 1_000,
          now: new Date("2026-05-14T11:00:07.000Z"),
          runnerId: "runner-b",
        });
        await operationStore.failJob({
          errorSummary: "target runtime unavailable",
          jobId: secondClaim?.id ?? "",
          now: new Date("2026-05-14T11:00:08.000Z"),
        });
        const failed = await operationStore.readOperation({ operationId: operation.id });

        expect(waiting).toMatchObject({ status: "queued" });
        expect(earlyClaim).toBeNull();
        expect(secondClaim).toMatchObject({ attemptCount: 2, status: "running" });
        expect(failed).toMatchObject({
          errorSummary: "target runtime unavailable",
          status: "failed",
        });
      } finally {
        await Promise.all([authStore.close(), operationStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });
});
