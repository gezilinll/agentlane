import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createPostgresAuthStore, type AuthSessionContext } from "../auth/auth-store";
import {
  createTemporaryPostgresDatabase,
  runMigrationsScript,
  shouldRunPostgresTests,
} from "../test/postgres";
import { createPostgresStore } from "../server/postgres-store";
import type { RuntimeInventorySnapshot } from "../runtime";
import { createSkillHttpApiHandler } from "./skill-http-api";
import { createPostgresSkillStore } from "./skill-store";

const describeDb = shouldRunPostgresTests() ? describe : describe.skip;
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

describeDb("skill HTTP API", () => {
  it("imports and reads organization skills for a signed-in organization member", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("skill-owner@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Skill Team",
          slug: "skill-team-api",
        });
        const session: AuthSessionContext = {
          id: "ses_test",
          organizations: await authStore.listOrganizationsForUser(user.id),
          user,
        };
        const { baseUrl } = await startSkillApi({
          requireUserSession: async () => session,
          skillStore,
        });

        const importResponse = await postJson(`${baseUrl}/api/skills/import`, {
          organizationId: organization.id,
          source: {
            content: `---
name: Cost Guard
description: Shared cost review guidance.
license: MIT
compatibility: openclaw
---

# Cost Guard
`,
            type: "markdown",
          },
        });
        const imported = await importResponse.json();
        const listResponse = await fetch(`${baseUrl}/api/skills?organizationId=${encodeURIComponent(organization.id)}`);
        const detailResponse = await fetch(`${baseUrl}/api/skills/${encodeURIComponent(imported.skill.id)}`);
        const filesResponse = await fetch(`${baseUrl}/api/skills/${encodeURIComponent(imported.skill.id)}/versions/${encodeURIComponent(imported.version.id)}/files`);

        expect(importResponse.status).toBe(201);
        expect(imported).toMatchObject({
          skill: expect.objectContaining({ name: "Cost Guard", slug: "cost-guard" }),
          version: expect.objectContaining({ validationStatus: "passed" }),
        });
        await expect(listResponse.json()).resolves.toMatchObject({
          skills: [expect.objectContaining({ id: imported.skill.id, latestVersion: "1" })],
        });
        await expect(detailResponse.json()).resolves.toMatchObject({
          skill: expect.objectContaining({ id: imported.skill.id }),
          files: [expect.objectContaining({ path: "SKILL.md" })],
        });
        await expect(filesResponse.json()).resolves.toMatchObject({
          files: [expect.objectContaining({
            path: "SKILL.md",
            content: expect.stringContaining("# Cost Guard\n"),
          })],
        });
      } finally {
        await Promise.all([authStore.close(), skillStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("keeps skills scoped to organization membership", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("member@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Member Org",
          slug: "member-org",
        });
        const session: AuthSessionContext = {
          id: "ses_test",
          organizations: await authStore.listOrganizationsForUser(user.id),
          user,
        };
        const { baseUrl } = await startSkillApi({
          requireUserSession: async () => session,
          skillStore,
        });

        const allowed = await fetch(`${baseUrl}/api/skills?organizationId=${encodeURIComponent(organization.id)}`);
        const forbidden = await fetch(`${baseUrl}/api/skills?organizationId=org_other`);

        expect(allowed.status).toBe(200);
        expect(forbidden.status).toBe(403);
      } finally {
        await Promise.all([authStore.close(), skillStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("imports marketplace URLs that resolve to Skill package content", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("marketplace@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Marketplace Org",
          slug: "marketplace-org",
        });
        const session: AuthSessionContext = {
          id: "ses_test",
          organizations: await authStore.listOrganizationsForUser(user.id),
          user,
        };
        const { baseUrl } = await startSkillApi({
          fetch: async () => new Response(`---
name: Marketplace Cost Guard
description: Imported through marketplace URL.
license: MIT
compatibility: openclaw
---

# Marketplace Cost Guard
`, {
            headers: { "content-type": "text/markdown" },
            status: 200,
          }),
          requireUserSession: async () => session,
          skillStore,
        });

        const importResponse = await postJson(`${baseUrl}/api/skills/import`, {
          organizationId: organization.id,
          source: {
            type: "marketplace_url",
            url: "https://marketplace.example/skills/cost-guard.md",
          },
        });
        const imported = await importResponse.json();

        expect(importResponse.status).toBe(201);
        expect(imported).toMatchObject({
          skill: expect.objectContaining({ name: "Marketplace Cost Guard" }),
          version: expect.objectContaining({ validationStatus: "passed" }),
        });
      } finally {
        await Promise.all([authStore.close(), skillStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("creates draft versions for editable organization Skills", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("skill-draft-editor@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Draft Org",
          slug: "draft-org",
        });
        const session: AuthSessionContext = {
          id: "ses_test",
          organizations: await authStore.listOrganizationsForUser(user.id),
          user,
        };
        const { baseUrl } = await startSkillApi({
          requireUserSession: async () => session,
          skillStore,
        });
        const importResponse = await postJson(`${baseUrl}/api/skills/import`, {
          organizationId: organization.id,
          source: {
            content: `---
name: Draftable Skill
description: First version.
license: MIT
compatibility: openclaw
---

# Draftable Skill
`,
            type: "markdown",
          },
        });
        const imported = await importResponse.json();

        const draftResponse = await postJson(`${baseUrl}/api/skills/${encodeURIComponent(imported.skill.id)}/versions`, {
          source: {
            content: `---
name: Draftable Skill
description: Edited version.
license: MIT
compatibility: openclaw
---

# Draftable Skill

Edited in Lorume.
`,
            filename: "SKILL.md",
            type: "markdown",
          },
          summary: "Edit guidance",
        });
        const draft = await draftResponse.json();
        const detailResponse = await fetch(`${baseUrl}/api/skills/${encodeURIComponent(imported.skill.id)}`);

        expect(draftResponse.status).toBe(201);
        expect(draft).toMatchObject({
          skill: expect.objectContaining({
            description: "Edited version.",
            id: imported.skill.id,
            slug: "draftable-skill",
          }),
          version: expect.objectContaining({
            publishedAt: null,
            validationStatus: "passed",
            version: "2",
          }),
        });
        await expect(detailResponse.json()).resolves.toMatchObject({
          versions: [
            expect.objectContaining({ id: draft.version.id, version: "2" }),
            expect.objectContaining({ id: imported.version.id, version: "1" }),
          ],
          files: [
            expect.objectContaining({
              content: expect.stringContaining("Edited in Lorume."),
              path: "SKILL.md",
            }),
          ],
        });
      } finally {
        await Promise.all([authStore.close(), skillStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("archives skills through the formal API without returning them in normal lists", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("skill-archive-api@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Archive API Org",
          slug: "archive-api-org",
        });
        const session: AuthSessionContext = {
          id: "ses_test",
          organizations: await authStore.listOrganizationsForUser(user.id),
          user,
        };
        const { baseUrl } = await startSkillApi({
          requireUserSession: async () => session,
          skillStore,
        });
        const importResponse = await postJson(`${baseUrl}/api/skills/import`, {
          organizationId: organization.id,
          source: {
            content: `---
name: Archivable Skill
description: Archive through API.
license: MIT
compatibility: openclaw
---

# Archivable Skill
`,
            type: "markdown",
          },
        });
        const imported = await importResponse.json();

        const archiveResponse = await postJson(`${baseUrl}/api/skills/${encodeURIComponent(imported.skill.id)}/archive`, {});
        const archivePayload = await archiveResponse.json();
        const listResponse = await fetch(`${baseUrl}/api/skills?organizationId=${encodeURIComponent(organization.id)}`);
        const detailResponse = await fetch(`${baseUrl}/api/skills/${encodeURIComponent(imported.skill.id)}`);

        expect(archiveResponse.status).toBe(200);
        expect(archivePayload).toMatchObject({
          skill: expect.objectContaining({ id: imported.skill.id, status: "archived" }),
        });
        await expect(listResponse.json()).resolves.toEqual({ skills: [] });
        await expect(detailResponse.json()).resolves.toMatchObject({
          skill: expect.objectContaining({ id: imported.skill.id, status: "archived" }),
        });
      } finally {
        await Promise.all([authStore.close(), skillStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("deletes draft skills through the formal API", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("skill-delete-api@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Delete API Org",
          slug: "delete-api-org",
        });
        const session: AuthSessionContext = {
          id: "ses_test",
          organizations: await authStore.listOrganizationsForUser(user.id),
          user,
        };
        const { baseUrl } = await startSkillApi({
          requireUserSession: async () => session,
          skillStore,
        });
        const importResponse = await postJson(`${baseUrl}/api/skills/import`, {
          organizationId: organization.id,
          source: {
            content: `---
name: Deletable Draft
description: Draft can be deleted before publication.
license: MIT
compatibility: openclaw
---

# Deletable Draft
`,
            type: "markdown",
          },
        });
        const imported = await importResponse.json();

        const deleteResponse = await fetch(`${baseUrl}/api/skills/${encodeURIComponent(imported.skill.id)}`, {
          method: "DELETE",
        });
        const detailResponse = await fetch(`${baseUrl}/api/skills/${encodeURIComponent(imported.skill.id)}`);

        expect(deleteResponse.status).toBe(200);
        await expect(deleteResponse.json()).resolves.toEqual({ deletedSkillId: imported.skill.id });
        expect(detailResponse.status).toBe(404);
      } finally {
        await Promise.all([authStore.close(), skillStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("lists discovered device Skills and promotes one to an organization-owned copy", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const runtimeStore = createPostgresStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("skill-promoter@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Promotion Org",
          slug: "promotion-org",
        });
        const session: AuthSessionContext = {
          id: "ses_test",
          organizations: await authStore.listOrganizationsForUser(user.id),
          user,
        };
        await runtimeStore.upsertInventorySnapshot(createInventoryWithDiscoveredSkill());
        const { baseUrl } = await startSkillApi({
          requireUserSession: async () => session,
          runtimeStore,
          skillStore,
        });

        const listResponse = await fetch(`${baseUrl}/api/skill-discoveries?organizationId=${encodeURIComponent(organization.id)}`);
        const listPayload = await listResponse.json();
        const promoteResponse = await postJson(
          `${baseUrl}/api/skill-discoveries/${encodeURIComponent(listPayload.skillDiscoveries[0].id)}/promote`,
          { organizationId: organization.id },
        );
        const promoted = await promoteResponse.json();
        const skillsResponse = await fetch(`${baseUrl}/api/skills?organizationId=${encodeURIComponent(organization.id)}`);

        expect(listResponse.status).toBe(200);
        expect(listPayload).toMatchObject({
          skillDiscoveries: [
            expect.objectContaining({
              name: "Runtime Review",
              source: "openclaw",
              targetType: "agent",
            }),
          ],
        });
        expect(promoteResponse.status).toBe(201);
        expect(promoted).toMatchObject({
          skill: expect.objectContaining({
            name: "Runtime Review",
            source: expect.objectContaining({ type: "device_discovery" }),
          }),
          version: expect.objectContaining({ validationStatus: "passed" }),
        });
        await expect(skillsResponse.json()).resolves.toMatchObject({
          skills: [expect.objectContaining({ id: promoted.skill.id, name: "Runtime Review" })],
        });
      } finally {
        await Promise.all([authStore.close(), runtimeStore.close(), skillStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });
});

async function startSkillApi(options: Parameters<typeof createSkillHttpApiHandler>[0]) {
  const handler = createSkillHttpApiHandler(options);
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

function createInventoryWithDiscoveredSkill(): RuntimeInventorySnapshot {
  return {
    agents: [
      {
        channelBindings: [{ kind: "dingtalk", label: "DingTalk", status: "enabled" }],
        id: "fixture-mac:openclaw:gateway-18789:agent:main",
        lastSeenAt: "2026-05-08T08:00:02.000Z",
        load: {},
        name: "main",
        origin: "openclaw",
        runtimeId: "fixture-mac:openclaw:gateway-18789",
        sourceRefs: [{ externalId: "main", label: "main", source: "openclaw" }],
        status: "idle",
      },
    ],
    collector: { status: "online", version: "0.1.0" },
    device: {
      architecture: "arm64",
      connectionMode: "collector",
      hostname: "fixture-mac.local",
      id: "fixture-mac",
      lastSeenAt: "2026-05-08T08:00:03.000Z",
      name: "Fixture Mac",
      os: "darwin",
      status: "online",
    },
    observedAt: "2026-05-08T08:00:03.000Z",
    reports: [],
    runtimes: [
      {
        capabilities: ["skill:discover"],
        deviceId: "fixture-mac",
        id: "fixture-mac:openclaw:gateway-18789",
        kind: "openclaw",
        lastSeenAt: "2026-05-08T08:00:03.000Z",
        name: "OpenClaw Gateway",
        sourceRefs: [{ externalId: "gateway-18789", label: "OpenClaw Gateway", source: "openclaw" }],
        status: "online",
      },
    ],
    skillDiscoveries: [
      {
        agentId: "fixture-mac:openclaw:gateway-18789:agent:main",
        description: "Review runtime changes.",
        deviceId: "fixture-mac",
        files: [
          {
            content: `---
name: Runtime Review
description: Review runtime changes.
license: MIT
compatibility: openclaw
---

# Runtime Review
`,
            path: "SKILL.md",
          },
        ],
        id: "fixture-mac:openclaw:gateway-18789:agent:main:skill:runtime-review",
        lastSeenAt: "2026-05-08T08:00:03.000Z",
        name: "Runtime Review",
        packageHash: "hash-runtime-review",
        runtimeId: "fixture-mac:openclaw:gateway-18789",
        skillPath: "/Users/dev/.openclaw/skills/runtime-review",
        source: "openclaw",
        targetId: "fixture-mac:openclaw:gateway-18789:agent:main",
        targetName: "main",
        targetType: "agent",
      },
    ],
  };
}
