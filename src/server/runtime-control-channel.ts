import type {
  RuntimeCommand,
  RuntimeCommandStatus,
  RuntimeInventoryStore,
} from "./runtime-inventory-store";

/** Minimal socket interface shared by tests and the Vite WebSocket adapter. */
export interface RuntimeControlSocket {
  /** Send a serialized JSON control message. */
  send: (data: string) => void;
}

/** Runtime control channel construction options. */
export interface RuntimeControlChannelOptions {
  /** Store used for connection and command state. */
  store: RuntimeInventoryStore;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
  /** Command id injection for deterministic tests. */
  createCommandId?: () => string;
}

/** File payload sent to a device for deterministic Skill writeback. */
export interface RuntimeSkillSyncFilePayload {
  /** Repository-relative Skill file path. */
  path: string;
  /** UTF-8 file content. */
  content: string;
  /** Expected SHA-256 content hash, with or without `sha256:` prefix. */
  contentHash: string;
  /** Expected UTF-8 byte size. */
  sizeBytes: number;
}

/** Device command payload for Skill target sync. */
export interface RuntimeSkillSyncCommandPayload {
  /** Assignment id being synchronized. */
  assignmentId: string;
  /** Owning organization id. */
  organizationId: string;
  /** Skill id. */
  skillId: string;
  /** Skill version id. */
  skillVersionId: string;
  /** Organization-local Skill slug. */
  skillSlug: string;
  /** Target type. */
  targetType: "device" | "runtime" | "agent";
  /** Target id. */
  targetId: string;
  /** Immutable Skill package hash. */
  packageHash: string;
  /** Skill files to write. */
  files: RuntimeSkillSyncFilePayload[];
}

/** Runtime control channel API used by the dev backend. */
export interface RuntimeControlChannel {
  /** Attach a socket before it sends hello. */
  attach: (socket: RuntimeControlSocket) => void;
  /** Detach a socket and mark its device offline when registered. */
  detach: (socket: RuntimeControlSocket, reason?: string) => void;
  /** Receive one serialized JSON message from a socket. */
  receive: (socket: RuntimeControlSocket, rawMessage: string) => void;
  /** Dispatch an inventory refresh command to an online device. */
  requestInventoryRefresh: (deviceId: string) => RuntimeCommand;
  /** Dispatch a Skill sync command to an online device. */
  requestSkillSync: (deviceId: string, payload: RuntimeSkillSyncCommandPayload) => RuntimeCommand;
  /** Wait for a command to reach a terminal state. */
  waitForCommandResult: (
    commandId: string,
    options?: { intervalMs?: number; timeoutMs?: number },
  ) => Promise<RuntimeCommand>;
  /** Return whether the channel currently has a live socket for a device. */
  isDeviceConnected: (deviceId: string) => boolean;
}

type ControlMessage = {
  type?: string;
  deviceId?: string;
  deviceName?: string;
  commandId?: string;
  collectorVersion?: string;
  hostname?: string;
  summary?: Record<string, unknown>;
  status?: RuntimeCommandStatus;
  result?: Record<string, unknown>;
  error?: string;
};

