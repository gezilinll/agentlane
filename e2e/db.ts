import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.LORUME_E2E_DATABASE_URL ??
  "postgres://lorume:lorume@127.0.0.1:54329/lorume_e2e";

/** Reset the isolated Playwright database so each browser spec starts from a current snapshot. */
export async function resetE2eDatabase(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      TRUNCATE
        notification_deliveries,
        notification_preferences,
        notification_threads,
        notification_events,
        operation_jobs,
        operations,
        approval_requests,
        resource_permissions,
        skill_sync_jobs,
        skill_assignments,
        skill_files,
        skill_versions,
        skills,
        device_tokens,
        organization_invitations,
        sessions,
        email_login_codes,
        organization_members,
        organizations,
        users,
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
