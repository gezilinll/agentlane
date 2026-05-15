import { createHash, randomUUID } from "node:crypto";
import pg, { type PoolClient } from "pg";
import type { AuthMemberRole } from "../auth/auth-store";

const { Pool } = pg;

/** Resource types that can receive fine-grained Skill governance permissions. */
export type GovernanceResourceType = "skill" | "device" | "runtime" | "agent";

/** Resource permission values used by Skill management. */
export type GovernancePermission =
  | "view"
  | "edit"
  | "publish"
  | "archive"
  | "manage_access"
  | "manage_skills";

/** Skill assignment target type. */
export type SkillAssignmentTargetType = "device" | "runtime" | "agent";

/** Skill assignment lifecycle state. */
export type SkillAssignmentStatus =
  | "pending_review"
  | "approved"
  | "syncing"
  | "synced"
  | "failed"
  | "unsupported"
  | "disabled";

/** Approval action supported by the current Skill governance backend. */
export type ApprovalAction = "publish_skill" | "assign_skill" | "sync_skill" | "archive_skill" | "delete_skill";

/** Approval risk level. */
export type ApprovalRiskLevel = "low" | "medium" | "high" | "blocked";

/** Approval lifecycle status. */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

/** Persisted resource permission row. */
export interface ResourcePermissionRow {
  /** Permission row id. */
  id: string;
  /** Owning organization id. */
  organizationId: string;
  /** Resource type. */
  resourceType: GovernanceResourceType;
  /** Resource id. */
  resourceId: string;
  /** User receiving the permission. */
  subjectUserId: string;
  /** Granted permission. */
  permission: GovernancePermission;
  /** User who granted the permission. */
  grantedByUserId: string;
  /** Creation timestamp. */
  createdAt: Date;
  /** Last update timestamp. */
  updatedAt: Date;
}

/** Persisted approval request row. */
export interface ApprovalRequestRow {
  /** Approval request id. */
  id: string;
  /** Owning organization id. */
  organizationId: string;
  /** Requested action. */
  action: ApprovalAction;
  /** Related Skill id. */
  skillId?: string | null;
  /** Related Skill version id. */
  skillVersionId?: string | null;
  /** Optional target type. */
  targetType?: SkillAssignmentTargetType | null;
  /** Optional target id. */
  targetId?: string | null;
  /** Risk level at request time. */
  riskLevel: ApprovalRiskLevel;
  /** Short risk summary. */
  riskSummary: string;
  /** Optional requester reason. */
  requestedReason?: string | null;
  /** Deterministic action snapshot hash. */
  snapshotHash: string;
  /** Requester user id. */
  requestedByUserId: string;
  /** Minimum organization role required to resolve. */
  requiredRole: "owner" | "admin";
  /** Current approval status. */
  status: ApprovalStatus;
  /** Small non-sensitive action metadata. */
  metadata: Record<string, unknown>;
  /** Resolver user id. */
  resolvedByUserId?: string | null;
  /** Optional resolution reason. */
  resolutionReason?: string | null;
  /** Creation timestamp. */
  createdAt: Date;
  /** Resolution timestamp. */
  resolvedAt?: Date | null;
}

/** Persisted Skill assignment row. */
export interface SkillAssignmentRow {
  /** Assignment id. */
  id: string;
  /** Owning organization id. */
  organizationId: string;
  /** Assigned Skill id. */
  skillId: string;
  /** Assigned Skill version id. */
  skillVersionId: string;
  /** Target type. */
  targetType: SkillAssignmentTargetType;
  /** Target id. */
  targetId: string;
  /** Assignment status. */
  status: SkillAssignmentStatus;
  /** User who requested or created the assignment. */
  createdByUserId: string;
  /** Approver user id. */
  approvedByUserId?: string | null;
  /** Latest sync job id. */
  lastSyncJobId?: string | null;
  /** Creation timestamp. */
  createdAt: Date;
  /** Last update timestamp. */
  updatedAt: Date;
}

/** Input used to grant a resource permission. */
export interface GrantResourcePermissionInput {
  /** Organization scope. */
  organizationId: string;
  /** Resource type. */
  resourceType: GovernanceResourceType;
  /** Resource id. */
  resourceId: string;
  /** User receiving the permission. */
  subjectUserId: string;
  /** Permission value. */
  permission: GovernancePermission;
  /** User granting the permission. */
  grantedByUserId: string;
}

