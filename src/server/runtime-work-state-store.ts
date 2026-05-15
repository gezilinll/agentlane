import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RuntimeWorkStateSnapshot } from "../runtime";

/** Runtime work-state persistence options for the local Lorume backend. */
export interface RuntimeWorkStateStoreOptions {
  /** Absolute or repository-relative path for the latest work-state snapshot JSON file. */
  snapshotPath?: string;
}

/** Minimal persistence surface used by the dev backend and tests. */
export interface RuntimeWorkStateStore {
  /** Absolute path where the latest work-state snapshot is stored. */
  snapshotPath: string;
  /** Read the latest work-state snapshot, or null when no device has posted yet. */
  readLatestSnapshot: () => RuntimeWorkStateSnapshot | null;
  /** Validate and persist the latest work-state snapshot. */
  writeLatestSnapshot: (snapshot: unknown) => RuntimeWorkStateSnapshot;
}

const defaultSnapshotPath = path.resolve(".lorume", "runtime-work-state", "latest.json");

/** Create a file-backed store for the latest runtime work-state snapshot. */
export function createRuntimeWorkStateStore(
  options: RuntimeWorkStateStoreOptions = {},
): RuntimeWorkStateStore {
  const snapshotPath = path.resolve(
    options.snapshotPath || process.env.LORUME_RUNTIME_WORK_STATE_PATH || defaultSnapshotPath,
  );

  return {
    snapshotPath,
    readLatestSnapshot() {
      if (!existsSync(snapshotPath)) return null;
      const parsed = JSON.parse(readFileSync(snapshotPath, "utf8")) as unknown;
      if (!validateRuntimeWorkStateSnapshot(parsed)) {
        throw new Error(`invalid runtime work state snapshot at ${snapshotPath}`);
      }
      return parsed;
    },
    writeLatestSnapshot(snapshot) {
      if (!validateRuntimeWorkStateSnapshot(snapshot)) {
        throw new Error("invalid runtime work state snapshot");
      }

      mkdirSync(path.dirname(snapshotPath), { recursive: true });
      const tempPath = `${snapshotPath}.${process.pid}.tmp`;
      writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`);
      renameSync(tempPath, snapshotPath);
      return snapshot;
    },
  };
}

/** Validate the small contract Lorume needs before accepting a work-state snapshot. */
export function validateRuntimeWorkStateSnapshot(value: unknown): value is RuntimeWorkStateSnapshot {
  if (!isRecord(value)) return false;
  if (typeof value.observedAt !== "string") return false;
  if (typeof value.deviceId !== "string") return false;
  if (!Array.isArray(value.workItems)) return false;
  if (!Array.isArray(value.conversations)) return false;
  if (!Array.isArray(value.executions)) return false;
  if (!Array.isArray(value.capabilities)) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
