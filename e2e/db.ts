import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.AGENTLANE_E2E_DATABASE_URL ??
  "postgres://agentlane:agentlane@127.0.0.1:54329/agentlane_e2e";

/** Reset the isolated Playwright database so each browser spec starts from a current snapshot. */
export async function resetE2eDatabase(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      TRUNCATE
        collector_ingestions,
        channel_bindings,
        work_executions,
        work_items,
        work_conversations,
        agents,
        runtimes,
        devices
      RESTART IDENTITY CASCADE
    `);
  } finally {
    await client.end();
  }
}
