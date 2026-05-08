import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RuntimeInventorySnapshot } from "../runtime";

/** Runtime inventory persistence options for the local Agentlane backend. */
export interface RuntimeInventoryStoreOptions {
  /** Absolute or repository-relative path for the latest snapshot JSON file. */
  snapshotPath?: string;
}

/** Minimal persistence surface used by the dev backend and tests. */
export interface RuntimeInventoryStore {
  /** Absolute path where the latest snapshot is stored. */
  snapshotPath: string;
  /** Read the latest snapshot, or null when no device has posted yet. */
  readLatestSnapshot: () => RuntimeInventorySnapshot | null;
  /** Validate and persist the latest snapshot. */
  writeLatestSnapshot: (snapshot: unknown) => RuntimeInventorySnapshot;
}

const defaultSnapshotPath = path.resolve(".agentlane", "runtime-inventory", "latest.json");

/** Create a file-backed store for the latest runtime inventory snapshot. */
export function createRuntimeInventoryStore(
  options: RuntimeInventoryStoreOptions = {},
): RuntimeInventoryStore {
  const snapshotPath = path.resolve(
    options.snapshotPath || process.env.AGENTLANE_RUNTIME_INVENTORY_PATH || defaultSnapshotPath,
  );

  return {
    snapshotPath,
    readLatestSnapshot() {
      if (!existsSync(snapshotPath)) return null;
      const parsed = JSON.parse(readFileSync(snapshotPath, "utf8")) as unknown;
      if (!validateRuntimeInventorySnapshot(parsed)) {
        throw new Error(`invalid runtime inventory snapshot at ${snapshotPath}`);
      }
      return parsed;
    },
    writeLatestSnapshot(snapshot) {
      if (!validateRuntimeInventorySnapshot(snapshot)) {
        throw new Error("invalid runtime inventory snapshot");
      }

      mkdirSync(path.dirname(snapshotPath), { recursive: true });
      const tempPath = `${snapshotPath}.${process.pid}.tmp`;
      writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`);
      renameSync(tempPath, snapshotPath);
      return snapshot;
    },
  };
}

/** Validate the small contract Agentlane needs before accepting a collector snapshot. */
export function validateRuntimeInventorySnapshot(value: unknown): value is RuntimeInventorySnapshot {
  if (!isRecord(value)) return false;
  if (typeof value.observedAt !== "string") return false;
  if (!isRecord(value.collector) || typeof value.collector.version !== "string") return false;
  if (!isRecord(value.device) || typeof value.device.id !== "string" || typeof value.device.name !== "string") {
    return false;
  }
  if (!Array.isArray(value.runtimes) || !Array.isArray(value.agents) || !Array.isArray(value.reports)) {
    return false;
  }

  return value.runtimes.every(isRuntimeLike) && value.agents.every(isAgentLike);
}

function isRuntimeLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.deviceId === "string" &&
    typeof value.kind === "string" &&
    typeof value.name === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.capabilities) &&
    Array.isArray(value.sourceRefs)
  );
}

function isAgentLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.runtimeId === "string" &&
    typeof value.name === "string" &&
    typeof value.origin === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.channelBindings) &&
    Array.isArray(value.sourceRefs)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
