#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const allowedTypes = [
  "feat",
  "fix",
  "docs",
  "test",
  "refactor",
  "chore",
  "build",
  "ci",
  "perf",
  "style",
  "revert",
];

const commitPattern = new RegExp(
  `^(${allowedTypes.join("|")})(\\([a-z0-9][a-z0-9-]*\\))?: .{1,88}$`,
);

/**
 * Extracts the first meaningful commit subject from a raw commit message.
 *
 * Git commit message files may contain blank lines and comment lines from the
 * configured commit template. Only the first non-empty, non-comment line is
 * validated.
 */
export function extractCommitSubject(rawMessage) {
  return rawMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#")) ?? "";
}

/**
 * Validates Agentlane's commit subject convention.
 *
 * The repository uses a small Conventional Commits subset so local history is
 * scannable while still allowing concise Chinese or English subjects.
 */
export function validateCommitMessage(rawMessage) {
  const subject = extractCommitSubject(rawMessage);
  const normalizedSubject = subject.replace(/^(fixup!|squash!)\s+/, "");

  if (!subject) {
    return {
      valid: false,
      subject,
      reason: "commit message is empty",
    };
  }

  if (/^(Merge|Revert) /.test(subject)) {
    return {
      valid: true,
      subject,
      reason: "git-generated subject",
    };
  }

  if (!commitPattern.test(normalizedSubject)) {
    return {
      valid: false,
      subject,
      reason: `expected type(scope): subject with type in ${allowedTypes.join(", ")}`,
    };
  }

  return {
    valid: true,
    subject,
    reason: "conventional commit subject",
  };
}

function printFailure(result) {
  console.error("Invalid commit message.");
  console.error(`Subject: ${result.subject || "(empty)"}`);
  console.error(`Reason: ${result.reason}`);
  console.error("");
  console.error("Use:");
  console.error("  feat(runtime): add device heartbeat");
  console.error("  fix(runs): clamp long work item titles");
  console.error("  docs: update backend deployment notes");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const messagePath = process.argv[2];

  if (!messagePath) {
    console.error("Usage: node scripts/check-commit-message.mjs <commit-msg-file>");
    process.exit(2);
  }

  const rawMessage = readFileSync(messagePath, "utf8");
  const result = validateCommitMessage(rawMessage);

  if (!result.valid) {
    printFailure(result);
    process.exit(1);
  }
}
