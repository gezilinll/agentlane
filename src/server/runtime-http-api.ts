import type { IncomingMessage, ServerResponse } from "node:http";
import type { RuntimeControlChannel } from "./runtime-control-channel";
import type { RuntimeInventoryStore } from "./runtime-inventory-store";
import type { PostgresStore } from "./postgres-store";
import type { RuntimeWorkStateStore } from "./runtime-work-state-store";

const maxJsonBodyChars = 10_000_000;

/** Dependencies for the Runtime Fleet local HTTP API. */
export interface RuntimeHttpApiHandlerOptions {
  /** Snapshot, connection, and command state store. */
  store: RuntimeInventoryStore;
  /** Device control channel for refresh dispatch. */
  controlChannel: RuntimeControlChannel;
  /** Latest runtime work-state snapshot store. */
  workStateStore?: RuntimeWorkStateStore;
  /** Optional Postgres-backed formal repository. */
  postgresStore?: PostgresStore;
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
    const requestUrl = new URL(request.url || "/", "http://agentlane.local");

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
      if (!options.postgresStore) {
        sendJson(response, 503, { error: "postgres_store_unavailable" });
        return;
      }
      sendJson(response, 200, await options.postgresStore.readRuntimeFleet());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/runtime-work-items") {
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
        sendJson(response, statusCodeForWriteError(error), {
          error: error instanceof Error ? error.message : "invalid snapshot",
        });
      }
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/runtime-work-state-snapshots") {
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
        sendJson(response, statusCodeForWriteError(error), {
          error: error instanceof Error ? error.message : "invalid runtime work state snapshot",
        });
      }
      return;
    }

    const refreshMatch = requestUrl.pathname.match(/^\/api\/devices\/([^/]+)\/refresh$/);
    if (request.method === "POST" && refreshMatch) {
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

    next();
  };
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
