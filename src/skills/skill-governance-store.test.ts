import { describe, expect, it } from "vitest";
import { createPostgresAuthStore } from "../auth/auth-store";
import { createPostgresOperationStore } from "../operations/operation-store";
import {
  createTemporaryPostgresDatabase,
  runMigrationsScript,
  shouldRunPostgresTests,
} from "../test/postgres";
import { createSkillPackageFromMarkdown } from "./skill-package";
import { createPostgresSkillGovernanceStore } from "./skill-governance-store";
import { createPostgresSkillStore } from "./skill-store";

const describeDb = shouldRunPostgresTests() ? describe : describe.skip;

describeDb("Postgres skill governance store", () => {
  it("grants resource permissions and resolves approvals without applying async effects", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      const governanceStore = createPostgresSkillGovernanceStore({ connectionString: database.url });
      try {
        const owner = await authStore.upsertUserForEmail("owner@example.com");
        const member = await authStore.upsertUserForEmail("member@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: owner.id,
          name: "Governance Team",
          slug: "governance-team",
        });
        await authStore.createInvitation({
          email: member.email,
          expiresAt: new Date(Date.now() + 60_000),
          invitedByUserId: owner.id,
          organizationId: organization.id,
          role: "member",
          tokenHash: "member-invite",
        });
        await authStore.acceptInvitation({
          email: member.email,
          now: new Date(),
          tokenHash: "member-invite",
          userId: member.id,
        });
        const imported = await skillStore.importSkillVersion({
          createdByUserId: owner.id,
          organizationId: organization.id,
          package: createSkillPackageFromMarkdown({
            content: `---
name: Review Guard
description: Shared review rules.
license: MIT
compatibility: openclaw
---

# Review Guard
`,
            source: { type: "upload_md" },
          }),
        });

        await expect(governanceStore.hasResourcePermission({
          organizationId: organization.id,
          organizationRole: "member",
          permission: "publish",
          resourceId: imported.skill.id,
          resourceType: "skill",
          userId: member.id,
        })).resolves.toBe(false);

        await governanceStore.grantResourcePermission({
          grantedByUserId: owner.id,
          organizationId: organization.id,
          permission: "publish",
          resourceId: imported.skill.id,
          resourceType: "skill",
          subjectUserId: member.id,
        });

        await expect(governanceStore.hasResourcePermission({
          organizationId: organization.id,
          organizationRole: "member",
          permission: "publish",
          resourceId: imported.skill.id,
          resourceType: "skill",
          userId: member.id,
        })).resolves.toBe(true);

        const approval = await governanceStore.createApprovalRequest({
          action: "publish_skill",
          organizationId: organization.id,
          requestedByUserId: member.id,
          requestedReason: "Share review rules with the team.",
          riskLevel: "low",
          riskSummary: "Publish imported Skill version.",
          skillId: imported.skill.id,
          skillVersionId: imported.version.id,
        });
        const resolved = await governanceStore.resolveApprovalRequest({
          requestId: approval.id,
          resolution: "approved",
          resolvedByUserId: owner.id,
        });
        const detail = await skillStore.readSkillDetail({ skillId: imported.skill.id });

        expect(resolved).toMatchObject({ status: "approved", resolvedByUserId: owner.id });
        expect(detail?.skill.status).toBe("draft");
        expect(detail?.versions[0]).toMatchObject({
          id: imported.version.id,
          publishedAt: null,
          publishedByUserId: null,
        });
      } finally {
        await Promise.all([authStore.close(), skillStore.close(), governanceStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("creates approved assignments without leaving active rows for rejected approvals", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      const governanceStore = createPostgresSkillGovernanceStore({ connectionString: database.url });
      try {
        const owner = await authStore.upsertUserForEmail("assignment-owner@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: owner.id,
          name: "Assignment Team",
          slug: "assignment-team",
        });
        const imported = await skillStore.importSkillVersion({
          createdByUserId: owner.id,
          organizationId: organization.id,
          package: createSkillPackageFromMarkdown({
            content: `---
name: Cost Guard
description: Shared cost rules.
license: MIT
compatibility: openclaw
---

# Cost Guard
`,
            source: { type: "upload_md" },
          }),
        });
        await governanceStore.publishSkillVersion({
          publishedByUserId: owner.id,
          skillId: imported.skill.id,
          skillVersionId: imported.version.id,
        });

        const pending = await governanceStore.createApprovalRequest({
          action: "assign_skill",
          organizationId: organization.id,
          requestedByUserId: owner.id,
          riskLevel: "low",
          riskSummary: "Assign Skill to an agent.",
          skillId: imported.skill.id,
          skillVersionId: imported.version.id,
          targetId: "agent-main",
          targetType: "agent",
        });
        await governanceStore.resolveApprovalRequest({
          requestId: pending.id,
          resolution: "rejected",
          resolutionReason: "Wrong target.",
          resolvedByUserId: owner.id,
        });
        await expect(governanceStore.listSkillAssignments({
          organizationId: organization.id,
        })).resolves.toEqual([]);

        const assignment = await governanceStore.createSkillAssignment({
          approvedByUserId: owner.id,
          createdByUserId: owner.id,
          organizationId: organization.id,
          skillId: imported.skill.id,
          skillVersionId: imported.version.id,
          status: "approved",
          targetId: "agent-main",
          targetType: "agent",
        });

        expect(assignment).toMatchObject({
          approvedByUserId: owner.id,
          skillId: imported.skill.id,
          status: "approved",
          targetId: "agent-main",
          targetType: "agent",
        });
      } finally {
        await Promise.all([authStore.close(), skillStore.close(), governanceStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("tracks Skill sync jobs and mirrors terminal status onto the assignment", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      const governanceStore = createPostgresSkillGovernanceStore({ connectionString: database.url });
      const operationStore = createPostgresOperationStore({ connectionString: database.url });
      try {
        const owner = await authStore.upsertUserForEmail("sync-owner@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: owner.id,
          name: "Sync Team",
          slug: "sync-team",
        });
        const imported = await skillStore.importSkillVersion({
          createdByUserId: owner.id,
          organizationId: organization.id,
          package: createSkillPackageFromMarkdown({
            content: `---
name: Sync Guard
description: Shared sync rules.
license: MIT
compatibility: codex
---

# Sync Guard
`,
            source: { type: "upload_md" },
          }),
        });
        await governanceStore.publishSkillVersion({
          publishedByUserId: owner.id,
          skillId: imported.skill.id,
          skillVersionId: imported.version.id,
        });
        const assignment = await governanceStore.createSkillAssignment({
          approvedByUserId: owner.id,
          createdByUserId: owner.id,
          organizationId: organization.id,
          skillId: imported.skill.id,
          skillVersionId: imported.version.id,
          status: "approved",
          targetId: "gezilinll-claw:codex:local:agent:main",
          targetType: "agent",
        });
        const operation = await operationStore.createOperation({
          organizationId: organization.id,
          requestedByUserId: owner.id,
          resourceId: imported.skill.id,
          resourceType: "skill",
          summary: "同步 Skill：Sync Guard",
          targetId: assignment.targetId,
          targetType: assignment.targetType,
          type: "skill_sync",
        });
        const operationJob = await operationStore.enqueueJob({
          operationId: operation.id,
          organizationId: organization.id,
          payload: { assignmentId: assignment.id },
          type: "skill_sync",
        });

        const syncJob = await governanceStore.createSkillSyncJob({
          action: "sync",
          assignmentId: assignment.id,
          jobId: operationJob.id,
          operationId: operation.id,
          organizationId: organization.id,
          packageHash: imported.version.packageHash,
          targetId: assignment.targetId,
          targetType: assignment.targetType,
        });
        await governanceStore.updateSkillSyncJobCommand({
          commandId: "cmd-sync-1",
          syncJobId: syncJob.id,
        });
        await governanceStore.finishSkillSyncJob({
          status: "succeeded",
          syncJobId: syncJob.id,
        });

        await expect(governanceStore.readSkillAssignment({
          assignmentId: assignment.id,
          organizationId: organization.id,
        })).resolves.toMatchObject({
          id: assignment.id,
          lastSyncJobId: syncJob.id,
          status: "synced",
        });
        await expect(governanceStore.listSkillSyncJobs({
          assignmentId: assignment.id,
          organizationId: organization.id,
        })).resolves.toMatchObject([
          {
            commandId: "cmd-sync-1",
            operationId: operation.id,
            status: "succeeded",
            targetId: assignment.targetId,
          },
        ]);
      } finally {
        await Promise.all([authStore.close(), skillStore.close(), governanceStore.close(), operationStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });
});