/** Create the in-memory Runtime Fleet device control channel. */
export function createRuntimeControlChannel(options: RuntimeControlChannelOptions): RuntimeControlChannel {
  const now = options.now ?? (() => new Date());
  const createCommandId = options.createCommandId ?? randomCommandId;
  const socketDeviceIds = new WeakMap<RuntimeControlSocket, string>();
  const socketsByDeviceId = new Map<string, RuntimeControlSocket>();

  function send(socket: RuntimeControlSocket, message: Record<string, unknown>): void {
    socket.send(JSON.stringify({ sentAt: now().toISOString(), ...message }));
  }

  return {
    attach() {
      // The socket becomes addressable after it sends hello with a device id.
    },
    detach(socket, reason = "socket disconnected") {
      const deviceId = socketDeviceIds.get(socket);
      if (!deviceId) return;
      socketDeviceIds.delete(socket);
      if (socketsByDeviceId.get(deviceId) === socket) socketsByDeviceId.delete(deviceId);
      options.store.markDeviceDisconnected(deviceId, now().toISOString(), reason);
    },
    receive(socket, rawMessage) {
      const message = parseControlMessage(rawMessage);
      if (message.type === "hello") {
        const deviceId = requireDeviceId(message);
        socketDeviceIds.set(socket, deviceId);
        socketsByDeviceId.set(deviceId, socket);
        options.store.writeDeviceConnection({
          deviceId,
          status: "online",
          connectedAt: now().toISOString(),
          lastHeartbeatAt: now().toISOString(),
          collectorVersion: message.collectorVersion,
          hostname: message.hostname,
          deviceName: message.deviceName,
        });
        send(socket, { type: "hello.ack", deviceId });
        return;
      }

      if (message.type === "heartbeat") {
        const deviceId = requireDeviceId(message, socketDeviceIds.get(socket));
        const current = options.store.readDeviceConnection(deviceId) ?? {
          deviceId,
          status: "online" as const,
        };
        options.store.writeDeviceConnection({
          ...current,
          deviceId,
          status: "online",
          lastHeartbeatAt: now().toISOString(),
          collectorVersion: message.collectorVersion ?? current.collectorVersion,
          hostname: message.hostname ?? current.hostname,
          deviceName: message.deviceName ?? current.deviceName,
          summary: message.summary ?? current.summary,
          lastError: message.error ?? current.lastError,
        });
        return;
      }

      if (message.type === "command.accepted") {
        options.store.updateRuntimeCommand(requireCommandId(message), {
          status: "accepted",
          acceptedAt: now().toISOString(),
        });
        return;
      }

      if (message.type === "command.result") {
        options.store.updateRuntimeCommand(requireCommandId(message), {
          status: message.status ?? "succeeded",
          completedAt: now().toISOString(),
          result: message.result,
          error: message.error,
        });
        return;
      }

      send(socket, { type: "error", error: `unsupported message type: ${message.type ?? "unknown"}` });
    },
    requestInventoryRefresh(deviceId) {
      return dispatchCommand({
        createCommandId,
        deviceId,
        now,
        payload: undefined,
        send,
        socketsByDeviceId,
        store: options.store,
        type: "inventory.refresh",
      });
    },
    requestSkillSync(deviceId, payload) {
      return dispatchCommand({
        createCommandId,
        deviceId,
        now,
        payload,
        send,
        socketsByDeviceId,
        store: options.store,
        type: "skill.sync",
      });
    },
    async waitForCommandResult(commandId, waitOptions = {}) {
      const timeoutMs = waitOptions.timeoutMs ?? 30_000;
      const intervalMs = waitOptions.intervalMs ?? 100;
      const startedAt = Date.now();
      while (Date.now() - startedAt <= timeoutMs) {
        const command = options.store.readRuntimeCommand(commandId);
        if (!command) throw new Error(`unknown runtime command: ${commandId}`);
        if (isTerminalCommandStatus(command.status)) return command;
        await sleep(intervalMs);
      }
      return options.store.updateRuntimeCommand(commandId, {
        completedAt: now().toISOString(),
        error: "command timed out",
        status: "timed_out",
      });
    },
    isDeviceConnected(deviceId) {
      return socketsByDeviceId.has(deviceId);
    },
  };
}

function dispatchCommand(input: {
  createCommandId: () => string;
  deviceId: string;
  now: () => Date;
  payload: RuntimeSkillSyncCommandPayload | undefined;
  send: (socket: RuntimeControlSocket, message: Record<string, unknown>) => void;
  socketsByDeviceId: Map<string, RuntimeControlSocket>;
  store: RuntimeInventoryStore;
  type: RuntimeCommand["type"];
}): RuntimeCommand {
  const socket = input.socketsByDeviceId.get(input.deviceId);
  if (!socket) throw new Error(`device is not connected: ${input.deviceId}`);
  const createdAt = input.now().toISOString();
  const command = input.store.createRuntimeCommand({
    commandId: input.createCommandId(),
    deviceId: input.deviceId,
    type: input.type,
    createdAt,
    sentAt: createdAt,
    status: "sent",
  });
  input.send(socket, {
    type: input.type,
    commandId: command.commandId,
    deviceId: input.deviceId,
    ...(input.payload ? { payload: input.payload } : {}),
  });
  return command;
}

function isTerminalCommandStatus(status: RuntimeCommand["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "timed_out";
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function parseControlMessage(rawMessage: string): ControlMessage {
  const parsed = JSON.parse(rawMessage) as unknown;
  if (!isRecord(parsed)) throw new Error("control message must be an object");
  return parsed;
}

function requireDeviceId(message: ControlMessage, fallback?: string): string {
  const deviceId = message.deviceId ?? fallback;
  if (!deviceId) throw new Error("control message missing deviceId");
  return deviceId;
}

function requireCommandId(message: ControlMessage): string {
  if (!message.commandId) throw new Error("control message missing commandId");
  return message.commandId;
}

function randomCommandId(): string {
  return `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
