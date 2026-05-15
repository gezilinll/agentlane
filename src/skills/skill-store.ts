import { randomUUID } from "node:crypto";
import pg, { type PoolClient } from "pg";
import type {
  NormalizedSkillPackage,
  SkillPackageFile,
  SkillPackageSource,
  SkillPackageValidationResult,
} from "./skill-package";

const { Pool } = pg;

/** Persisted Skill lifecycle state. */
export type SkillStatus = "draft" | "published" | "archived";

/** Persisted Skill summary. */
export interface SkillRow {
  /** Skill id. */
  id: string;
  /** Owning organization id. */
  organizationId: string;
  /** Organization-local stable slug. */
  slug: string;
  /** Human-readable Skill name. */
  name: string;
  /** Human-readable Skill description. */
  description: string;
  /** User responsible for this Skill. */
  ownerUserId: string;
  /** Current lifecycle state. */
  status: SkillStatus;
  /** Original import source metadata. */
  source: SkillPackageSource;
  /** Creation timestamp. */
  createdAt: Date;
  /** Last update timestamp. */
  updatedAt: Date;
  /** Archived timestamp, if archived. */
  archivedAt?: Date | null;
}

/** Persisted immutable Skill version. */
export interface SkillVersionRow {
  /** Version row id. */
  id: string;
  /** Parent Skill id. */
  skillId: string;
  /** Human-visible sequential version. */
  version: string;
  /** Package hash for immutable content comparison. */
  packageHash: string;
  /** Optional import summary. */
  summary?: string | null;
  /** User who imported this version. */
  createdByUserId: string;
  /** User who published this version, if published. */
  publishedByUserId?: string | null;
  /** Publication timestamp, if published. */
  publishedAt?: Date | null;
  /** Static validation status. */
  validationStatus: "passed" | "warning" | "blocked";
  /** Full deterministic validation result. */
  validationResult: SkillPackageValidationResult;
  /** Creation timestamp. */
  createdAt: Date;
}

/** Persisted Skill file. */
export interface SkillFileRow extends SkillPackageFile {
  /** File row id. */
  id: string;
  /** Owning Skill version id. */
  skillVersionId: string;
  /** Creation timestamp. */
  createdAt: Date;
}

/** Skill summary returned by list APIs. */
export interface SkillListRow extends SkillRow {
  /** Latest version label, when a version exists. */
  latestVersion?: string | null;
  /** Latest package hash, when a version exists. */
  latestPackageHash?: string | null;
  /** Latest validation status, when a version exists. */
  latestValidationStatus?: SkillVersionRow["validationStatus"] | null;
}

/** Full Skill detail for read APIs. */
export interface SkillDetail {
  /** Parent Skill row. */
  skill: SkillRow;
  /** Versions ordered newest first. */
  versions: SkillVersionRow[];
  /** Files for the newest version. */
  files: SkillFileRow[];
}

/** Result returned from importing a package. */
export interface SkillImportResult {
  /** Imported or updated Skill row. */
  skill: SkillRow;
  /** Created immutable version. */
  version: SkillVersionRow;
  /** Persisted files for this version. */
  files: SkillFileRow[];
}

/** Input for importing a validated package. */
export interface SkillImportInput {
  /** Organization that owns the Skill copy. */
  organizationId: string;
  /** User who imported this version. */
  createdByUserId: string;
  /** Optional owner override; defaults to `createdByUserId`. */
  ownerUserId?: string;
  /** Validated package. */
  package: NormalizedSkillPackage;
  /** Optional version summary. */
  summary?: string;
}

/** Skill list query input. */
export interface SkillListInput {
  /** Organization whose Skills should be listed. */
  organizationId: string;
}

/** Skill detail query input. */
export interface SkillDetailInput {
  /** Skill id. */
  skillId: string;
}

/** Skill version file query input. */
export interface SkillVersionFilesInput {
  /** Parent Skill id used to prevent cross-Skill file reads. */
  skillId: string;
  /** Skill version id. */
  skillVersionId: string;
}

