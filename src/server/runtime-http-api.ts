import type { IncomingMessage, ServerResponse } from "node:http";
import type { RuntimeControlChannel } from "./runtime-control-channel";
import type { RuntimeInventoryStore } from "./runtime-inventory-store";
import type { PostgresStore } from "./postgres-store";
import type { RuntimeWorkStateStore } from "./runtime-work-state-store";
import type { CreateNotificationEventInput } from "../notifications/notification-store";

const maxJsonBodyChars = 10_000_000;

/** Dependencies for the Runtime Fleet local HTTP API. */
export interface RuntimeHttpApiHandlerOptions {
  /** Optional auth guards for user reads and device ingestion. */
  auth?: {
    requireDeviceToken?: (request: IncomingMessage) => Promise<unknown | null>;
    requireUserSession?: (request: IncomingMessage) => Promise<unknown | null>;
  };
  /** Snapshot, connection, and command state store. */
  store: RuntimeInventoryStore;
  /** Device control channel for refresh dispatch. */
  controlChannel: RuntimeControlChannel;
  /** Latest runtime work-state snapshot store. */
  workStateStore?: RuntimeWorkStateStore;
  /** Optional Postgres-backed formal repository. */
  postgresStore?: PostgresStore;
  /** Optional notification integration for collector ingestion health events. */
  collectorNotifications?: {
    createNotificationEvent: (input: CreateNotificationEventInput) => Promise<unknown>;
    listRecipientUserIds: (organizationId: string, deviceId: string) => Promise<string[]>;
  };
}

/** Node/Vite middleware-style next callback. */
export type RuntimeHttpNext = () => void;

/** Runtime Fleet local HTTP API handler. */
export type RuntimeHttpApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: RuntimeHttpNext,
) => Promise<void>;

