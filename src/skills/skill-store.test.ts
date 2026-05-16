import { describe, expect, it } from "vitest";
import { createPostgresAuthStore } from "../auth/auth-store";
import {
  createTemporaryPostgresDatabase,
  runMigrationsScript,
  shouldRunPostgresTests,
} from "../test/postgres";
import { createPostgresSkillGovernanceStore } from "./skill-governance-store";
import { createSkillPackageFromMarkdown, SkillPackageValidationError } from "./skill-package";
import { createPostgresSkillStore } from "./skill-store";

const describeDb = shouldRunPostgresTests() ? describe : describe.skip;

describeDb("Postgres skill store", () => {
  it("stores organization-owned skill versions and their files", async () => {
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
          slug: "skill-team",
        });
        const skillPackage = createSkillPackageFromMarkdown({
          content: `---
name: Review Bot
description: Shared review guidance.
license: MIT
compatibility: openclaw
---

# Review Bot
`,
          source: { type: "upload_md" },
        });

        const imported = await skillStore.importSkillVersion({
          createdByUserId: user.id,
          organizationId: organization.id,
          package: skillPackage,
        });
        const list = await skillStore.listSkills({ organizationId: organization.id });
        const detail = await skillStore.readSkillDetail({ skillId: imported.skill.id });
        const versionFiles = await skillStore.readSkillVersionFiles({
          skillId: imported.skill.id,
          skillVersionId: imported.version.id,
        });

        expect(imported.skill).toMatchObject({
          description: "Shared review guidance.",
          name: "Review Bot",
          organizationId: organization.id,
          slug: "review-bot",
          status: "draft",
        });
        expect(imported.version).toMatchObject({
          packageHash: skillPackage.packageHash,
          validationStatus: "passed",
          version: "1",
        });
        expect(list).toEqual([expect.objectContaining({ id: imported.skill.id, latestVersion: "1" })]);
        expect(detail).toMatchObject({
          skill: expect.objectContaining({ id: imported.skill.id }),
          versions: [expect.objectContaining({ id: imported.version.id })],
          files: [expect.objectContaining({ path: "SKILL.md", content: expect.stringContaining("# Review Bot") })],
        });
        expect(versionFiles).toEqual([
          expect.objectContaining({ path: "SKILL.md", content: expect.stringContaining("# Review Bot") }),
        ]);
      } finally {
        await Promise.all([authStore.close(), skillStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("creates immutable draft versions for an existing organization Skill", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("skill-editor@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Skill Editor Team",
          slug: "skill-editor-team",
        });
        const imported = await skillStore.importSkillVersion({
          createdByUserId: user.id,
          organizationId: organization.id,
          package: createSkillPackageFromMarkdown({
            content: `---
name: Review Bot
description: Shared review guidance.
license: MIT
compatibility: openclaw
---

# Review Bot
`,
            source: { type: "upload_md" },
          }),
        });
        const editedPackage = createSkillPackageFromMarkdown({
          content: `---
name: Review Bot
description: Updated review guidance.
license: MIT
compatibility: openclaw
---

# Review Bot

Add one more deterministic check.
`,
          source: { filename: "SKILL.md", type: "manual_edit" },
        });

        const draft = await skillStore.createSkillDraftVersion({
          createdByUserId: user.id,
          package: editedPackage,
          skillId: imported.skill.id,
          summary: "Update review guidance",
        });
        const detail = await skillStore.readSkillDetail({ skillId: imported.skill.id });

        expect(draft.skill).toMatchObject({
          id: imported.skill.id,
          description: "Updated review guidance.",
          slug: "review-bot",
          status: "draft",
        });
        expect(draft.version).toMatchObject({
          packageHash: editedPackage.packageHash,
          publishedAt: null,
          validationStatus: "passed",
          version: "2",
        });
        expect(detail?.versions.map((version) => version.version)).toEqual(["2", "1"]);
        expect(detail?.files).toEqual([
          expect.objectContaining({
            content: expect.stringContaining("Add one more deterministic check."),
            path: "SKILL.md",
          }),
        ]);
      } finally {
        await Promise.all([authStore.close(), skillStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("archives skills without deleting their immutable history", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("skill-archiver@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Skill Archive Team",
          slug: "skill-archive-team",
        });
        const imported = await skillStore.importSkillVersion({
          createdByUserId: user.id,
          organizationId: organization.id,
          package: createSkillPackageFromMarkdown({
            content: `---
name: Archive Candidate
description: Skill that should be hidden without losing history.
license: MIT
compatibility: openclaw
---

# Archive Candidate
`,
            source: { type: "upload_md" },
          }),
        });

        const archived = await skillStore.archiveSkill({
          archivedByUserId: user.id,
          skillId: imported.skill.id,
        });
        const list = await skillStore.listSkills({ organizationId: organization.id });
        const detail = await skillStore.readSkillDetail({ skillId: imported.skill.id });

        expect(archived).toMatchObject({
          id: imported.skill.id,
          status: "archived",
        });
        expect(archived.archivedAt).toBeInstanceOf(Date);
        expect(list).toEqual([]);
        expect(detail).toMatchObject({
          files: [expect.objectContaining({ path: "SKILL.md" })],
          skill: expect.objectContaining({ id: imported.skill.id, status: "archived" }),
          versions: [expect.objectContaining({ id: imported.version.id })],
        });
      } finally {
        await Promise.all([authStore.close(), skillStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("deletes only unreferenced draft skills", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const skillStore = createPostgresSkillStore({ connectionString: database.url });
      const governanceStore = createPostgresSkillGovernanceStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("skill-deleter@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Skill Delete Team",
          slug: "skill-delete-team",
        });
        const draft = await skillStore.importSkillVersion({
          createdByUserId: user.id,
          organizationId: organization.id,
          package: createSkillPackageFromMarkdown({
            content: `---
name: Draft Candidate
description: Draft Skill that can be removed.
license: MIT
compatibility: openclaw
---

# Draft Candidate
`,
            source: { type: "upload_md" },
          }),
        });

        await expect(skillStore.deleteDraftSkill({ skillId: draft.skill.id })).resolves.toMatchObject({
          id: draft.skill.id,
        });
        await expect(skillStore.readSkillDetail({ skillId: draft.skill.id })).resolves.toBeNull();

        const published = await skillStore.importSkillVersion({
          createdByUserId: user.id,
          organizationId: organization.id,
          package: createSkillPackageFromMarkdown({
            content: `---
name: Published Candidate
description: Published Skill must be archived rather than deleted.
license: MIT
compatibility: openclaw
---

# Published Candidate
`,
            source: { type: "upload_md" },
          }),
        });
        await governanceStore.publishSkillVersion({
          publishedByUserId: user.id,
          skillId: published.skill.id,
          skillVersionId: published.version.id,
        });

        await expect(skillStore.deleteDraftSkill({ skillId: published.skill.id })).rejects.toThrow(
          "published Skill cannot be deleted",
        );
      } finally {
        await Promise.all([authStore.close(), skillStore.close(), governanceStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("does not persist blocked packages", async () => {
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
          slug: "skill-team-blocked",
        });

        expect(() => createSkillPackageFromMarkdown({
          content: `---
name: Missing Description
---

# Missing Description
`,
          source: { type: "upload_md" },
        })).toThrow(SkillPackageValidationError);
        await expect(skillStore.listSkills({ organizationId: organization.id })).resolves.toEqual([]);
      } finally {
        await Promise.all([authStore.close(), skillStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });
});