/** Postgres Skill repository. */
export interface SkillStore {
  /** Import a validated Skill package into an organization-owned copy. */
  importSkillVersion: (input: SkillImportInput) => Promise<SkillImportResult>;
  /** List Skills for an organization. */
  listSkills: (input: SkillListInput) => Promise<SkillListRow[]>;
  /** Read one Skill with latest files. */
  readSkillDetail: (input: SkillDetailInput) => Promise<SkillDetail | null>;
  /** Read files for one immutable Skill version. */
  readSkillVersionFiles: (input: SkillVersionFilesInput) => Promise<SkillFileRow[]>;
  /** Close owned database connections. */
  close: () => Promise<void>;
}

/** Postgres Skill repository options. */
export interface PostgresSkillStoreOptions {
  /** Postgres connection string; defaults to local compose Postgres. */
  connectionString?: string;
}

/** Create a Postgres-backed Skill repository. */
export function createPostgresSkillStore(options: PostgresSkillStoreOptions = {}): SkillStore {
  const pool = new Pool({
    connectionString: options.connectionString ?? process.env.DATABASE_URL ?? "postgres://lorume:lorume@127.0.0.1:54329/lorume",
  });

  return {
    importSkillVersion(input) {
      if (input.package.validation.status === "blocked") {
        throw new Error("blocked skill packages cannot be imported");
      }
      return withTransaction(pool, async (client) => {
        const slug = slugify(input.package.metadata.name);
        const skill = await upsertSkill(client, {
          description: input.package.metadata.description,
          name: input.package.metadata.name,
          organizationId: input.organizationId,
          ownerUserId: input.ownerUserId ?? input.createdByUserId,
          slug,
          source: input.package.source,
        });
        const versionLabel = await readNextVersion(client, skill.id);
        const version = await insertSkillVersion(client, {
          createdByUserId: input.createdByUserId,
          packageHash: input.package.packageHash,
          skillId: skill.id,
          summary: input.summary,
          validation: input.package.validation,
          version: versionLabel,
        });
        const files = [];
        for (const file of input.package.files) {
          files.push(await insertSkillFile(client, version.id, file));
        }
        return { files, skill, version };
      });
    },
    async listSkills(input) {
      const result = await pool.query<SkillListRow>(`
        SELECT
          s.id,
          s.organization_id AS "organizationId",
          s.slug,
          s.name,
          s.description,
          s.owner_user_id AS "ownerUserId",
          s.status,
          s.source,
          s.created_at AS "createdAt",
          s.updated_at AS "updatedAt",
          s.archived_at AS "archivedAt",
          latest.version AS "latestVersion",
          latest.package_hash AS "latestPackageHash",
          latest.validation_status AS "latestValidationStatus"
        FROM skills s
        LEFT JOIN LATERAL (
          SELECT version, package_hash, validation_status
          FROM skill_versions
          WHERE skill_id = s.id
          ORDER BY created_at DESC
          LIMIT 1
        ) latest ON true
        WHERE s.organization_id = $1
          AND s.status <> 'archived'
        ORDER BY s.updated_at DESC, s.created_at DESC
      `, [input.organizationId]);
      return result.rows;
    },
    async readSkillDetail(input) {
      const skillResult = await pool.query<SkillRow>(`
        SELECT
          id,
          organization_id AS "organizationId",
          slug,
          name,
          description,
          owner_user_id AS "ownerUserId",
          status,
          source,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          archived_at AS "archivedAt"
        FROM skills
        WHERE id = $1
        LIMIT 1
      `, [input.skillId]);
      const skill = skillResult.rows[0];
      if (!skill) return null;
      const versions = await readSkillVersions(pool, skill.id);
      const latestVersionId = versions[0]?.id;
      const files = latestVersionId ? await readSkillFiles(pool, latestVersionId) : [];
      return { files, skill, versions };
    },
    async readSkillVersionFiles(input) {
      const result = await pool.query<SkillFileRow>(`
        SELECT
          sf.id,
          sf.skill_version_id AS "skillVersionId",
          sf.path,
          sf.content_hash AS "contentHash",
          sf.size_bytes AS "sizeBytes",
          sf.content,
          sf.created_at AS "createdAt"
        FROM skill_files sf
        JOIN skill_versions sv ON sv.id = sf.skill_version_id
        WHERE sf.skill_version_id = $1
          AND sv.skill_id = $2
        ORDER BY CASE WHEN sf.path = 'SKILL.md' THEN 0 ELSE 1 END, sf.path ASC
      `, [input.skillVersionId, input.skillId]);
      return result.rows;
    },
    close() {
      return pool.end();
    },
  };
}

