import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createPostgresAuthStore, type AuthSessionContext } from "../auth/auth-store";
import { createOperationJobRunner } from "../operations/job-runner";
import { createPostgresOperationStore, type OperationStore } from "../operations/operation-store";
import {
  createTemporaryPostgresDatabase,
  runMigrationsScript,
  shouldRunPostgresTests,
} from "../test/postgres";
import { createSkillGovernanceHttpApiHandler } from "./skill-governance-http-api";
import { createPostgresSkillGovernanceStore, type SkillAssignmentRow, type SkillGovernanceStore } from "./skill-governance-store";
import { createSkillOperationJobHandlers } from "./skill-operation-handlers";
import { createSkillPackageFromMarkdown } from "./skill-package";
import { createSkillHttpApiHandler } from "./skill-http-api";
import { createPostgresSkillStore, type SkillStore } from "./skill-store";

const describeDb = shouldRunPostgresTests() ? describe : describe.skip;
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

describeDb("skill governance HTTP API", () => {
  it("filters Skill reads by resource view permission", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      const governanceStore = createPostgresSkillGovernanceStore({ connectionString: database.url });
      try {
        const owner = await authStore.upsertUserForEmail("read-owner@example.com");
        const member = await authStore.upsertUserForEmail("read-member@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: owner.id,
          name: "Read Team",
          slug: "read-team",
        });
        await joinOrganization(authStore, {
          email: member.email,
          invitedByUserId: owner.id,
          organizationId: organization.id,
          userId: member.id,
        });
        const imported = await skillStore.importSkillVersion({
          createdByUserId: owner.id,
          organizationId: organization.id,
          package: createSkillPackageFromMarkdown({
            content: `---
name: Private Skill
description: Only visible after permission grant.
license: MIT
compatibility: openclaw
---

# Private Skill
`,
            source: { type: "upload_md" },
          }),
        });
        const memberSession: AuthSessionContext = {
          id: "ses_member",
          organizations: await authStore.listOrganizationsForUser(member.id),
          user: member,
        };
        const { baseUrl } = await startSkillApi({
          governanceStore,
          requireUserSession: async () => memberSession,
          skillStore,
        });

        const hidden = await fetch(`${baseUrl}/api/skills?organizationId=${encodeURIComponent(organization.id)}`);
        await governanceStore.grantResourcePermission({
          grantedByUserId: owner.id,
          organizationId: organization.id,
          permission: "view",
          resourceId: imported.skill.id,
          resourceType: "skill",
          subjectUserId: member.id,
        });
        const visible = await fetch(`${baseUrl}/api/skills?organizationId=${encodeURIComponent(organization.id)}`);

        await expect(hidden.json()).resolves.toEqual({ skills: [] });
        await expect(visible.json()).resolves.toMatchObject({
          skills: [expect.objectContaining({ id: imported.skill.id })],
        });
      } finally {
        await Promise.all([authStore.close(), skillStore.close(), governanceStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("creates a publish approval when the requester lacks publish permission", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      const governanceStore = createPostgresSkillGovernanceStore({ connectionString: database.url });
      const operationStore = createPostgresOperationStore({ connectionString: database.url });
      try {
        const owner = await authStore.upsertUserForEmail("publish-owner@example.com");
        const member = await authStore.upsertUserForEmail("publish-member@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: owner.id,
          name: "Publish Team",
          slug: "publish-team",
        });
        await joinOrganization(authStore, {
          email: member.email,
          invitedByUserId: owner.id,
          organizationId: organization.id,
          userId: member.id,
        });
        const imported = await skillStore.importSkillVersion({
          createdByUserId: owner.id,
          organizationId: organization.id,
          package: createSkillPackageFromMarkdown({
            content: `---
name: Publish Skill
description: Needs approval.
license: MIT
compatibility: openclaw
---

# Publish Skill
`,
            source: { type: "upload_md" },
          }),
        });
        await governanceStore.grantResourcePermission({
          grantedByUserId: owner.id,
          organizationId: organization.id,
          permission: "view",
          resourceId: imported.skill.id,
          resourceType: "skill",
          subjectUserId: member.id,
        });

        let currentSession: AuthSessionContext = {
          id: "ses_member",
          organizations: await authStore.listOrganizationsForUser(member.id),
          user: member,
        };
        const { baseUrl } = await startGovernanceApi({
          governanceStore,
          operationStore,
          requireUserSession: async () => currentSession,
          skillStore,
        });

        const publishResponse = await postJson(`${baseUrl}/api/skills/${encodeURIComponent(imported.skill.id)}/publish`, {
          requestedReason: "Ready to share.",
          versionId: imported.version.id,
        });
        const publishPayload = await publishResponse.json();
        const approvalList = await fetch(`${baseUrl}/api/approval-requests?organizationId=${encodeURIComponent(organization.id)}&status=pending`);

        expect(publishResponse.status).toBe(202);
        expect(publishPayload).toMatchObject({
          approvalRequest: expect.objectContaining({
            action: "publish_skill",
            requestedByUserId: member.id,
            status: "pending",
          }),
        });
        await expect(approvalList.json()).resolves.toMatchObject({
          approvalRequests: [expect.objectContaining({ id: publishPayload.approvalRequest.id })],
        });

        currentSession = {
          id: "ses_owner",
          organizations: await authStore.listOrganizationsForUser(owner.id),
          user: owner,
        };
        const approveResponse = await postJson(`${baseUrl}/api/approval-requests/${encodeURIComponent(publishPayload.approvalRequest.id)}/approve`, {
          resolutionReason: "Looks good.",
        });
        const approvePayload = await approveResponse.json();
        const beforeRunner = await skillStore.readSkillDetail({ skillId: imported.skill.id });
        const jobResult = await runOneSkillOperation(operationStore, governanceStore);
        const detail = await skillStore.readSkillDetail({ skillId: imported.skill.id });

        expect(approveResponse.status).toBe(200);
        expect(approvePayload).toMatchObject({
          approvalRequest: expect.objectContaining({ status: "approved" }),
          operation: expect.objectContaining({
            resourceId: imported.skill.id,
            status: "queued",
            type: "skill_publish",
          }),
        });
        expect(beforeRunner?.skill.status).toBe("draft");
        expect(jobResult).toMatchObject({ outcome: "succeeded", status: "handled" });
        expect(detail?.skill.status).toBe("published");
        expect(detail?.versions[0]).toMatchObject({
          id: imported.version.id,
          publishedByUserId: owner.id,
        });
      } finally {
        await Promise.all([authStore.close(), skillStore.close(), governanceStore.close(), operationStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("directly creates approved assignments only for users with target manage_skills permission", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      const governanceStore = createPostgresSkillGovernanceStore({ connectionString: database.url });
      const operationStore = createPostgresOperationStore({ connectionString: database.url });
      try {
        const owner = await authStore.upsertUserForEmail("assign-owner@example.com");
        const member = await authStore.upsertUserForEmail("assign-member@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: owner.id,
          name: "Assign Team",
          slug: "assign-team",
        });
        await joinOrganization(authStore, {
          email: member.email,
          invitedByUserId: owner.id,
          organizationId: organization.id,
          userId: member.id,
        });
        const imported = await skillStore.importSkillVersion({
          createdByUserId: owner.id,
          organizationId: organization.id,
          package: createSkillPackageFromMarkdown({
            content: `---
name: Agent Skill
description: Assign to agent.
license: MIT
compatibility: openclaw
---

# Agent Skill
`,
            source: { type: "upload_md" },
          }),
        });
        await governanceStore.publishSkillVersion({
          publishedByUserId: owner.id,
          skillId: imported.skill.id,
          skillVersionId: imported.version.id,
        });
        await governanceStore.grantResourcePermission({
          grantedByUserId: owner.id,
          organizationId: organization.id,
          permission: "view",
          resourceId: imported.skill.id,
          resourceType: "skill",
          subjectUserId: member.id,
        });
        let currentSession: AuthSessionContext = {
          id: "ses_member",
          organizations: await authStore.listOrganizationsForUser(member.id),
          user: member,
        };
        const { baseUrl } = await startGovernanceApi({
          governanceStore,
          operationStore,
          requireUserSession: async () => currentSession,
          skillStore,
        });

        const needsApprovalResponse = await postJson(`${baseUrl}/api/skill-assignments`, {
          organizationId: organization.id,
          skillId: imported.skill.id,
          skillVersionId: imported.version.id,
          targetId: "agent-main",
          targetType: "agent",
        });
        const needsApprovalPayload = await needsApprovalResponse.json();

        expect(needsApprovalResponse.status).toBe(202);
        expect(needsApprovalPayload).toMatchObject({
          approvalRequest: expect.objectContaining({ action: "assign_skill", targetId: "agent-main" }),
        });
        await expect(governanceStore.listSkillAssignments({
          organizationId: organization.id,
        })).resolves.toEqual([]);

        currentSession = {
          id: "ses_owner",
          organizations: await authStore.listOrganizationsForUser(owner.id),
          user: owner,
        };
        await postJson(`${baseUrl}/api/resource-permissions`, {
          organizationId: organization.id,
          permission: "manage_skills",
          resourceId: "agent-main",
          resourceType: "agent",
          subjectUserId: member.id,
        });
        currentSession = {
          id: "ses_member",
          organizations: await authStore.listOrganizationsForUser(member.id),
          user: member,
        };
        const directResponse = await postJson(`${baseUrl}/api/skill-assignments`, {
          organizationId: organization.id,
          skillId: imported.skill.id,
          skillVersionId: imported.version.id,
          targetId: "agent-main",
          targetType: "agent",
        });
        const directPayload = await directResponse.json();
        const beforeRunnerResponse = await fetch(`${baseUrl}/api/skill-assignments?organizationId=${encodeURIComponent(organization.id)}`);
        const jobResult = await runOneSkillOperation(operationStore, governanceStore);
        const assignmentsResponse = await fetch(`${baseUrl}/api/skill-assignments?organizationId=${encodeURIComponent(organization.id)}`);

        expect(directResponse.status).toBe(202);
        expect(directPayload).toMatchObject({
          operation: expect.objectContaining({
            status: "queued",
            targetId: "agent-main",
            type: "skill_assign",
          }),
        });
        await expect(beforeRunnerResponse.json()).resolves.toMatchObject({
          assignments: [],
        });
        expect(jobResult).toMatchObject({ outcome: "succeeded", status: "handled" });
        await expect(assignmentsResponse.json()).resolves.toMatchObject({
          assignments: [expect.objectContaining({
            createdByUserId: member.id,
            status: "approved",
            targetId: "agent-main",
          })],
        });
      } finally {
        await Promise.all([authStore.close(), skillStore.close(), governanceStore.close(), operationStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("queues Skill sync operations for approved assignments", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      const governanceStore = createPostgresSkillGovernanceStore({ connectionString: database.url });
      const operationStore = createPostgresOperationStore({ connectionString: database.url });
      try {
        const owner = await authStore.upsertUserForEmail("sync-api-owner@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: owner.id,
          name: "Sync API Team",
          slug: "sync-api-team",
        });
        const imported = await skillStore.importSkillVersion({
          createdByUserId: owner.id,
          organizationId: organization.id,
          package: createSkillPackageFromMarkdown({
            content: `---
name: API Sync Skill
description: Sync through API.
license: MIT
compatibility: codex
---

# API Sync Skill
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
        const currentSession: AuthSessionContext = {
          id: "ses_owner",
          organizations: await authStore.listOrganizationsForUser(owner.id),
          user: owner,
        };
        const { baseUrl } = await startGovernanceApi({
          governanceStore,
          operationStore,
          requireUserSession: async () => currentSession,
          skillStore,
        });

        const syncResponse = await postJson(`${baseUrl}/api/skill-assignments/${encodeURIComponent(assignment.id)}/sync`, {});
        const syncPayload = await syncResponse.json();
        const operations = await operationStore.listOperations({
          organizationId: organization.id,
          targetId: assignment.targetId,
          targetType: assignment.targetType,
        });

        expect(syncResponse.status).toBe(202);
        expect(syncPayload).toMatchObject({
          operation: expect.objectContaining({
            resourceId: imported.skill.id,
            status: "queued",
            targetId: assignment.targetId,
            type: "skill_sync",
          }),
        });
        expect(operations).toEqual([
          expect.objectContaining({
            id: syncPayload.operation.id,
            metadata: expect.objectContaining({ assignmentId: assignment.id }),
            type: "skill_sync",
          }),
        ]);
      } finally {
        await Promise.all([authStore.close(), skillStore.close(), governanceStore.close(), operationStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("requires the configured resolver role for approval decisions", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      const governanceStore = createPostgresSkillGovernanceStore({ connectionString: database.url });
      try {
        const owner = await authStore.upsertUserForEmail("required-owner@example.com");
        const admin = await authStore.upsertUserForEmail("required-admin@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: owner.id,
          name: "Required Role Team",
          slug: "required-role-team",
        });
        await joinOrganization(authStore, {
          email: admin.email,
          invitedByUserId: owner.id,
          organizationId: organization.id,
          role: "admin",
          userId: admin.id,
        });
        const approval = await governanceStore.createApprovalRequest({
          action: "delete_skill",
          organizationId: organization.id,
          requestedByUserId: admin.id,
          requiredRole: "owner",
          riskLevel: "high",
          riskSummary: "Deleting a shared Skill requires organization owner approval.",
        });
        let currentSession: AuthSessionContext = {
          id: "ses_admin",
          organizations: await authStore.listOrganizationsForUser(admin.id),
          user: admin,
        };
        const { baseUrl } = await startGovernanceApi({
          governanceStore,
          requireUserSession: async () => currentSession,
          skillStore,
        });

        const adminResponse = await postJson(`${baseUrl}/api/approval-requests/${encodeURIComponent(approval.id)}/approve`, {});
        currentSession = {
          id: "ses_owner",
          organizations: await authStore.listOrganizationsForUser(owner.id),
          user: owner,
        };
        const ownerResponse = await postJson(`${baseUrl}/api/approval-requests/${encodeURIComponent(approval.id)}/reject`, {
          resolutionReason: "Do not delete it.",
        });

        expect(adminResponse.status).toBe(403);
        expect(ownerResponse.status).toBe(200);
        await expect(ownerResponse.json()).resolves.toMatchObject({
          approvalRequest: expect.objectContaining({
            requiredRole: "owner",
            status: "rejected",
          }),
        });
      } finally {
        await Promise.all([authStore.close(), skillStore.close(), governanceStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });
});

describe("skill governance target Skill set API", () => {
  it("resolves an agent Skill set from explicit Device, Runtime, and Agent assignments", async () => {
    const now = new Date("2026-05-16T00:00:00.000Z");
    const assignments: SkillAssignmentRow[] = [
      skillAssignment({
        id: "assignment-device-shared",
        skillId: "skill-shared",
        skillVersionId: "version-device",
        status: "synced",
        targetId: "device-1",
        targetType: "device",
        updatedAt: now,
      }),
      skillAssignment({
        id: "assignment-runtime-observe",
        skillId: "skill-observe",
        skillVersionId: "version-runtime",
        status: "approved",
        targetId: "runtime-1",
        targetType: "runtime",
        updatedAt: now,
      }),
      skillAssignment({
        id: "assignment-agent-shared",
        skillId: "skill-shared",
        skillVersionId: "version-agent",
        status: "approved",
        targetId: "agent-1",
        targetType: "agent",
        updatedAt: now,
      }),
      skillAssignment({
        id: "assignment-disabled",
        skillId: "skill-disabled",
        status: "disabled",
        targetId: "agent-1",
        targetType: "agent",
        updatedAt: now,
      }),
    ];
    const governanceStore = {
      listSkillAssignments: async ({ organizationId }: { organizationId: string }) => (
        organizationId === "org_1" ? assignments : []
      ),
    } as unknown as SkillGovernanceStore;
    const { baseUrl } = await startGovernanceApi({
      governanceStore,
      readRuntimeFleet: async () => ({
        agents: [{
          channelBindings: [],
          id: "agent-1",
          lastSeenAt: "2026-05-16T00:00:00.000Z",
          name: "Main Agent",
          origin: "openclaw",
          runtimeId: "runtime-1",
          sourceRefs: [],
          status: "idle",
        }],
        devices: [{
          connectionMode: "collector",
          hostname: "device-1.local",
          id: "device-1",
          lastSeenAt: "2026-05-16T00:00:00.000Z",
          name: "Device One",
          os: "darwin",
          status: "online",
        }],
        observedAt: "2026-05-16T00:00:00.000Z",
        runtimes: [{
          capabilities: [],
          deviceId: "device-1",
          id: "runtime-1",
          kind: "openclaw",
          lastSeenAt: "2026-05-16T00:00:00.000Z",
          name: "OpenClaw",
          sourceRefs: [],
          status: "online",
        }],
        summary: { agentCount: 1, deviceCount: 1, runtimeCount: 1 },
      }),
      requireUserSession: async () => ({
        id: "ses_1",
        organizations: [{ organizationId: "org_1", role: "member" }],
        user: { createdAt: now, email: "member@example.com", id: "user_1", updatedAt: now },
      }),
      skillStore: {} as SkillStore,
    } as Parameters<typeof createSkillGovernanceHttpApiHandler>[0]);

    const response = await fetch(`${baseUrl}/api/skill-targets/agent/agent-1/skill-set?organizationId=org_1`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      target: { id: "agent-1", name: "Main Agent", type: "agent" },
      targetLineage: [
        { targetId: "device-1", targetType: "device" },
        { targetId: "runtime-1", targetType: "runtime" },
        { targetId: "agent-1", targetType: "agent" },
      ],
      targetSkillSet: [
        expect.objectContaining({
          id: "assignment-runtime-observe",
          resolutionState: "pending_sync",
          skillId: "skill-observe",
          targetType: "runtime",
        }),
        expect.objectContaining({
          id: "assignment-agent-shared",
          overriddenAssignmentIds: ["assignment-device-shared"],
          resolutionState: "pending_sync",
          skillId: "skill-shared",
          skillVersionId: "version-agent",
          targetType: "agent",
        }),
      ],
    });
  });
});

async function joinOrganization(
  authStore: ReturnType<typeof createPostgresAuthStore>,
  input: {
    email: string;
    invitedByUserId: string;
    organizationId: string;
    role?: "admin" | "member";
    userId: string;
  },
): Promise<void> {
  const tokenHash = `${input.userId}-invite`;
  await authStore.createInvitation({
    email: input.email,
    expiresAt: new Date(Date.now() + 60_000),
    invitedByUserId: input.invitedByUserId,
    organizationId: input.organizationId,
    role: input.role ?? "member",
    tokenHash,
  });
  await authStore.acceptInvitation({
    email: input.email,
    now: new Date(),
    tokenHash,
    userId: input.userId,
  });
}

function skillAssignment(
  input: Pick<SkillAssignmentRow, "id" | "skillId" | "status" | "targetId" | "targetType" | "updatedAt">
    & Partial<SkillAssignmentRow>,
): SkillAssignmentRow {
  const createdAt = input.createdAt ?? input.updatedAt;
  return {
    approvedByUserId: input.approvedByUserId ?? "user_1",
    createdAt,
    createdByUserId: input.createdByUserId ?? "user_1",
    id: input.id,
    lastSyncJobId: input.lastSyncJobId ?? null,
    organizationId: input.organizationId ?? "org_1",
    skillId: input.skillId,
    skillVersionId: input.skillVersionId ?? `version-${input.skillId}`,
    status: input.status,
    targetId: input.targetId,
    targetType: input.targetType,
    updatedAt: input.updatedAt,
  };
}

async function startSkillApi(options: Parameters<typeof createSkillHttpApiHandler>[0]) {
  const handler = createSkillHttpApiHandler(options);
  return startServer(handler);
}

async function startGovernanceApi(options: Parameters<typeof createSkillGovernanceHttpApiHandler>[0]) {
  const handler = createSkillGovernanceHttpApiHandler(options);
  return startServer(handler);
}

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<void>,
) {
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
  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

function postJson(url: string, payload: unknown): Promise<Response> {
  return fetch(url, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

async function runOneSkillOperation(
  operationStore: OperationStore,
  governanceStore: ReturnType<typeof createPostgresSkillGovernanceStore>,
) {
  const runner = createOperationJobRunner({
    handlers: createSkillOperationJobHandlers({ governanceStore }),
    leaseMs: 30_000,
    now: () => new Date(Date.now() + 60_000),
    operationStore,
    runnerId: "skill-governance-http-api-test",
  });
  return runner.runDueJobOnce();
}
