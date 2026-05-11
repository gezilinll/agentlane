import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationScriptPath = path.join(repoRoot, "scripts/db-migrate.mjs");
const runDbTests = process.env.AGENTLANE_RUN_DB_TESTS === "1";
const describeDb = runDbTests ? describe : describe.skip;
const createdDatabaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(createdDatabaseNames.splice(0).map((databaseName) => dropTestDatabase(databaseName)));
});

describeDb("database migrations", () => {
  it("creates the backend core schema and can run repeatedly", async () => {
    expect(existsSync(migrationScriptPath)).toBe(true);
    const databaseUrl = await createTestDatabase();

    runMigration(databaseUrl);
    runMigration(databaseUrl);

    const client = await connectWithRetry(databaseUrl);
    try {
      const tableNames = await listPublicTableNames(client);

      expect(tableNames).toEqual([
        "agents",
        "channel_bindings",
        "collector_ingestions",
        "devices",
        "runtimes",
        "schema_migrations",
        "work_conversations",
        "work_executions",
        "work_items",
      ]);
      expect(await listMigrationVersions(client)).toEqual(["0001_backend_core"]);
    } finally {
      await client.end();
    }
  });
});

function runMigration(databaseUrl: string): void {
  execFileSync(process.execPath, [migrationScriptPath], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

async function createTestDatabase(): Promise<string> {
  const adminUrl = getAdminDatabaseUrl();
  const databaseName = `agentlane_test_${process.pid}_${Date.now()}`;
  const adminClient = await connectWithRetry(adminUrl.toString());
  try {
    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    createdDatabaseNames.push(databaseName);
  } finally {
    await adminClient.end();
  }

  const databaseUrl = new URL(adminUrl.toString());
  databaseUrl.pathname = `/${databaseName}`;
  return databaseUrl.toString();
}

async function dropTestDatabase(databaseName: string): Promise<void> {
  const adminClient = await connectWithRetry(getAdminDatabaseUrl().toString());
  try {
    await adminClient.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", [
      databaseName,
    ]);
    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
  } finally {
    await adminClient.end();
  }
}

async function listPublicTableNames(client: Client): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map((row) => row.table_name);
}

async function listMigrationVersions(client: Client): Promise<string[]> {
  const result = await client.query<{ version: string }>(`
    SELECT version
    FROM schema_migrations
    ORDER BY version
  `);
  return result.rows.map((row) => row.version);
}

async function connectWithRetry(connectionString: string): Promise<Client> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 30_000) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => undefined);
      lastError = error;
      await delay(500);
    }
  }

  throw lastError;
}

function getAdminDatabaseUrl(): URL {
  const databaseUrl = new URL(
    process.env.AGENTLANE_TEST_DATABASE_URL ?? "postgres://agentlane:agentlane@127.0.0.1:54329/postgres",
  );
  databaseUrl.pathname = "/postgres";
  return databaseUrl;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
