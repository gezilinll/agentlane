import type { IncomingMessage, ServerResponse } from "node:http";
import type { RuntimeControlChannel } from "./runtime-control-channel";
import type { RuntimeInventoryStore } from "./runtime-inventory-store";
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

    if (request.method === "GET" && requestUrl.pathname === "/api/runtime-inventory/latest") {
      const snapshot = options.store.readLatestSnapshot();
      if (!snapshot) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      sendJson(response, 200, snapshot);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/runtime-work-state/latest") {
      const snapshot = options.workStateStore?.readLatestSnapshot() ?? null;
      if (!snapshot) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      sendJson(response, 200, snapshot);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/device-snapshots") {
      try {
        const snapshot = options.store.writeLatestSnapshot(await readJsonBody(request));
        sendJson(response, 201, {
          ok: true,
          deviceId: snapshot.device.id,
          observedAt: snapshot.observedAt,
        });
      } catch (error) {
        sendJson(response, 400, {
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
      try {
        const snapshot = options.workStateStore.writeLatestSnapshot(await readJsonBody(request));
        sendJson(response, 201, {
          ok: true,
          deviceId: snapshot.deviceId,
          observedAt: snapshot.observedAt,
        });
      } catch (error) {
        sendJson(response, 400, {
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

    next();
  };
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