/** Create the local Runtime Fleet HTTP API used by Vite and backend tests. */
export function createRuntimeHttpApiHandler(options: RuntimeHttpApiHandlerOptions): RuntimeHttpApiHandler {
  return async function runtimeHttpApiHandler(request, response, next) {
    const requestUrl = new URL(request.url || "/", "http://lorume.local");

    if (request.method === "GET" && requestUrl.pathname === "/healthz") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/readyz") {
      if (!options.postgresStore) {
        sendJson(response, 503, { ok: false, error: "postgres_store_unavailable" });
        return;
      }
      try {
        await options.postgresStore.checkReady();
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, 503, {
          ok: false,
          error: "postgres_unavailable",
          message: error instanceof Error ? error.message : "Postgres is unavailable",
        });
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/runtime-fleet") {
      if (!(await authorizeUserRead(options, request, response))) return;
      if (!options.postgresStore) {
        sendJson(response, 503, { error: "postgres_store_unavailable" });
        return;
      }
      sendJson(response, 200, await options.postgresStore.readRuntimeFleet());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/runtime-work-items") {
      if (!(await authorizeUserRead(options, request, response))) return;
      if (!options.postgresStore) {
        sendJson(response, 503, { error: "postgres_store_unavailable" });
        return;
      }
      sendJson(response, 200, await options.postgresStore.listRuntimeWorkItems({
        channelKind: requestUrl.searchParams.get("channelKind"),
        endAt: requestUrl.searchParams.get("endAt"),
        limit: parseLimit(requestUrl.searchParams.get("limit")),
        cursor: requestUrl.searchParams.get("cursor"),
        search: requestUrl.searchParams.get("search"),
        source: requestUrl.searchParams.get("source"),
        stage: requestUrl.searchParams.get("stage"),
        startAt: requestUrl.searchParams.get("startAt"),
      }));
      return;
    }

    const workItemMatch = requestUrl.pathname.match(/^\/api\/runtime-work-items\/([^/]+)$/);
    if (request.method === "GET" && workItemMatch) {
      if (!(await authorizeUserRead(options, request, response))) return;
      if (!options.postgresStore) {
        sendJson(response, 503, { error: "postgres_store_unavailable" });
        return;
      }
      const workItemId = decodeURIComponent(workItemMatch[1] ?? "");
      const workItem = await options.postgresStore.readWorkItem(workItemId);
      if (!workItem) {
        sendJson(response, 404, { error: "work_item_not_found", id: workItemId });
        return;
      }
      sendJson(response, 200, workItem);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/device-snapshots") {
      const deviceAuth = await authorizeDeviceWrite(options, request, response);
      if (deviceAuth === null) return;
      let body: unknown = undefined;
      try {
        body = await readJsonBody(request);
        const snapshot = options.store.writeLatestSnapshot(body);
        await options.postgresStore?.upsertInventorySnapshot(snapshot);
        sendJson(response, 201, {
          ok: true,
          deviceId: snapshot.device.id,
          observedAt: snapshot.observedAt,
        });
      } catch (error) {
        await recordFailedCollectorIngestion(options, "inventory", body, error);
        await notifyFailedCollectorIngestion(options, "inventory", body, error, deviceAuth);
        sendJson(response, statusCodeForWriteError(error), {
          error: error instanceof Error ? error.message : "invalid snapshot",
        });
      }
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/runtime-work-state-snapshots") {
      const deviceAuth = await authorizeDeviceWrite(options, request, response);
      if (deviceAuth === null) return;
      if (!options.workStateStore) {
        sendJson(response, 503, { error: "work_state_store_unavailable" });
        return;
      }
      let body: unknown = undefined;
      try {
        body = await readJsonBody(request);
        const snapshot = options.workStateStore.writeLatestSnapshot(body);
        await options.postgresStore?.upsertWorkStateSnapshot(snapshot);
        sendJson(response, 201, {
          ok: true,
          deviceId: snapshot.deviceId,
          observedAt: snapshot.observedAt,
        });
      } catch (error) {
        await recordFailedCollectorIngestion(options, "work_state", body, error);
        await notifyFailedCollectorIngestion(options, "work_state", body, error, deviceAuth);
        sendJson(response, statusCodeForWriteError(error), {
          error: error instanceof Error ? error.message : "invalid runtime work state snapshot",
        });
      }
      return;
    }

    const refreshMatch = requestUrl.pathname.match(/^\/api\/devices\/([^/]+)\/refresh$/);
    if (request.method === "POST" && refreshMatch) {
      if (!(await authorizeUserRead(options, request, response))) return;
      const deviceId = decodeURIComponent(refreshMatch[1] ?? "");
      try {
        const command = options.controlChannel.requestInventoryRefresh(deviceId);
        sendJson(response, 202, {
          ok: true,
          commandId: command.commandId,
          deviceId: command.deviceId,
          status: command.status,
        });
      } catch (error) {
        sendJson(response, 409, {
          error: "device_not_connected",
          deviceId,
          message: error instanceof Error ? error.message : "device is not connected",
        });
      }
      return;
    }

    const commandMatch = requestUrl.pathname.match(/^\/api\/devices\/([^/]+)\/commands\/([^/]+)$/);
    if (request.method === "GET" && commandMatch) {
      if (!(await authorizeUserRead(options, request, response))) return;
      const deviceId = decodeURIComponent(commandMatch[1] ?? "");
      const commandId = decodeURIComponent(commandMatch[2] ?? "");
      const command = options.store.readRuntimeCommand(commandId);
      if (!command || command.deviceId !== deviceId) {
        sendJson(response, 404, { error: "command_not_found", deviceId, commandId });
        return;
      }
      sendJson(response, 200, command);
      return;
    }

    const ingestionMatch = requestUrl.pathname.match(/^\/api\/devices\/([^/]+)\/ingestions$/);
    if (request.method === "GET" && ingestionMatch) {
      if (!(await authorizeUserRead(options, request, response))) return;
      if (!options.postgresStore) {
        sendJson(response, 503, { error: "postgres_store_unavailable" });
        return;
      }
      const deviceId = decodeURIComponent(ingestionMatch[1] ?? "");
      sendJson(response, 200, {
        deviceId,
        ingestions: await options.postgresStore.listCollectorIngestions(deviceId),
      });
      return;
    }

    const collectionHealthMatch = requestUrl.pathname.match(/^\/api\/devices\/([^/]+)\/collection-health$/);
    if (request.method === "GET" && collectionHealthMatch) {
      if (!(await authorizeUserRead(options, request, response))) return;
      if (!options.postgresStore) {
        sendJson(response, 503, { error: "postgres_store_unavailable" });
        return;
      }
      const deviceId = decodeURIComponent(collectionHealthMatch[1] ?? "");
      sendJson(response, 200, await options.postgresStore.readDeviceCollectionHealth(deviceId));
      return;
    }

    next();
  };
}

