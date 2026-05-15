#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "db", "migrations");
const databaseUrl = process.env.DATABASE_URL ?? "postgres://lorume:lorume@127.0.0.1:54329/lorume";

try {
  const applied = await runMigrations(databaseUrl);
  if (applied.length === 0) {
    process.stdout.write("db:migrate: no pending migrations\n");
  } else {
    process.stdout.write(`db:migrate: applied ${applied.join(", ")}\n`);
  }
} catch (error) {
  process.stderr.write(`db:migrate: failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function runMigrations(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await ensureMigrationTable(client);
    const migrations = await readMigrationFiles();
    const appliedVersions = await readAppliedVersions(client);
    const applied = [];

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      await applyMigration(client, migration);
      applied.push(migration.version);
    }

    return applied;
  } finally {
    await client.end();
  }
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function readMigrationFiles() {
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(filenames.map(async (filename) => ({
    filename,
    sql: await readFile(path.join(migrationsDir, filename), "utf8"),
    version: filename.replace(/\.sql$/, ""),
  })));
}

async function readAppliedVersions(client) {
  const result = await client.query("SELECT version FROM schema_migrations");
  return new Set(result.rows.map((row) => row.version));
}

async function applyMigration(client, migration) {
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [migration.version]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`${migration.filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
