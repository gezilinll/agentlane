import { describe, expect, it } from "vitest";
import {
  createSkillPackageFromFiles,
  createSkillPackageFromGithubUrl,
  createSkillPackageFromMarketplaceUrl,
  createSkillPackageFromMarkdown,
  createSkillPackageFromZip,
  SkillPackageValidationError,
} from "./skill-package";

describe("skill package validation", () => {
  it("normalizes a single Markdown upload into a reviewable skill package", () => {
    const skillPackage = createSkillPackageFromMarkdown({
      content: `---
name: Runtime Review
description: Guides agents through runtime review.
license: MIT
compatibility: openclaw, multica
---

# Runtime Review

Use this when reviewing runtime inventory.
`,
      filename: "runtime-review.md",
      source: { type: "upload_md" },
    });

    expect(skillPackage.metadata).toMatchObject({
      name: "Runtime Review",
      description: "Guides agents through runtime review.",
      license: "MIT",
    });
    expect(skillPackage.files).toEqual([
      expect.objectContaining({
        content: expect.stringContaining("# Runtime Review"),
        path: "SKILL.md",
      }),
    ]);
    expect(skillPackage.packageHash).toMatch(/^[a-f0-9]{64}$/);
    expect(skillPackage.validation.status).toBe("passed");
    expect(skillPackage.validation.issues).toEqual([]);
  });

  it("blocks escaped package paths while allowing relative references inside file content", () => {
    const safePackage = createSkillPackageFromFiles({
      files: [{
        content: `---
name: Relative Reference
description: Verifies relative references in content.
license: MIT
compatibility: openclaw
---

Use ../shared/context.md as reading context only.
`,
        path: "SKILL.md",
      }],
      source: { type: "upload_md" },
    });
    expect(safePackage.validation.status).toBe("passed");

    expect(() => createSkillPackageFromFiles({
      files: [{
        content: "# Escape\n",
        path: "skills/../../SKILL.md",
      }],
      source: { type: "upload_zip" },
    })).toThrow(SkillPackageValidationError);

    expect(() => createSkillPackageFromFiles({
      files: [{
        content: `---
name: Absolute
description: Absolute path should be blocked.
license: MIT
compatibility: openclaw
---

# Absolute
`,
        path: "/SKILL.md",
      }],
      source: { type: "upload_zip" },
    })).toThrow(SkillPackageValidationError);
  });

  it("imports a ZIP package only when it has one canonical SKILL.md", () => {
    const skillPackage = createSkillPackageFromZip({
      content: "UEsDBBQAAAAIAGhnrlx+QQBeYAAAAHoAAAAVAAAAYWdlbnQtcmV2aWV3L1NLSUxMLm1kVY07CoAwDED3nCLgXBHHbl7BG8Q0akDTosXP7aXi4vp4j+ecA6NVPHaTWMZeDpUTguy8acoazX8MyZBeZyYLcRxrWJTF9tIm4llcWzfAcU2UddBF8+2RY5ALygWq/+IBUEsDBBQAAAAIAGhnrlyxeWunDgAAAAwAAAAeAAAAYWdlbnQtcmV2aWV3L2RvY3MvY2hlY2tsaXN0Lm1kU1ZwzkhNzs7JLC7hAgBQSwECFAAUAAAACABoZ65cfkEAXmAAAAB6AAAAFQAAAAAAAAAAAAAAAAAAAAAAYWdlbnQtcmV2aWV3L1NLSUxMLm1kUEsBAhQAFAAAAAgAaGeuXLF5a6cOAAAADAAAAB4AAAAAAAAAAAAAAAAAkwAAAGFnZW50LXJldmlldy9kb2NzL2NoZWNrbGlzdC5tZFBLBQYAAAAAAgACAI8AAADdAAAAAAA=",
      filename: "agent-review.zip",
      source: { type: "upload_zip" },
    });

    expect(skillPackage.metadata.name).toBe("Agent Review");
    expect(skillPackage.files.map((file) => file.path)).toEqual(["SKILL.md", "docs/checklist.md"]);
    expect(skillPackage.validation.status).toBe("passed");
  });

  it("imports a GitHub directory URL through the contents API", async () => {
    const fetches: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      const requestUrl = String(url);
      fetches.push(requestUrl);
      if (requestUrl === "https://api.github.com/repos/acme/agent-skills/contents/review?ref=main") {
        return jsonResponse([
          {
            download_url: "https://raw.githubusercontent.test/acme/agent-skills/main/review/SKILL.md",
            path: "review/SKILL.md",
            sha: "sha-skill",
            type: "file",
          },
          {
            path: "review/docs",
            type: "dir",
            url: "https://api.github.com/repos/acme/agent-skills/contents/review/docs?ref=main",
          },
        ]);
      }
      if (requestUrl === "https://api.github.com/repos/acme/agent-skills/contents/review/docs?ref=main") {
        return jsonResponse([{
          download_url: "https://raw.githubusercontent.test/acme/agent-skills/main/review/docs/checklist.md",
          path: "review/docs/checklist.md",
          sha: "sha-doc",
          type: "file",
        }]);
      }
      if (requestUrl.endsWith("/SKILL.md")) {
        return textResponse(`---
name: GitHub Review
description: Imported from GitHub.
license: MIT
compatibility: codex
---

# GitHub Review
`);
      }
      if (requestUrl.endsWith("/checklist.md")) {
        return textResponse("# Checklist\n");
      }
      throw new Error(`unexpected fetch ${requestUrl}`);
    };

    const skillPackage = await createSkillPackageFromGithubUrl({
      fetch: fetchImpl,
      url: "https://github.com/acme/agent-skills/tree/main/review",
    });

    expect(fetches[0]).toBe("https://api.github.com/repos/acme/agent-skills/contents/review?ref=main");
    expect(skillPackage.source).toMatchObject({
      resolvedRef: "sha-skill",
      type: "github_url",
      url: "https://github.com/acme/agent-skills/tree/main/review",
    });
    expect(skillPackage.files.map((file) => file.path)).toEqual(["SKILL.md", "docs/checklist.md"]);
  });

  it("imports a marketplace URL that resolves to a Markdown skill", async () => {
    const fetchImpl: typeof fetch = async (url) => {
      expect(String(url)).toBe("https://marketplace.example/skills/runtime-review.md");
      return new Response(`---
name: Marketplace Review
description: Imported from a marketplace URL.
license: MIT
compatibility: codex
---

# Marketplace Review
`, {
        headers: { "content-type": "text/markdown" },
        status: 200,
      });
    };

    const skillPackage = await createSkillPackageFromMarketplaceUrl({
      fetch: fetchImpl,
      url: "https://marketplace.example/skills/runtime-review.md",
    });

    expect(skillPackage.source).toMatchObject({
      type: "marketplace_url",
      url: "https://marketplace.example/skills/runtime-review.md",
    });
    expect(skillPackage.metadata.name).toBe("Marketplace Review");
    expect(skillPackage.files).toEqual([
      expect.objectContaining({ path: "SKILL.md", content: expect.stringContaining("# Marketplace Review") }),
    ]);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function textResponse(body: string): Response {
  return new Response(body, { status: 200 });
}
