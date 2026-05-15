import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthSessionContext } from "../auth/auth-store";
import type { ListOperationsInput, OperationStatus, OperationStore } from "./operation-store";

const operationStatuses: OperationStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "unsupported",
  "requires_manual_step",
  "cancelled",
];

/** Auth guard required by Operation HTTP APIs. */
export interface OperationHttpAuth {
  /** Return the signed-in user session, or `null` when unauthorized. */
  requireUserSession: (request: IncomingMessage) => Promise<AuthSessionContext | null>;
}

/** Dependencies for the Operation HTTP API. */
export interface OperationHttpApiHandlerOptions {
  /** Operation repository. */
  operationStore: OperationStore;
  /** User-session auth guard. */
  requireUserSession: OperationHttpAuth["requireUserSession"];
}

/** Operation API middleware compatible with the backend API chain. */
export type OperationHttpApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => Promise<void>;

/** Create user-visible Operation query routes. */
export function createOperationHttpApiHandler(options: OperationHttpApiHandlerOptions): OperationHttpApiHandler {
  return async function operationHttpApiHandler(request, response, next) {
    const requestUrl = new URL(request.url || "/", "http://lorume.local");

    if (request.method === "GET" && requestUrl.pathname === "/api/operations") {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const organizationId = requestUrl.searchParams.get("organizationId") ?? "";
      if (!ensureOrganizationMember(response, session, organizationId)) return;
      const rawStatus = (requestUrl.searchParams.get("status") ?? "").trim();
      const status = normalizeStatus(rawStatus);
      if (rawStatus && !status) {
        sendJson(response, 400, { error: "operation_status_invalid" });
        return;
      }
      const input: ListOperationsInput = {
        limit: readLimit(requestUrl),
        organizationId,
        resourceId: readParam(requestUrl, "resourceId"),
        resourceType: readParam(requestUrl, "resourceType"),
        status: status ?? undefined,
        targetId: readParam(requestUrl, "targetId"),
        targetType: readParam(requestUrl, "targetType"),
      };
      const operations = await options.operationStore.listOperations(input);
      sendJson(response, 200, { operations });
      return;
    }

    const detailMatch = requestUrl.pathname.match(/^\/api\/operations\/([^/]+)$/);
    if (request.method === "GET" && detailMatch) {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const operationId = decodeURIComponent(detailMatch[1] ?? "");
      const operation = await options.operationStore.readOperation({ operationId });
      if (!operation) {
        sendJson(response, 404, { error: "operation_not_found" });
        return;
      }
      if (!ensureOrganizationMember(response, session, operation.organizationId)) return;
      const jobs = await options.operationStore.listJobs({ operationId: operation.id, limit: readLimit(requestUrl) });
      sendJson(response, 200, { jobs, operation });
      return;
    }

    next();
  };
}

async function requireSession(
  request: IncomingMessage,
  response: ServerResponse,
  options: OperationHttpApiHandlerOptions,
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

function normalizeStatus(value: string): OperationStatus | null {
  if (!value) return null;
  return operationStatuses.includes(value as OperationStatus) ? value as OperationStatus : null;
}

function readParam(requestUrl: URL, key: string): string | undefined {
  const value = requestUrl.searchParams.get(key)?.trim();
  return value || undefined;
}

function readLimit(requestUrl: URL): number | undefined {
  const rawLimit = requestUrl.searchParams.get("limit");
  if (!rawLimit) return undefined;
  const limit = Number(rawLimit);
  return Number.isFinite(limit) ? limit : undefined;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}