async function upsertSkill(
  client: PoolClient,
  input: {
    description: string;
    name: string;
    organizationId: string;
    ownerUserId: string;
    slug: string;
    source: SkillPackageSource;
  },
): Promise<SkillRow> {
  const result = await client.query<SkillRow>(`
    INSERT INTO skills (
      id, organization_id, slug, name, description, owner_user_id, source
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (organization_id, slug) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      owner_user_id = EXCLUDED.owner_user_id,
      source = EXCLUDED.source,
      updated_at = now()
    RETURNING
      id,
      organization_id AS "organizationId",
      slug,
      name,
      description,
      owner_user_id AS "ownerUserId",
      status,
      source,
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      archived_at AS "archivedAt"
  `, [
    createId("skl"),
    input.organizationId,
    input.slug,
    input.name,
    input.description,
    input.ownerUserId,
    JSON.stringify(input.source),
  ]);
  return result.rows[0];
}

async function insertSkillVersion(
  client: PoolClient,
  input: {
    createdByUserId: string;
    packageHash: string;
    skillId: string;
    summary?: string;
    validation: SkillPackageValidationResult;
    version: string;
  },
): Promise<SkillVersionRow> {
  const result = await client.query<SkillVersionRow>(`
    INSERT INTO skill_versions (
      id, skill_id, version, package_hash, summary, created_by_user_id, validation_status, validation_result
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      id,
      skill_id AS "skillId",
      version,
      package_hash AS "packageHash",
      summary,
      created_by_user_id AS "createdByUserId",
      published_by_user_id AS "publishedByUserId",
      published_at AS "publishedAt",
      validation_status AS "validationStatus",
      validation_result AS "validationResult",
      created_at AS "createdAt"
  `, [
    createId("sklv"),
    input.skillId,
    input.version,
    input.packageHash,
    input.summary ?? null,
    input.createdByUserId,
    input.validation.status,
    JSON.stringify(input.validation),
  ]);
  return result.rows[0];
}

async function insertSkillFile(
  client: PoolClient,
  skillVersionId: string,
  file: SkillPackageFile,
): Promise<SkillFileRow> {
  const result = await client.query<SkillFileRow>(`
    INSERT INTO skill_files (
      id, skill_version_id, path, content_hash, size_bytes, content
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id,
      skill_version_id AS "skillVersionId",
      path,
      content_hash AS "contentHash",
      size_bytes AS "sizeBytes",
      content,
      created_at AS "createdAt"
  `, [
    createId("sklf"),
    skillVersionId,
    file.path,
    file.contentHash,
    file.sizeBytes,
    file.content,
  ]);
  return result.rows[0];
}

async function readNextVersion(client: PoolClient, skillId: string): Promise<string> {
  const result = await client.query<{ count: string }>("SELECT count(*) AS count FROM skill_versions WHERE skill_id = $1", [skillId]);
  return String(Number(result.rows[0]?.count ?? "0") + 1);
}

async function readSkillVersions(pool: pg.Pool, skillId: string): Promise<SkillVersionRow[]> {
  const result = await pool.query<SkillVersionRow>(`
    SELECT
      id,
      skill_id AS "skillId",
      version,
      package_hash AS "packageHash",
      summary,
      created_by_user_id AS "createdByUserId",
      published_by_user_id AS "publishedByUserId",
      published_at AS "publishedAt",
      validation_status AS "validationStatus",
      validation_result AS "validationResult",
      created_at AS "createdAt"
    FROM skill_versions
    WHERE skill_id = $1
    ORDER BY created_at DESC
  `, [skillId]);
  return result.rows;
}

async function readSkillFiles(pool: pg.Pool, skillVersionId: string): Promise<SkillFileRow[]> {
  const result = await pool.query<SkillFileRow>(`
    SELECT
      id,
      skill_version_id AS "skillVersionId",
      path,
      content_hash AS "contentHash",
      size_bytes AS "sizeBytes",
      content,
      created_at AS "createdAt"
    FROM skill_files
    WHERE skill_version_id = $1
    ORDER BY CASE WHEN path = 'SKILL.md' THEN 0 ELSE 1 END, path ASC
  `, [skillVersionId]);
  return result.rows;
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

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill";
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