/** Input used to check a user permission. */
export interface HasResourcePermissionInput {
  /** Organization scope. */
  organizationId: string;
  /** Current user's organization role. */
  organizationRole: AuthMemberRole;
  /** Resource type. */
  resourceType: GovernanceResourceType;
  /** Resource id. */
  resourceId: string;
  /** Permission value. */
  permission: GovernancePermission;
  /** Current user id. */
  userId: string;
}

/** Input used to create an approval request. */
export interface CreateApprovalRequestInput {
  /** Organization scope. */
  organizationId: string;
  /** Requested action. */
  action: ApprovalAction;
  /** Related Skill id. */
  skillId?: string | null;
  /** Related Skill version id. */
  skillVersionId?: string | null;
  /** Optional target type. */
  targetType?: SkillAssignmentTargetType | null;
  /** Optional target id. */
  targetId?: string | null;
  /** Risk level. */
  riskLevel: ApprovalRiskLevel;
  /** Short risk summary. */
  riskSummary: string;
  /** Requester reason. */
  requestedReason?: string | null;
  /** Requester user id. */
  requestedByUserId: string;
  /** Required resolver role. */
  requiredRole?: "owner" | "admin";
  /** Small non-sensitive metadata. */
  metadata?: Record<string, unknown>;
}

/** Input used to resolve an approval request. */
export interface ResolveApprovalRequestInput {
  /** Approval request id. */
  requestId: string;
  /** Resolution value. */
  resolution: "approved" | "rejected";
  /** Resolver user id. */
  resolvedByUserId: string;
  /** Optional resolution reason. */
  resolutionReason?: string | null;
}

/** Input used to publish a Skill version. */
export interface PublishSkillVersionInput {
  /** Skill id. */
  skillId: string;
  /** Skill version id. */
  skillVersionId: string;
  /** User performing publication. */
  publishedByUserId: string;
}

/** Input used to create or update an assignment. */
export interface CreateSkillAssignmentInput {
  /** Organization scope. */
  organizationId: string;
  /** Skill id. */
  skillId: string;
  /** Skill version id. */
  skillVersionId: string;
  /** Target type. */
  targetType: SkillAssignmentTargetType;
  /** Target id. */
  targetId: string;
  /** Assignment status. */
  status: SkillAssignmentStatus;
  /** Creator user id. */
  createdByUserId: string;
  /** Approver user id. */
  approvedByUserId?: string | null;
}

/** Input used to list approvals. */
export interface ListApprovalRequestsInput {
  /** Organization scope. */
  organizationId: string;
  /** Optional status filter. */
  status?: ApprovalStatus;
}

/** Input used to list Skill assignments. */
export interface ListSkillAssignmentsInput {
  /** Organization scope. */
  organizationId: string;
}

/** Postgres Skill governance repository. */
export interface SkillGovernanceStore {
  /** Grant or update one resource permission. */
  grantResourcePermission: (input: GrantResourcePermissionInput) => Promise<ResourcePermissionRow>;
  /** List permissions for one resource. */
  listResourcePermissions: (input: {
    organizationId: string;
    resourceId: string;
    resourceType: GovernanceResourceType;
  }) => Promise<ResourcePermissionRow[]>;
  /** Check whether a user can perform a resource action. */
  hasResourcePermission: (input: HasResourcePermissionInput) => Promise<boolean>;
  /** Publish an immutable Skill version. */
  publishSkillVersion: (input: PublishSkillVersionInput) => Promise<void>;
  /** Create an approval request. */
  createApprovalRequest: (input: CreateApprovalRequestInput) => Promise<ApprovalRequestRow>;
  /** List approval requests for an organization. */
  listApprovalRequests: (input: ListApprovalRequestsInput) => Promise<ApprovalRequestRow[]>;
  /** Resolve an approval request; asynchronous effects are created by API-level Operations. */
  resolveApprovalRequest: (input: ResolveApprovalRequestInput) => Promise<ApprovalRequestRow | null>;
  /** Create or update a Skill assignment. */
  createSkillAssignment: (input: CreateSkillAssignmentInput) => Promise<SkillAssignmentRow>;
  /** List Skill assignments. */
  listSkillAssignments: (input: ListSkillAssignmentsInput) => Promise<SkillAssignmentRow[]>;
  /** Close owned database connections. */
  close: () => Promise<void>;
}

/** Postgres Skill governance repository options. */
export interface PostgresSkillGovernanceStoreOptions {
  /** Postgres connection string; defaults to local compose Postgres. */
  connectionString?: string;
}

