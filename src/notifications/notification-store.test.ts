import { describe, expect, it } from "vitest";
import { createPostgresAuthStore } from "../auth/auth-store";
import {
  createTemporaryPostgresDatabase,
  runMigrationsScript,
  shouldRunPostgresTests,
} from "../test/postgres";
import { createPostgresNotificationStore } from "./notification-store";

const describeDb = shouldRunPostgresTests() ? describe : describe.skip;

describeDb("Postgres notification store", () => {
  it("aggregates duplicate events and always records in-app delivery", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const notificationStore = createPostgresNotificationStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("notify-owner@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Notify Team",
          slug: "notify-team",
        });

        await notificationStore.createNotificationEvent({
          actorUserId: user.id,
          dedupeKey: "skill:skill_1:sync_failed",
          eventType: "skill_sync_failed",
          organizationId: organization.id,
          recipientUserIds: [user.id],
          resourceId: "skill_1",
          resourceType: "skill",
          severity: "warning",
          sourceModule: "skill",
          summary: "Agent target rejected Skill sync.",
          title: "Skill 下发失败",
        });
        const second = await notificationStore.createNotificationEvent({
          actorUserId: user.id,
          dedupeKey: "skill:skill_1:sync_failed",
          eventType: "skill_sync_failed",
          organizationId: organization.id,
          recipientUserIds: [user.id],
          resourceId: "skill_1",
          resourceType: "skill",
          severity: "warning",
          sourceModule: "skill",
          summary: "Agent target still rejects Skill sync.",
          title: "Skill 下发失败",
        });

        const threads = await notificationStore.listThreads({
          organizationId: organization.id,
          recipientUserId: user.id,
        });
        const deliveries = await notificationStore.listDeliveries({
          threadId: second.thread.id,
        });

        expect(threads).toEqual([
          expect.objectContaining({
            dedupeKey: "skill:skill_1:sync_failed",
            latestSummary: "Agent target still rejects Skill sync.",
            occurrenceCount: 2,
          }),
        ]);
        expect(deliveries.filter((delivery) => delivery.channel === "in_app")).toHaveLength(2);
      } finally {
        await Promise.all([authStore.close(), notificationStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });

  it("rate limits duplicate email deliveries by thread cooldown", async () => {
    const database = await createTemporaryPostgresDatabase();
    try {
      runMigrationsScript(database.url);
      const authStore = createPostgresAuthStore({ connectionString: database.url });
      const notificationStore = createPostgresNotificationStore({ connectionString: database.url });
      try {
        const user = await authStore.upsertUserForEmail("notify-email@example.com");
        const organization = await authStore.createOrganization({
          createdByUserId: user.id,
          name: "Notify Email Team",
          slug: "notify-email-team",
        });

        const first = await notificationStore.createNotificationEvent({
          actorUserId: user.id,
          createdAt: new Date("2026-05-14T12:00:00.000Z"),
          dedupeKey: "device:claw:offline",
          emailCooldownMs: 30 * 60 * 1000,
          eventType: "device_offline",
          organizationId: organization.id,
          recipientUserIds: [user.id],
          resourceId: "gezilinll-claw",
          resourceType: "device",
          severity: "critical",
          sourceModule: "runtime",
          summary: "Collector heartbeat timed out.",
          title: "设备离线",
        });
        await notificationStore.createNotificationEvent({
          actorUserId: user.id,
          createdAt: new Date("2026-05-14T12:10:00.000Z"),
          dedupeKey: "device:claw:offline",
          emailCooldownMs: 30 * 60 * 1000,
          eventType: "device_offline",
          organizationId: organization.id,
          recipientUserIds: [user.id],
          resourceId: "gezilinll-claw",
          resourceType: "device",
          severity: "critical",
          sourceModule: "runtime",
          summary: "Collector heartbeat still timed out.",
          title: "设备离线",
        });

        const deliveries = await notificationStore.listDeliveries({ threadId: first.thread.id });

        expect(deliveries.filter((delivery) => delivery.channel === "email" && delivery.status === "pending")).toHaveLength(1);
        expect(deliveries.filter((delivery) => delivery.channel === "email" && delivery.status === "skipped")).toHaveLength(1);
      } finally {
        await Promise.all([authStore.close(), notificationStore.close()]);
      }
    } finally {
      await database.drop();
    }
  });
});
