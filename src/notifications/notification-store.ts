import { randomUUID } from "node:crypto";
import pg, { type PoolClient } from "pg";

const { Pool } = pg;

/** Notification severity. */
export type NotificationSeverity = "info" | "warning" | "critical";

/** Notification source module. */
export type NotificationSourceModule = "runtime" | "auth" | "system";

/** Notification thread lifecycle status. */
export type NotificationThreadStatus = "open" | "resolved" | "muted";

/** Notification delivery channel. */
export type NotificationDeliveryChannel = "in_app" | "email";

/** Notification delivery status. */
export type NotificationDeliveryStatus = "pending" | "sent" | "failed" | "skipped";

/** Persisted notification event. */
export interface NotificationEventRow {
  id: string;
  organizationId: string;
  operationId?: string | null;
  eventType: string;
  severity: NotificationSeverity;
  sourceModule: NotificationSourceModule;
  resourceType?: string | null;
  resourceId?: string | null;
  actorUserId?: string | null;
  recipientUserIds: string[];
  title: string;
  summary: string;
  dedupeKey: string;
  createdAt: Date;
}

/** Persisted notification thread. */
export interface NotificationThreadRow {
  id: string;
  organizationId: string;
  dedupeKey: string;
  status: NotificationThreadStatus;
  severity: NotificationSeverity;
  eventType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  title: string;
  latestSummary: string;
  occurrenceCount: number;
  firstOccurredAt: Date;
  lastOccurredAt: Date;
  isRead: boolean;
  readAt?: Date | null;
  resolvedAt?: Date | null;
  cooldownUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Persisted notification delivery. */
export interface NotificationDeliveryRow {
  id: string;
  threadId: string;
  eventId: string;
  channel: NotificationDeliveryChannel;
  recipientUserId?: string | null;
  recipientAddress?: string | null;
  status: NotificationDeliveryStatus;
  skipReason?: string | null;
  sentAt?: Date | null;
  readAt?: Date | null;
  errorSummary?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Create notification event input. */
export interface CreateNotificationEventInput {
  organizationId: string;
  operationId?: string | null;
  eventType: string;
  severity: NotificationSeverity;
  sourceModule: NotificationSourceModule;
  resourceType?: string | null;
  resourceId?: string | null;
  actorUserId?: string | null;
  recipientUserIds: string[];
  title: string;
  summary: string;
  dedupeKey: string;
  createdAt?: Date;
  emailCooldownMs?: number;
}

/** Result of creating a notification event. */
export interface CreateNotificationEventResult {
  event: NotificationEventRow;
  thread: NotificationThreadRow;
  deliveries: NotificationDeliveryRow[];
}

/** Notification repository. */
export interface NotificationStore {
  createNotificationEvent: (input: CreateNotificationEventInput) => Promise<CreateNotificationEventResult>;
  listThreads: (input: { organizationId: string; recipientUserId?: string }) => Promise<NotificationThreadRow[]>;
  readThread: (input: { threadId: string }) => Promise<NotificationThreadRow | null>;
  markThreadRead: (input: { recipientUserId: string; threadId: string }) => Promise<NotificationThreadRow | null>;
  listDeliveries: (input: { threadId: string }) => Promise<NotificationDeliveryRow[]>;
  close: () => Promise<void>;
}

/** Postgres notification store options. */
export interface PostgresNotificationStoreOptions {
  connectionString?: string;
}

/** Create a Postgres-backed notification store. */
export function createPostgresNotificationStore(options: PostgresNotificationStoreOptions = {}): NotificationStore {
  const pool = new Pool({
    connectionString: options.connectionString ?? process.env.DATABASE_URL ?? "postgres://lorume:lorume@127.0.0.1:54329/lorume",
  });

  return {
    async createNotificationEvent(input) {
      return withTransaction(pool, async (client) => {
        const createdAt = input.createdAt ?? new Date();
        const eventResult = await client.query<NotificationEventRow>(`
          INSERT INTO notification_events (
            id,
            organization_id,
            operation_id,
            event_type,
            severity,
            source_module,
            resource_type,
            resource_id,
            actor_user_id,
            recipient_user_ids,
            title,
            summary,
            dedupe_key,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING ${eventColumns}
        `, [
          createId("nevt"),
          input.organizationId,
          input.operationId ?? null,
          input.eventType,
          input.severity,
          input.sourceModule,
          input.resourceType ?? null,
          input.resourceId ?? null,
          input.actorUserId ?? null,
          input.recipientUserIds,
          sanitizeText(input.title),
          sanitizeText(input.summary),
          input.dedupeKey,
          createdAt,
        ]);
        const event = eventResult.rows[0];
        const previousThread = await readThreadByDedupeKey(client, input.organizationId, input.dedupeKey);
        const thread = previousThread
          ? await updateThread(client, previousThread.id, input, createdAt)
          : await insertThread(client, input, createdAt);
        const deliveries = [];
        for (const recipientUserId of input.recipientUserIds) {
          deliveries.push(await insertDelivery(client, {
            channel: "in_app",
            eventId: event.id,
            recipientUserId,
            status: "sent",
            threadId: thread.id,
          }));
        }
        if (shouldAttemptEmail(input.severity)) {
          const inCooldown = previousThread?.cooldownUntil && previousThread.cooldownUntil > createdAt;
          for (const recipientUserId of input.recipientUserIds) {
            deliveries.push(await insertDelivery(client, {
              channel: "email",
              eventId: event.id,
              recipientUserId,
              skipReason: inCooldown ? "cooldown" : null,
              status: inCooldown ? "skipped" : "pending",
              threadId: thread.id,
            }));
          }
          if (!inCooldown && input.emailCooldownMs) {
            await client.query(`
              UPDATE notification_threads
              SET cooldown_until = $2, updated_at = $3
              WHERE id = $1
            `, [thread.id, new Date(createdAt.getTime() + input.emailCooldownMs), createdAt]);
          }
        }
        return {
          deliveries,
          event,
          thread: await readThreadById(client, thread.id) ?? thread,
        };
      });
    },
    async listThreads(input) {
      const params: unknown[] = [input.organizationId];
      const recipientFilter = input.recipientUserId
        ? `AND EXISTS (
          SELECT 1
          FROM notification_deliveries nd
          WHERE nd.thread_id = nt.id
            AND nd.recipient_user_id = $2
            AND nd.channel = 'in_app'
        )`
        : "";
      if (input.recipientUserId) params.push(input.recipientUserId);
      const result = await pool.query<NotificationThreadRow>(`
        SELECT ${threadColumns("nt", input.recipientUserId ? 2 : undefined)}
        FROM notification_threads nt
        WHERE nt.organization_id = $1
          ${recipientFilter}
        ORDER BY nt.last_occurred_at DESC
      `, params);
      return result.rows;
    },
    readThread(input) {
      return readThreadById(pool, input.threadId);
    },
    async markThreadRead(input) {
      await pool.query(`
        UPDATE notification_deliveries
        SET read_at = COALESCE(read_at, now()), updated_at = now()
        WHERE thread_id = $1
          AND recipient_user_id = $2
          AND channel = 'in_app'
      `, [input.threadId, input.recipientUserId]);
      return readThreadByIdForRecipient(pool, input.threadId, input.recipientUserId);
    },
    async listDeliveries(input) {
      const result = await pool.query<NotificationDeliveryRow>(`
        SELECT ${deliveryColumns}
        FROM notification_deliveries
        WHERE thread_id = $1
        ORDER BY created_at ASC
      `, [input.threadId]);
      return result.rows;
    },
    close() {
      return pool.end();
    },
  };
}

const eventColumns = `
  id,
  organization_id AS "organizationId",
  operation_id AS "operationId",
  event_type AS "eventType",
  severity,
  source_module AS "sourceModule",
  resource_type AS "resourceType",
  resource_id AS "resourceId",
  actor_user_id AS "actorUserId",
  recipient_user_ids AS "recipientUserIds",
  title,
  summary,
  dedupe_key AS "dedupeKey",
  created_at AS "createdAt"
`;

function threadColumns(alias = "notification_threads", recipientParamIndex?: number): string {
  const readAtExpression = recipientParamIndex
    ? `(SELECT max(nd.read_at) FROM notification_deliveries nd WHERE nd.thread_id = ${alias}.id AND nd.recipient_user_id = $${recipientParamIndex} AND nd.channel = 'in_app')`
    : "NULL::timestamptz";
  const isReadExpression = recipientParamIndex
    ? `COALESCE((SELECT bool_and(nd.read_at IS NOT NULL) FROM notification_deliveries nd WHERE nd.thread_id = ${alias}.id AND nd.recipient_user_id = $${recipientParamIndex} AND nd.channel = 'in_app'), false)`
    : "false";
  return `
    ${alias}.id,
    ${alias}.organization_id AS "organizationId",
    ${alias}.dedupe_key AS "dedupeKey",
    ${alias}.status,
    ${alias}.severity,
    ${alias}.event_type AS "eventType",
    ${alias}.resource_type AS "resourceType",
    ${alias}.resource_id AS "resourceId",
    ${alias}.title,
    ${alias}.latest_summary AS "latestSummary",
    ${alias}.occurrence_count AS "occurrenceCount",
    ${alias}.first_occurred_at AS "firstOccurredAt",
    ${alias}.last_occurred_at AS "lastOccurredAt",
    ${isReadExpression} AS "isRead",
    ${readAtExpression} AS "readAt",
    ${alias}.resolved_at AS "resolvedAt",
    ${alias}.cooldown_until AS "cooldownUntil",
    ${alias}.created_at AS "createdAt",
    ${alias}.updated_at AS "updatedAt"
  `;
}

const deliveryColumns = `
  id,
  thread_id AS "threadId",
  event_id AS "eventId",
  channel,
  recipient_user_id AS "recipientUserId",
  recipient_address AS "recipientAddress",
  status,
  skip_reason AS "skipReason",
  sent_at AS "sentAt",
  read_at AS "readAt",
  error_summary AS "errorSummary",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

async function readThreadByDedupeKey(
  client: PoolClient,
  organizationId: string,
  dedupeKey: string,
): Promise<NotificationThreadRow | null> {
  const result = await client.query<NotificationThreadRow>(`
    SELECT ${threadColumns()}
    FROM notification_threads
    WHERE organization_id = $1
      AND dedupe_key = $2
    LIMIT 1
    FOR UPDATE
  `, [organizationId, dedupeKey]);
  return result.rows[0] ?? null;
}

async function readThreadById(client: PoolClient | pg.Pool, threadId: string): Promise<NotificationThreadRow | null> {
  const result = await client.query<NotificationThreadRow>(`
    SELECT ${threadColumns()}
    FROM notification_threads
    WHERE id = $1
    LIMIT 1
  `, [threadId]);
  return result.rows[0] ?? null;
}

async function readThreadByIdForRecipient(
  client: PoolClient | pg.Pool,
  threadId: string,
  recipientUserId: string,
): Promise<NotificationThreadRow | null> {
  const result = await client.query<NotificationThreadRow>(`
    SELECT ${threadColumns("notification_threads", 2)}
    FROM notification_threads
    WHERE id = $1
    LIMIT 1
  `, [threadId, recipientUserId]);
  return result.rows[0] ?? null;
}

async function insertThread(
  client: PoolClient,
  input: CreateNotificationEventInput,
  createdAt: Date,
): Promise<NotificationThreadRow> {
  const result = await client.query<NotificationThreadRow>(`
    INSERT INTO notification_threads (
      id,
      organization_id,
      dedupe_key,
      severity,
      event_type,
      resource_type,
      resource_id,
      title,
      latest_summary,
      first_occurred_at,
      last_occurred_at,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $10, $10)
    RETURNING ${threadColumns()}
  `, [
    createId("nthr"),
    input.organizationId,
    input.dedupeKey,
    input.severity,
    input.eventType,
    input.resourceType ?? null,
    input.resourceId ?? null,
    sanitizeText(input.title),
    sanitizeText(input.summary),
    createdAt,
  ]);
  return result.rows[0];
}

async function updateThread(
  client: PoolClient,
  threadId: string,
  input: CreateNotificationEventInput,
  createdAt: Date,
): Promise<NotificationThreadRow> {
  const result = await client.query<NotificationThreadRow>(`
    UPDATE notification_threads
    SET
      status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END,
      severity = $2,
      event_type = $3,
      title = $4,
      latest_summary = $5,
      occurrence_count = occurrence_count + 1,
      last_occurred_at = $6,
      updated_at = $6
    WHERE id = $1
    RETURNING ${threadColumns()}
  `, [
    threadId,
    input.severity,
    input.eventType,
    sanitizeText(input.title),
    sanitizeText(input.summary),
    createdAt,
  ]);
  return result.rows[0];
}

async function insertDelivery(
  client: PoolClient,
  input: {
    channel: NotificationDeliveryChannel;
    eventId: string;
    recipientUserId: string;
    skipReason?: string | null;
    status: NotificationDeliveryStatus;
    threadId: string;
  },
): Promise<NotificationDeliveryRow> {
  const result = await client.query<NotificationDeliveryRow>(`
    INSERT INTO notification_deliveries (
      id,
      thread_id,
      event_id,
      channel,
      recipient_user_id,
      recipient_address,
      status,
      skip_reason,
      sent_at
    )
    SELECT $1, $2, $3, $4, $5, u.email, $6, $7, CASE WHEN $6 = 'sent' THEN now() ELSE NULL END
    FROM users u
    WHERE u.id = $5
    RETURNING ${deliveryColumns}
  `, [
    createId("ndlv"),
    input.threadId,
    input.eventId,
    input.channel,
    input.recipientUserId,
    input.status,
    input.skipReason ?? null,
  ]);
  return result.rows[0];
}

async function withTransaction<T>(pool: pg.Pool, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function shouldAttemptEmail(severity: NotificationSeverity): boolean {
  return severity === "warning" || severity === "critical";
}

function sanitizeText(value: string): string {
  return value.trim().slice(0, 500);
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
