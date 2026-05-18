import { describe, expect, it } from "vitest";
import {
  normalizeAgentSkillProbeSnapshot,
  parseAgentSkillProbeEntries,
} from "./agent-skill-probe";

describe("agent Skill probe metadata", () => {
  it("groups files by local SKILL.md root and keeps non-Markdown files metadata-only", () => {
    const snapshot = parseAgentSkillProbeEntries({
      deviceId: "device-1",
      runtimeId: "runtime-1",
      targetAgentId: "agent-1",
      observedAt: "2026-05-18T10:00:00.000Z",
      files: [
        { path: "/Users/example/.codex/skills/reviewer/SKILL.md", sizeBytes: 320 },
        { path: "/Users/example/.codex/skills/reviewer/references/checklist.md", sizeBytes: 180 },
        { path: "/Users/example/.codex/skills/reviewer/scripts/probe.sh", sizeBytes: 90 },
        { path: "/Users/example/.codex/skills/reviewer/assets/icon.png", sizeBytes: 512 },
        { path: "/Users/example/.codex/skills/other/SKILL.md" },
      ],
    });

    expect(snapshot).toMatchObject({
      deviceId: "device-1",
      runtimeId: "runtime-1",
      targetAgentId: "agent-1",
      status: "succeeded",
    });
    expect(snapshot.skills).toHaveLength(2);
    expect(snapshot.skills[0]).toMatchObject({
      name: "other",
      entryPath: "/Users/example/.codex/skills/other/SKILL.md",
      rootPath: "/Users/example/.codex/skills/other",
    });
    expect(snapshot.skills[1]).toMatchObject({
      name: "reviewer",
      entryPath: "/Users/example/.codex/skills/reviewer/SKILL.md",
      rootPath: "/Users/example/.codex/skills/reviewer",
      markdownFiles: [
        expect.objectContaining({ relativePath: "SKILL.md" }),
        expect.objectContaining({ relativePath: "references/checklist.md" }),
      ],
      nonMarkdownFiles: [
        expect.objectContaining({ relativePath: "assets/icon.png" }),
        expect.objectContaining({ relativePath: "scripts/probe.sh" }),
      ],
    });
  });

  it("normalizes snapshots without preserving file contents or invalid statuses", () => {
    const normalized = normalizeAgentSkillProbeSnapshot({
      targetAgentId: "agent-1",
      deviceId: "device-1",
      runtimeId: "runtime-1",
      status: "succeeded",
      observedAt: "2026-05-18T10:00:00.000Z",
      skills: [{
        name: "reviewer",
        rootPath: "/skills/reviewer",
        entryPath: "/skills/reviewer/SKILL.md",
        markdownFiles: [{
          name: "SKILL.md",
          path: "/skills/reviewer/SKILL.md",
          relativePath: "SKILL.md",
          content: "# should not survive",
        }],
        nonMarkdownFiles: [{
          name: "probe.sh",
          path: "/skills/reviewer/scripts/probe.sh",
          relativePath: "scripts/probe.sh",
          content: "rm -rf no",
        }],
      }],
    });

    expect(normalized?.skills[0].markdownFiles[0]).not.toHaveProperty("content");
    expect(normalized?.skills[0].nonMarkdownFiles[0]).not.toHaveProperty("content");
    expect(normalizeAgentSkillProbeSnapshot({ status: "installed" })).toBeNull();
  });
});
