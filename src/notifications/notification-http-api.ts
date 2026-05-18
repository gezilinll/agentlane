import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthSessionContext } from "../auth/auth-store";
import type { NotificationStore } from "./notification-store";

/** Auth guard required by Notification HTTP APIs. */
export interface NotificationHttpAuth {
  /** Return the signed-in user session, or `null` when unauthorized. */
  requireUserSession: (request: IncomingMessage) => Promise<AuthSessionContext | null>;
}

/** Dependencies for the Notification HTTP API. */
export interface NotificationHttpApiHandlerOptions {
  /** Notification repository. */
  notificationStore: NotificationStore;
  /** User-session auth guard. */
  requireUserSession: NotificationHttpAuth["requireUserSession"];
}

/** Notification API middleware compatible with the backend API chain. */
export type NotificationHttpApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => Promise<void>;

/** Create in-app notification query routes. */
export function createNotificationHttpApiHandler(options: NotificationHttpApiHandlerOptions): NotificationHttpApiHandler {
  return async function notificationHttpApiHandler(request, response, next) {
    const requestUrl = new URL(request.url || "/", "http://lorume.local");

    if (request.method === "GET" && requestUrl.pathname === "/api/notifications") {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const organizationId = requestUrl.searchParams.get("organizationId") ?? "";
      if (!ensureOrganizationMember(response, session, organizationId)) return;
      const threads = await options.notificationStore.listThreads({
        organizationId,
        recipientUserId: session.user.id,
      });
      sendJson(response, 200, { threads });
      return;
    }

    const readMatch = requestUrl.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (request.method === "POST" && readMatch) {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const threadId = decodeURIComponent(readMatch[1] ?? "");
      const thread = await options.notificationStore.readThread({ threadId });
      if (!thread) {
        sendJson(response, 404, { error: "notification_thread_not_found" });
        return;
      }
      if (!ensureOrganizationMember(response, session, thread.organizationId)) return;
      const visibleThreads = await options.notificationStore.listThreads({
        organizationId: thread.organizationId,
        recipientUserId: session.user.id,
      });
      if (!visibleThreads.some((visibleThread) => visibleThread.id === thread.id)) {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }
      const updatedThread = await options.notificationStore.markThreadRead({
        recipientUserId: session.user.id,
        threadId,
      });
      sendJson(response, 200, { thread: updatedThread ?? thread });
      return;
    }

    const detailMatch = requestUrl.pathname.match(/^\/api\/notifications\/([^/]+)$/);
    if (request.method === "GET" && detailMatch) {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const threadId = decodeURIComponent(detailMatch[1] ?? "");
      const thread = await options.notificationStore.readThread({ threadId });
      if (!thread) {
        sendJson(response, 404, { error: "notification_thread_not_found" });
        return;
      }
      if (!ensureOrganizationMember(response, session, thread.organizationId)) return;
      const visibleThreads = await options.notificationStore.listThreads({
        organizationId: thread.organizationId,
        recipientUserId: session.user.id,
      });
      if (!visibleThreads.some((visibleThread) => visibleThread.id === thread.id)) {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }
      const deliveries = await options.notificationStore.listDeliveries({ threadId });
      sendJson(response, 200, { deliveries, thread });
      return;
    }

    next();
  };
}

async function requireSession(
  request: IncomingMessage,
  response: ServerResponse,
  options: NotificationHttpApiHandlerOptions,
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

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}
