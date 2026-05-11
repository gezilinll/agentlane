import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 5_000,
  },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4175",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:e2e",
    env: {
      AGENTLANE_BACKEND_PORT: "4174",
      AGENTLANE_E2E_FRONTEND_PORT: "4175",
      DATABASE_URL: "postgres://agentlane:agentlane@127.0.0.1:54329/agentlane_e2e",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:4175",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
