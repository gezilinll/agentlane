import { describe, expect, it } from "vitest";
import { extractCommitSubject, validateCommitMessage } from "./check-commit-message.mjs";

describe("commit message convention", () => {
  it("accepts the Lorume conventional commit subset", () => {
    expect(validateCommitMessage("feat(runtime): add device heartbeat").valid).toBe(true);
    expect(validateCommitMessage("fix(runs): 修复工作看板分页").valid).toBe(true);
    expect(validateCommitMessage("docs: update backend deployment notes").valid).toBe(true);
  });

  it("accepts git-generated merge and revert subjects", () => {
    expect(validateCommitMessage("Merge branch 'main' into codex/runtime").valid).toBe(true);
    expect(validateCommitMessage("Revert \"fix: stabilize work board display\"").valid).toBe(true);
  });

  it("rejects untyped subjects", () => {
    const result = validateCommitMessage("Add Postgres-backed runtime APIs");

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("expected type(scope): subject");
  });

  it("uses the first non-comment subject line from git commit message files", () => {
    expect(extractCommitSubject("\n# Please enter the commit message\nfix: keep counts stable\n")).toBe(
      "fix: keep counts stable",
    );
  });
});
