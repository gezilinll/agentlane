import { describe, expect, it } from "vitest";
import { createPostgresAuthStore } from "../auth/auth-store";
import {
  createTemporaryPostgresDatabase,
  runMigrationsScript,
  shouldRunPostgresTests,
} from "../test/postgres";
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