async function authorizeUserRead(
  options: RuntimeHttpApiHandlerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  if (!options.auth?.requireUserSession) return true;
  const session = await options.auth.requireUserSession(request);
  if (session) return true;
  sendJson(response, 401, { error: "unauthorized" });
  return false;
}

async function authorizeDeviceWrite(
  options: RuntimeHttpApiHandlerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<unknown | null> {
  if (!options.auth?.requireDeviceToken) return undefined;
  const deviceToken = await options.auth.requireDeviceToken(request);
  if (deviceToken) return deviceToken;
  sendJson(response, 401, { error: "invalid_device_token" });
  return null;
}

async function recordFailedCollectorIngestion(
  options: RuntimeHttpApiHandlerOptions,
  snapshotType: "inventory" | "work_state",
  body: unknown,
  error: unknown,
): Promise<void> {
  if (!options.postgresStore) return;
  await options.postgresStore.recordFailedCollectorIngestion({
    deviceId: extractDeviceId(snapshotType, body),
    error: error instanceof Error ? error.message : "invalid collector snapshot",
    observedAt: extractObservedAt(body),
    snapshotType,
  }).catch(() => undefined);
}

async function notifyFailedCollectorIngestion(
  options: RuntimeHttpApiHandlerOptions,
  snapshotType: "inventory" | "work_state",
  body: unknown,
  error: unknown,
  deviceAuth: unknown,
): Promise<void> {
  if (!options.collectorNotifications) return;
  const organizationId = extractOrganizationId(deviceAuth);
  if (!organizationId) return;
  const deviceId = extractDeviceId(snapshotType, body);
  const recipients = uniqueNonEmptyStrings(
    await options.collectorNotifications.listRecipientUserIds(organizationId, deviceId).catch(() => []),
  );
  if (recipients.length === 0) return;
  const label = snapshotType === "inventory" ? "设备资产" : "工作态";
  await options.collectorNotifications.createNotificationEvent({
    dedupeKey: `runtime:collector:${deviceId}:${snapshotType}:failed`,
    emailCooldownMs: 30 * 60 * 1000,
    eventType: `collector_${snapshotType}_failed`,
    organizationId,
    recipientUserIds: recipients,
    resourceId: deviceId,
    resourceType: "device",
    severity: "warning",
    sourceModule: "runtime",
    summary: `${deviceId} ${label}采集失败：${errorSummary(error)}`,
    title: `${label}采集失败`,
  }).catch(() => undefined);
}

function extractOrganizationId(deviceAuth: unknown): string | undefined {
  if (!deviceAuth || typeof deviceAuth !== "object") return undefined;
  const organizationId = (deviceAuth as Record<string, unknown>).organizationId;
  return typeof organizationId === "string" && organizationId.trim() ? organizationId : undefined;
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function errorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : "invalid collector snapshot";
  return message.replace(/\s+/g, " ").trim().slice(0, 200);
}

function extractDeviceId(snapshotType: "inventory" | "work_state", body: unknown): string {
  if (!body || typeof body !== "object") return "unknown";
  const candidate = body as Record<string, unknown>;
  if (snapshotType === "work_state" && typeof candidate.deviceId === "string") return candidate.deviceId;
  if (snapshotType === "inventory") {
    const device = candidate.device;
    if (device && typeof device === "object" && typeof (device as Record<string, unknown>).id === "string") {
      return (device as Record<string, string>).id;
    }
  }
  return "unknown";
}

function extractObservedAt(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const observedAt = (body as Record<string, unknown>).observedAt;
  return typeof observedAt === "string" ? observedAt : undefined;
}

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function statusCodeForWriteError(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("invalid") || message.includes("too large")) return 400;
  return 500;
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxJsonBodyChars) {
        reject(new Error("request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("invalid json body"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}
