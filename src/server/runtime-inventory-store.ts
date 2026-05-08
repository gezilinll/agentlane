import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RuntimeInventorySnapshot } from "../runtime";

/** Device connection state tracked by the local control plane. */
export type RuntimeDeviceConnectionStatus = "online" | "stale" | "offline";

/** Latest known connection metadata for one registered device. */
export interface RuntimeDeviceConnection {
  /** Stable Agentlane device id. */
  deviceId: string;
  /** Connection status computed independently from runtime health. */
  status: RuntimeDeviceConnectionStatus;
  /** ISO timestamp when the current socket was connected. */
  connectedAt?: string;
  /** ISO timestamp for the latest heartbeat. */
  lastHeartbeatAt?: string;
  /** ISO timestamp when the socket last disconnected. */
  lastDisconnectedAt?: string;
  /** Collector version reported by the device agent. */
  collectorVersion?: string;
  /** Hostname reported by the device agent. */
  hostname?: string;
  /** Human-readable device name reported by the device agent. */
  deviceName?: string;
  /** Small load/status summary reported by heartbeat. */
  summary?: Record<string, unknown>;
  /** Latest control-plane error for this device. */
  lastError?: string;
}

/** Runtime control command supported by Agentlane v1. */
export type RuntimeCommandType = "inventory.refresh";

/** Runtime command lifecycle status. */
export type RuntimeCommandStatus =
  | "pending"
  | "sent"
  | "accepted"
  | "succeeded"
  | "failed"
  | "timed_out";

/** Device control command state. */
export interface RuntimeCommand {
  /** Stable command id used for idempotency. */
  commandId: string;
  /** Device expected to execute the command. */
  deviceId: string;
  /** Command type. */
  type: RuntimeCommandType;
  /** Current lifecycle state. */
  status: RuntimeCommandStatus;
  /** ISO timestamp when Agentlane created the command. */
  createdAt: string;
  /** ISO timestamp when Agentlane sent the command to the device. */
  sentAt?: string;
  /** ISO timestamp when the device accepted the command. */
  acceptedAt?: string;
  /** ISO timestamp when the command completed. */
  completedAt?: string;
  /** Optional command result payload. */
  result?: Record<string, unknown>;
  /** Optional command error reason. */
  error?: string;
}

/** Runtime inventory persistence options for the local Agentlane backend. */
export interface RuntimeInventoryStoreOptions {
  /** Absolute or repository-relative path for the latest snapshot JSON file. */
  snapshotPath?: string;
  /** Milliseconds after which an online connection is considered stale without heartbeat. */
  staleAfterMs?: number;
}

/** Minimal persistence surface used by the dev backend and tests. */
export interface RuntimeInventoryStore {
  /** Absolute path where the latest snapshot is stored. */
  snapshotPath: string;
  /** Read the latest snapshot, or null when no device has posted yet. */
  readLatestSnapshot: () => RuntimeInventorySnapshot | null;
  /** Validate and persist the latest snapshot. */
  writeLatestSnapshot: (snapshot: unknown) => RuntimeInventorySnapshot;
  /** Read device control connection state, or null when the device has never connected. */
  readDeviceConnection: (deviceId: string, now?: Date) => RuntimeDeviceConnection | null;
  /** Upsert device control connection state. */
  writeDeviceConnection: (connection: RuntimeDeviceConnection) => RuntimeDeviceConnection;
  /** Mark a previously connected device as disconnected. */
  markDeviceDisconnected: (deviceId: string, disconnectedAt: string, reason?: string) => RuntimeDeviceConnection | null;
  /** Create a runtime control command in pending state. */
  createRuntimeCommand: (command: Omit<RuntimeCommand, "status"> & { status?: RuntimeCommandStatus }) => RuntimeCommand;
  /** Read a runtime control command by id. */
  readRuntimeCommand: (commandId: string) => RuntimeCommand | null;
  /** Merge command lifecycle changes into an existing runtime control command. */
  updateRuntimeCommand: (commandId: string, patch: Partial<RuntimeCommand>) => RuntimeCommand;
}

const defaultSnapshotPath = path.resolve(".agentlane", "runtime-inventory", "latest.json");
const defaultStaleAfterMs = 90_000;

/** Create a file-backed store for the latest runtime inventory snapshot. */
export function createRuntimeInventoryStore(
  options: RuntimeInventoryStoreOptions = {},
): RuntimeInventoryStore {
  const snapshotPath = path.resolve(
    options.snapshotPath || process.env.AGENTLANE_RUNTIME_INVENTORY_PATH || defaultSnapshotPath,
  );
  const staleAfterMs = options.staleAfterMs ?? defaultStaleAfterMs;
  const deviceConnections = new Map<string, RuntimeDeviceConnection>();
  const runtimeCommands = new Map<string, RuntimeCommand>();

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
    readDeviceConnection(deviceId, now = new Date()) {
      const connection = deviceConnections.get(deviceId);
      if (!connection) return null;
      return applyConnectionFreshness(connection, now, staleAfterMs);
    },
    writeDeviceConnection(connection) {
      const nextConnection = { ...connection };
      deviceConnections.set(connection.deviceId, nextConnection);
      return { ...nextConnection };
    },
    markDeviceDisconnected(deviceId, disconnectedAt, reason) {
      const current = deviceConnections.get(deviceId);
      if (!current) return null;
      const nextConnection = {
        ...current,
        status: "offline" as const,
        lastDisconnectedAt: disconnectedAt,
        ...(reason ? { lastError: reason } : {}),
      };
      deviceConnections.set(deviceId, nextConnection);
      return { ...nextConnection };
    },
    createRuntimeCommand(command) {
      const nextCommand = {
        ...command,
        status: command.status ?? "pending",
      };
      runtimeCommands.set(command.commandId, nextCommand);
      return { ...nextCommand };
    },
    readRuntimeCommand(commandId) {
      const command = runtimeCommands.get(commandId);
      return command ? { ...command } : null;
    },
    updateRuntimeCommand(commandId, patch) {
      const current = runtimeCommands.get(commandId);
      if (!current) throw new Error(`unknown runtime command: ${commandId}`);
      const nextCommand = { ...current, ...patch, commandId };
      runtimeCommands.set(commandId, nextCommand);
      return { ...nextCommand };
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

function applyConnectionFreshness(
  connection: RuntimeDeviceConnection,
  now: Date,
  staleAfterMs: number,
): RuntimeDeviceConnection {
  if (connection.status !== "online") return { ...connection };
  const latestSeenAt = connection.lastHeartbeatAt ?? connection.connectedAt;
  if (!latestSeenAt) return { ...connection };
  const latestSeenTime = Date.parse(latestSeenAt);
  if (!Number.isFinite(latestSeenTime)) return { ...connection };
  if (now.getTime() - latestSeenTime <= staleAfterMs) return { ...connection };
  return { ...connection, status: "stale" };
}
