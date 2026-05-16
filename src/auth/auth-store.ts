import pg from "pg";
import { randomUUID } from "node:crypto";

const { Pool } = pg;

/** Organization member role supported by the first Lorume auth layer. */
export type AuthMemberRole = "owner" | "admin" | "member";

/** Persisted email-code login challenge. */
export interface AuthLoginCode {
  attempts: number;
  codeHash: string;
  consumedAt?: Date | null;
  createdAt: Date;
  email: string;
  expiresAt: Date;
  id: string;
}

/** Lorume user identity. */
export interface AuthUser {
  createdAt: Date;
  displayName?: string | null;
  email: string;
  id: string;
  updatedAt: Date;
}

/** Organization summary visible to a signed-in user. */
export interface AuthOrganizationMembership {
  id: string;
  name: string;
  organizationId: string;
  role: AuthMemberRole;
  slug: string;
}

/** Current session context returned by `/api/me`. */
export interface AuthSessionContext {
  id: string;
  organizations: AuthOrganizationMembership[];
  user: AuthUser;
}

/** Created organization row. */
export interface AuthOrganization {
  createdByUserId: string;
  id: string;
  name: string;
  slug: string;
}

/** Device token verification result. */
export interface AuthDeviceTokenVerification {
  deviceId?: string | null;
  id: string;
  organizationId: string;
  tokenPrefix: string;
}

/** Repository contract used by auth HTTP handlers. */
export interface AuthStore {
  createLoginCode: (input: { codeHash: string; email: string; expiresAt: Date }) => Promise<AuthLoginCode>;
  consumeLoginCode: (input: { codeHash: string; email: string; now: Date }) => Promise<AuthLoginCode | null>;
  upsertUserForEmail: (email: string) => Promise<AuthUser>;
  createSession: (input: { expiresAt: Date; sessionHash: string; userId: string }) => Promise<{ id: string }>;
  readSessionByHash: (sessionHash: string, now: Date) => Promise<AuthSessionContext | null>;
  revokeSession: (sessionHash: string) => Promise<void>;
  createOrganization: (input: { createdByUserId: string; name: string; slug: string }) => Promise<AuthOrganization>;
  listOrganizationsForUser: (userId: string) => Promise<AuthOrganizationMembership[]>;
  /** Returns active organization owners and admins for infrastructure notifications and admin-only actions. */
  listOrganizationAdminUserIds: (organizationId: string) => Promise<string[]>;
  createInvitation: (input: {
    email: string;
    expiresAt: Date;
    invitedByUserId: string;
    organizationId: string;
    role: AuthMemberRole;
    tokenHash: string;
  }) => Promise<{ email: string; id: string; organizationId: string; role: AuthMemberRole }>;
  acceptInvitation: (input: {
    email: string;
    now: Date;
    tokenHash: string;
    userId: string;
  }) => Promise<AuthOrganizationMembership | null>;
  createDeviceToken: (input: {
    deviceId?: string | null;
    expiresAt?: Date | null;
    name: string;
    organizationId: string;
    tokenHash: string;
    tokenPrefix: string;
  }) => Promise<AuthDeviceTokenVerification>;
  verifyDeviceToken: (tokenHash: string, now: Date) => Promise<AuthDeviceTokenVerification | null>;
  close: () => Promise<void>;
}

/** Postgres auth store options. */
export interface PostgresAuthStoreOptions {
  connectionString?: string;
}

