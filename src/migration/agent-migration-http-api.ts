import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthSessionContext } from "../auth/auth-store";
import type { LorumeRuntime, ManagedRuntimeAgent, RuntimeDevice } from "../runtime/runtime-normalize";
import type { PostgresStore } from "../server/postgres-store";
import { createAgentMigrationPlan, describeMigrationCapability } from "./agent-migration-plan";

const maxJsonBodyChars = 1_000_000;

/** Auth guard required by Agent Migration HTTP APIs. */
export interface AgentMigrationHttpAuth {
  /** Return the signed-in user session, or `null` when unauthorized. */
  requireUserSession: (request: IncomingMessage) => Promise<AuthSessionContext | null>;
}

/** Dependencies for the Agent Migration HTTP API. */
export interface AgentMigrationHttpApiHandlerOptions {
  /** User-session auth guard. */
  requireUserSession: AgentMigrationHttpAuth["requireUserSession"];
  /** Runtime inventory read path used to resolve source and target state. */
  runtimeStore?: Pick<PostgresStore, "readRuntimeFleet">;
}

/** Agent Migration API middleware compatible with the backend API chain. */
export type AgentMigrationHttpApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => Promise<void>;

/** Create migration planning routes. */
export function createAgentMigrationHttpApiHandler(
  options: AgentMigrationHttpApiHandlerOptions,
): AgentMigrationHttpApiHandler {
  return async function agentMigrationHttpApiHandler(request, response, next) {
    const requestUrl = new URL(request.url || "/", "http://lorume.local");

    if (request.method === "POST" && requestUrl.pathname === "/api/agent-migrations/plan") {
      const session = await requireSession(request, response, options);
      if (!session) return;
      if (!options.runtimeStore) {
        sendJson(response, 503, { error: "runtime_store_unavailable" });
        return;
      }

      const body = await readJsonBody(request).catch((error) => error);
      if (body instanceof Error) {
        sendJson(response, 400, { error: body.message });
        return;
      }

      const organizationId = readString(body, "organizationId");
      if (!ensureOrganizationMember(response, session, organizationId)) return;

      const targetDeviceId = readString(body, "targetDeviceId");
      if (!targetDeviceId) {
        sendJson(response, 400, { error: "target_device_id_required" });
        return;
      }

      const fleet = await options.runtimeStore.readRuntimeFleet();
      const sourceAgentId = readString(body, "sourceAgentId");
      if (!sourceAgentId) {
        sendJson(response, 400, { error: "source_agent_id_required" });
        return;
      }

      const sourceAgent = fleet.agents.find((agent) => agent.id === sourceAgentId) ?? null;
      if (!sourceAgent) {
        sendJson(response, 404, { error: "source_agent_not_found", sourceAgentId });
        return;
      }

      const sourceRuntime = fleet.runtimes.find((runtime) => runtime.id === sourceAgent.runtimeId) ?? null;
      const sourceRuntimeKind = readString(body, "sourceRuntimeKind") || sourceRuntime?.kind || "unknown";
      const sourceAgentName = readString(body, "sourceAgentName") || sourceAgent?.name;
      const targetDevice = fleet.devices.find((device) => device.id === targetDeviceId) ?? null;
      if (!targetDevice) {
        sendJson(response, 404, { error: "target_device_not_found", targetDeviceId });
        return;
      }

      const targetRuntimeKind = describeMigrationCapability(
        readString(body, "targetRuntimeKind") || sourceRuntimeKind,
      ).runtimeKind;
      const targetRuntime = fleet.runtimes.find((runtime) =>
        runtime.deviceId === targetDevice.id && normalizeRuntimeKind(runtime.kind) === targetRuntimeKind
      ) ?? null;
      const plan = createAgentMigrationPlan({
        desiredChannels: readStringArray(body, "desiredChannels"),
        sourceAgentName,
        sourceRuntimeKind,
        targetDeviceOnline: targetDevice.status === "online",
        targetRuntimeDetected: Boolean(targetRuntime),
        targetRuntimeKind,
      });

      sendJson(response, 200, {
        plan,
        sourceAgent: sourceAgent ? toSourceAgentSummary(sourceAgent) : null,
        sourceRuntime: sourceRuntime ? toRuntimeSummary(sourceRuntime) : null,
        targetDevice: toDeviceSummary(targetDevice),
        targetRuntime: targetRuntime ? toRuntimeSummary(targetRuntime) : null,
      });
      return;
    }

    next();
  };
}

async function requireSession(
  request: IncomingMessage,
  response: ServerResponse,
  options: AgentMigrationHttpApiHandlerOptions,
): Promise<AuthSessionContext | null> {
  const session = await options.requireUserSession(request);
  if (!session) {
    sendJson(response, 401, { error: "unauthorized" });
    return null;
  }
  return session;
}

function ensureOrganizationMember(
  response: ServerResponse,
  session: AuthSessionContext,
  organizationId: string,
): boolean {
  if (!organizationId) {
    sendJson(response, 400, { error: "organization_id_required" });
    return false;
  }
  if (!session.organizations.some((organization) => organization.organizationId === organizationId)) {
    sendJson(response, 403, { error: "forbidden" });
    return false;
  }
  return true;
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

function readString(body: unknown, key: string): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(body: unknown, key: string): string[] {
  if (!body || typeof body !== "object") return [];
  const value = (body as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDeviceSummary(device: RuntimeDevice) {
  return {
    id: device.id,
    name: device.name,
    status: device.status,
  };
}

function toRuntimeSummary(runtime: LorumeRuntime) {
  return {
    deviceId: runtime.deviceId,
    id: runtime.id,
    kind: runtime.kind,
    name: runtime.name,
    status: runtime.status,
  };
}

function toSourceAgentSummary(agent: ManagedRuntimeAgent) {
  return {
    id: agent.id,
    name: agent.name,
    runtimeId: agent.runtimeId,
    status: agent.status,
  };
}

function normalizeRuntimeKind(runtimeKind: string): string {
  return describeMigrationCapability(runtimeKind).runtimeKind;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}
