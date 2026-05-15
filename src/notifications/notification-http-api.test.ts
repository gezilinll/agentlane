import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthSessionContext } from "../auth/auth-store";
import type { NotificationDeliveryRow, NotificationStore, NotificationThreadRow } from "./notification-store";
import { createNotificationHttpApiHandler } from "./notification-http-api";

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
});

describe("notification HTTP API", () => {
  it("lists current-user notification threads and exposes thread deliveries", async () => {
    const thread = createThread({ id: "nthr_1", organizationId: "org_1" });
    const delivery = createDelivery({ id: "ndlv_1", threadId: thread.id, recipientUserId: "user_1" });
    const calls: unknown[] = [];
    const api = await startApi({
      notificationStore: {
        listThreads: async (input: Parameters<NotificationStore["listThreads"]>[0]) => {
          calls.push(input);
          return [thread];
        },
        readThread: async ({ threadId }: Parameters<NotificationStore["readThread"]>[0]) => (
          threadId === thread.id ? thread : null
        ),
        listDeliveries: async ({ threadId }: Parameters<NotificationStore["listDeliveries"]>[0]) => (
          threadId === thread.id ? [delivery] : []
        ),
      } as unknown as NotificationStore,
      session: createSession(),
    });

    const listResponse = await fetch(`${api.url}/api/notifications?organizationId=org_1`);
    const detailResponse = await fetch(`${api.url}/api/notifications/nthr_1`);
    const forbiddenResponse = await fetch(`${api.url}/api/notifications?organizationId=org_2`);

    await expect(listResponse.json()).resolves.toMatchObject({
      threads: [expect.objectContaining({ id: "nthr_1", title: "Skill 发布完成" })],
    });
    await expect(detailResponse.json()).resolves.toMatchObject({
      deliveries: [expect.objectContaining({ id: "ndlv_1", channel: "in_app" })],
      thread: expect.objectContaining({ id: "nthr_1" }),
    });
    await expect(forbiddenResponse.json()).resolves.toMatchObject({ error: "forbidden" });
    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(forbiddenResponse.status).toBe(403);
    expect(calls).toEqual([
      expect.objectContaining({ organizationId: "org_1", recipientUserId: "user_1" }),
      expect.objectContaining({ organizationId: "org_1", recipientUserId: "user_1" }),
    ]);
  });
});

function createThread(overrides: Partial<NotificationThreadRow> = {}): NotificationThreadRow {
  const now = new Date("2026-05-14T10:00:00.000Z");
  return {
    cooldownUntil: null,
    createdAt: now,
    dedupeKey: "skill:skill_1:published",
    eventType: "skill_publish_succeeded",
    firstOccurredAt: now,
    id: "nthr_default",
    lastOccurredAt: now,
    latestSummary: "Skill 已发布。",
    occurrenceCount: 1,
    organizationId: "org_1",
    resolvedAt: null,
    resourceId: "skill_1",
    resourceType: "skill",
    severity: "info",
    status: "open",
    title: "Skill 发布完成",
    updatedAt: now,
    ...overrides,
  };
}

function createDelivery(overrides: Partial<NotificationDeliveryRow> = {}): NotificationDeliveryRow {
  const now = new Date("2026-05-14T10:00:00.000Z");
  return {
    channel: "in_app",
    createdAt: now,
    errorSummary: null,
    eventId: "nevt_1",
    id: "ndlv_default",
    recipientAddress: "owner@example.com",
    recipientUserId: "user_1",
    sentAt: now,
    skipReason: null,
    status: "sent",
    threadId: "nthr_default",
    updatedAt: now,
    ...overrides,
  };
}

function createSession(): AuthSessionContext {
  const now = new Date("2026-05-14T10:00:00.000Z");
  return {
    id: "session_1",
    organizations: [{
      id: "membership_1",
      name: "Lorume Team",
      organizationId: "org_1",
      role: "owner",
      slug: "lorume-team",
    }],
    user: {
      createdAt: now,
      displayName: null,
      email: "owner@example.com",
      id: "user_1",
      updatedAt: now,
    },
  };
}

async function startApi(options: { notificationStore: NotificationStore; session: AuthSessionContext | null }) {
  const handler = createNotificationHttpApiHandler({
    notificationStore: options.notificationStore,
    requireUserSession: async () => options.session,
  });
  const server = createServer((request, response) => {
    void handler(request, response, () => {
      response.statusCode = 404;
      response.end("not found");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const api = {
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    url: `http://127.0.0.1:${address.port}`,
  };
  servers.push(api);
  return api;
}