/** Create the Postgres-backed auth repository. */
export function createPostgresAuthStore(options: PostgresAuthStoreOptions = {}): AuthStore {
  const pool = new Pool({
    connectionString: options.connectionString ?? process.env.DATABASE_URL ?? "postgres://lorume:lorume@127.0.0.1:54329/lorume",
  });

  return {
    async createLoginCode(input) {
      const result = await pool.query<AuthLoginCode>(`
        INSERT INTO email_login_codes (id, email, code_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          email,
          code_hash AS "codeHash",
          consumed_at AS "consumedAt",
          attempts,
          created_at AS "createdAt",
          expires_at AS "expiresAt"
      `, [createId("code"), normalizeEmail(input.email), input.codeHash, input.expiresAt]);
      return result.rows[0];
    },
    async consumeLoginCode(input) {
      const result = await pool.query<AuthLoginCode>(`
        UPDATE email_login_codes
        SET consumed_at = $4
        WHERE id = (
          SELECT id
          FROM email_login_codes
          WHERE email = $1
            AND code_hash = $2
            AND consumed_at IS NULL
            AND expires_at > $3
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        )
        RETURNING
          id,
          email,
          code_hash AS "codeHash",
          consumed_at AS "consumedAt",
          attempts,
          created_at AS "createdAt",
          expires_at AS "expiresAt"
      `, [normalizeEmail(input.email), input.codeHash, input.now, input.now]);
      return result.rows[0] ?? null;
    },
    async upsertUserForEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      const result = await pool.query<AuthUser>(`
        INSERT INTO users (id, email)
        VALUES ($1, $2)
        ON CONFLICT (email) DO UPDATE SET updated_at = now()
        RETURNING
          id,
          email,
          display_name AS "displayName",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `, [createId("usr"), normalizedEmail]);
      return result.rows[0];
    },
    async createSession(input) {
      const result = await pool.query<{ id: string }>(`
        INSERT INTO sessions (id, user_id, session_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [createId("ses"), input.userId, input.sessionHash, input.expiresAt]);
      return result.rows[0];
    },
    async readSessionByHash(sessionHash, now) {
      const result = await pool.query<{
        displayName: string | null;
        email: string;
        id: string;
        sessionId: string;
        userCreatedAt: Date;
        userUpdatedAt: Date;
      }>(`
        SELECT
          s.id AS "sessionId",
          u.id,
          u.email,
          u.display_name AS "displayName",
          u.created_at AS "userCreatedAt",
          u.updated_at AS "userUpdatedAt"
        FROM sessions s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.session_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > $2
        LIMIT 1
      `, [sessionHash, now]);
      const row = result.rows[0];
      if (!row) return null;
      await pool.query("UPDATE sessions SET last_seen_at = $2 WHERE id = $1", [row.sessionId, now]);
      const user = {
        createdAt: row.userCreatedAt,
        displayName: row.displayName,
        email: row.email,
        id: row.id,
        updatedAt: row.userUpdatedAt,
      };
      return {
        id: row.sessionId,
        organizations: await listOrganizationsForUser(pool, user.id),
        user,
      };
    },
    async revokeSession(sessionHash) {
      await pool.query("UPDATE sessions SET revoked_at = now() WHERE session_hash = $1", [sessionHash]);
    },
    async createOrganization(input) {
      return withTransaction(pool, async (client) => {
        const organizationResult = await client.query<AuthOrganization>(`
          INSERT INTO organizations (id, name, slug, created_by_user_id)
          VALUES ($1, $2, $3, $4)
          RETURNING id, name, slug, created_by_user_id AS "createdByUserId"
        `, [createId("org"), input.name.trim(), input.slug.trim(), input.createdByUserId]);
        const organization = organizationResult.rows[0];
        await client.query(`
          INSERT INTO organization_members (id, organization_id, user_id, role, status)
          VALUES ($1, $2, $3, 'owner', 'active')
          ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', status = 'active'
        `, [createId("mem"), organization.id, input.createdByUserId]);
        return organization;
      });
    },
    listOrganizationsForUser(userId) {
      return listOrganizationsForUser(pool, userId);
    },
    async listOrganizationAdminUserIds(organizationId) {
      const result = await pool.query<{ userId: string }>(`
        SELECT user_id AS "userId"
        FROM organization_members
        WHERE organization_id = $1
          AND status = 'active'
          AND role IN ('owner', 'admin')
        ORDER BY updated_at ASC, id ASC
      `, [organizationId]);
      return result.rows.map((row) => row.userId);
    },
    async createInvitation(input) {
      const result = await pool.query<{
        email: string;
        id: string;
        organizationId: string;
        role: AuthMemberRole;
      }>(`
        INSERT INTO organization_invitations (
          id, organization_id, email, role, token_hash, invited_by_user_id, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, organization_id AS "organizationId", email, role
      `, [
        createId("inv"),
        input.organizationId,
        normalizeEmail(input.email),
        input.role,
        input.tokenHash,
        input.invitedByUserId,
        input.expiresAt,
      ]);
      return result.rows[0];
    },
    async acceptInvitation(input) {
      return withTransaction(pool, async (client) => {
        const invitationResult = await client.query<{
          email: string;
          organizationId: string;
          role: AuthMemberRole;
        }>(`
          UPDATE organization_invitations
          SET accepted_at = $3
          WHERE id = (
            SELECT id
            FROM organization_invitations
            WHERE token_hash = $1
              AND email = $2
              AND accepted_at IS NULL
              AND revoked_at IS NULL
              AND expires_at > $3
            LIMIT 1
            FOR UPDATE
          )
          RETURNING organization_id AS "organizationId", email, role
        `, [input.tokenHash, normalizeEmail(input.email), input.now]);
        const invitation = invitationResult.rows[0];
        if (!invitation) return null;
        await client.query(`
          INSERT INTO organization_members (id, organization_id, user_id, role, status)
          VALUES ($1, $2, $3, $4, 'active')
          ON CONFLICT (organization_id, user_id) DO UPDATE SET role = excluded.role, status = 'active'
        `, [createId("mem"), invitation.organizationId, input.userId, invitation.role]);
        const memberships = await listOrganizationsForUser(client, input.userId);
        return memberships.find((membership) => membership.organizationId === invitation.organizationId) ?? null;
      });
    },
    async createDeviceToken(input) {
      const result = await pool.query<AuthDeviceTokenVerification>(`
        INSERT INTO device_tokens (
          id, organization_id, device_id, name, token_hash, token_prefix, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id,
          organization_id AS "organizationId",
          device_id AS "deviceId",
          token_prefix AS "tokenPrefix"
      `, [
        createId("devtok"),
        input.organizationId,
        input.deviceId ?? null,
        input.name,
        input.tokenHash,
        input.tokenPrefix,
        input.expiresAt ?? null,
      ]);
      return result.rows[0];
    },
    async verifyDeviceToken(tokenHash, now) {
      const result = await pool.query<AuthDeviceTokenVerification>(`
        UPDATE device_tokens
        SET last_used_at = $2
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > $2)
        RETURNING
          id,
          organization_id AS "organizationId",
          device_id AS "deviceId",
          token_prefix AS "tokenPrefix"
      `, [tokenHash, now]);
      return result.rows[0] ?? null;
    },
    close() {
      return pool.end();
    },
  };
}

async function listOrganizationsForUser(
  client: Pick<pg.Pool | pg.PoolClient, "query">,
  userId: string,
): Promise<AuthOrganizationMembership[]> {
  const result = await client.query<AuthOrganizationMembership>(`
    SELECT
      m.id,
      m.organization_id AS "organizationId",
      o.name,
      o.slug,
      m.role
    FROM organization_members m
    INNER JOIN organizations o ON o.id = m.organization_id
    WHERE m.user_id = $1
      AND m.status = 'active'
    ORDER BY o.name
  `, [userId]);
  return result.rows;
}

async function withTransaction<T>(
  pool: InstanceType<typeof Pool>,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