/** Create a Postgres-backed Skill governance repository. */
export function createPostgresSkillGovernanceStore(
  options: PostgresSkillGovernanceStoreOptions = {},
): SkillGovernanceStore {
  const pool = new Pool({
    connectionString: options.connectionString ?? process.env.DATABASE_URL ?? "postgres://lorume:lorume@127.0.0.1:54329/lorume",
  });

  return {
    async grantResourcePermission(input) {
      const result = await pool.query<ResourcePermissionRow>(`
        INSERT INTO resource_permissions (
          id, organization_id, resource_type, resource_id, subject_user_id, permission, granted_by_user_id
        )
        SELECT $1, $2, $3, $4, $5, $6, $7
        WHERE EXISTS (
          SELECT 1
          FROM organization_members
          WHERE organization_id = $2
            AND user_id = $5
            AND status = 'active'
        )
        ON CONFLICT (organization_id, resource_type, resource_id, subject_user_id, permission)
        DO UPDATE SET granted_by_user_id = EXCLUDED.granted_by_user_id, updated_at = now()
        RETURNING
          id,
          organization_id AS "organizationId",
          resource_type AS "resourceType",
          resource_id AS "resourceId",
          subject_user_id AS "subjectUserId",
          permission,
          granted_by_user_id AS "grantedByUserId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `, [
        createId("rperm"),
        input.organizationId,
        input.resourceType,
        input.resourceId,
        input.subjectUserId,
        input.permission,
        input.grantedByUserId,
      ]);
      const permission = result.rows[0];
      if (!permission) throw new Error("permission subject must be an active organization member");
      return permission;
    },
    async listResourcePermissions(input) {
      const result = await pool.query<ResourcePermissionRow>(`
        SELECT
          id,
          organization_id AS "organizationId",
          resource_type AS "resourceType",
          resource_id AS "resourceId",
          subject_user_id AS "subjectUserId",
          permission,
          granted_by_user_id AS "grantedByUserId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM resource_permissions
        WHERE organization_id = $1
          AND resource_type = $2
          AND resource_id = $3
        ORDER BY created_at ASC
      `, [input.organizationId, input.resourceType, input.resourceId]);
      return result.rows;
    },
    async hasResourcePermission(input) {
      if (input.organizationRole === "owner" || input.organizationRole === "admin") return true;
      if (input.resourceType === "skill" && await isSkillOwner(pool, input.resourceId, input.userId, input.organizationId)) {
        return true;
      }
      const result = await pool.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1
          FROM resource_permissions
          WHERE organization_id = $1
            AND resource_type = $2
            AND resource_id = $3
            AND subject_user_id = $4
            AND permission = $5
        ) AS "exists"
      `, [
        input.organizationId,
        input.resourceType,
        input.resourceId,
        input.userId,
        input.permission,
      ]);
      return result.rows[0]?.exists ?? false;
    },
    async publishSkillVersion(input) {
      await publishSkillVersion(pool, input);
    },
    async createApprovalRequest(input) {
      const snapshotHash = hashSnapshot({
        action: input.action,
        metadata: input.metadata ?? {},
        organizationId: input.organizationId,
        riskLevel: input.riskLevel,
        skillId: input.skillId ?? null,
        skillVersionId: input.skillVersionId ?? null,
        targetId: input.targetId ?? null,
        targetType: input.targetType ?? null,
      });
      const result = await pool.query<ApprovalRequestRow>(`
        INSERT INTO approval_requests (
          id,
          organization_id,
          action,
          skill_id,
          skill_version_id,
          target_type,
          target_id,
          risk_level,
          risk_summary,
          requested_reason,
          snapshot_hash,
          requested_by_user_id,
          required_role,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING ${approvalRequestColumns}
      `, [
        createId("apr"),
        input.organizationId,
        input.action,
        input.skillId ?? null,
        input.skillVersionId ?? null,
        input.targetType ?? null,
        input.targetId ?? null,
        input.riskLevel,
        input.riskSummary,
        input.requestedReason ?? null,
        snapshotHash,
        input.requestedByUserId,
        input.requiredRole ?? "admin",
        JSON.stringify(input.metadata ?? {}),
      ]);
      return result.rows[0];
    },
    async listApprovalRequests(input) {
      const params = [input.organizationId];
      const statusFilter = input.status ? "AND status = $2" : "";
      if (input.status) params.push(input.status);
      const result = await pool.query<ApprovalRequestRow>(`
        SELECT ${approvalRequestColumns}
        FROM approval_requests
        WHERE organization_id = $1
          ${statusFilter}
        ORDER BY created_at DESC
      `, params);
      return result.rows;
    },
    async resolveApprovalRequest(input) {
      return withTransaction(pool, async (client) => {
        const requestResult = await client.query<ApprovalRequestRow>(`
          SELECT ${approvalRequestColumns}
          FROM approval_requests
          WHERE id = $1
            AND status = 'pending'
          LIMIT 1
          FOR UPDATE
        `, [input.requestId]);
        const request = requestResult.rows[0];
        if (!request) return null;
        const resolvedAt = new Date();
        const result = await client.query<ApprovalRequestRow>(`
          UPDATE approval_requests
          SET
            status = $2,
            resolved_by_user_id = $3,
            resolution_reason = $4,
            resolved_at = $5
          WHERE id = $1
          RETURNING ${approvalRequestColumns}
        `, [
          request.id,
          input.resolution,
          input.resolvedByUserId,
          input.resolutionReason ?? null,
          resolvedAt,
        ]);
        const resolved = result.rows[0];
        return resolved;
      });
    },
    async createSkillAssignment(input) {
      return createSkillAssignment(pool, input);
    },
    async listSkillAssignments(input) {
      const result = await pool.query<SkillAssignmentRow>(`
        SELECT ${skillAssignmentColumns}
        FROM skill_assignments
        WHERE organization_id = $1
          AND status <> 'disabled'
        ORDER BY updated_at DESC, created_at DESC
      `, [input.organizationId]);
      return result.rows;
    },
    close() {
      return pool.end();
    },
  };
}

const approvalRequestColumns = `
  id,
  organization_id AS "organizationId",
  action,
  skill_id AS "skillId",
  skill_version_id AS "skillVersionId",
  target_type AS "targetType",
  target_id AS "targetId",
  risk_level AS "riskLevel",
  risk_summary AS "riskSummary",
  requested_reason AS "requestedReason",
  snapshot_hash AS "snapshotHash",
  requested_by_user_id AS "requestedByUserId",
  required_role AS "requiredRole",
  status,
  metadata,
  resolved_by_user_id AS "resolvedByUserId",
  resolution_reason AS "resolutionReason",
  created_at AS "createdAt",
  resolved_at AS "resolvedAt"
`;

const skillAssignmentColumns = `
  id,
  organization_id AS "organizationId",
  skill_id AS "skillId",
  skill_version_id AS "skillVersionId",
  target_type AS "targetType",
  target_id AS "targetId",
  status,
  created_by_user_id AS "createdByUserId",
  approved_by_user_id AS "approvedByUserId",
  last_sync_job_id AS "lastSyncJobId",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

async function publishSkillVersion(
  client: Pick<pg.Pool | PoolClient, "query">,
  input: PublishSkillVersionInput,
): Promise<void> {
  const result = await client.query<{ skillId: string }>(`
    UPDATE skill_versions
    SET published_by_user_id = $3, published_at = COALESCE(published_at, now())
    WHERE id = $2
      AND skill_id = $1
    RETURNING skill_id AS "skillId"
  `, [input.skillId, input.skillVersionId, input.publishedByUserId]);
  const skillId = result.rows[0]?.skillId;
  if (!skillId) throw new Error("skill version not found");
  await client.query("UPDATE skills SET status = 'published', updated_at = now() WHERE id = $1", [skillId]);
}

async function createSkillAssignment(
  client: Pick<pg.Pool | PoolClient, "query">,
  input: CreateSkillAssignmentInput,
): Promise<SkillAssignmentRow> {
  const result = await client.query<SkillAssignmentRow>(`
    INSERT INTO skill_assignments (
      id,
      organization_id,
      skill_id,
      skill_version_id,
      target_type,
      target_id,
      status,
      created_by_user_id,
      approved_by_user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (organization_id, skill_id, target_type, target_id)
    DO UPDATE SET
      skill_version_id = EXCLUDED.skill_version_id,
      status = EXCLUDED.status,
      created_by_user_id = EXCLUDED.created_by_user_id,
      approved_by_user_id = EXCLUDED.approved_by_user_id,
      updated_at = now()
    RETURNING ${skillAssignmentColumns}
  `, [
    createId("ska"),
    input.organizationId,
    input.skillId,
    input.skillVersionId,
    input.targetType,
    input.targetId,
    input.status,
    input.createdByUserId,
    input.approvedByUserId ?? null,
  ]);
  return result.rows[0];
}

async function isSkillOwner(
  client: Pick<pg.Pool | PoolClient, "query">,
  skillId: string,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM skills
      WHERE id = $1
        AND owner_user_id = $2
        AND organization_id = $3
    ) AS "exists"
  `, [skillId, userId, organizationId]);
  return result.rows[0]?.exists ?? false;
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

function hashSnapshot(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
