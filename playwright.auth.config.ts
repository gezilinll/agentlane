import { defineConfig, devices } from "@playwright/test";

const databaseUrl = "postgres://lorume:lorume@127.0.0.1:54329/lorume_e2e_auth";
const loginCodePath = ".lorume/e2e/latest-login-code-auth.json";

process.env.LORUME_E2E_DATABASE_URL ??= databaseUrl;
process.env.LORUME_E2E_LOGIN_CODE_PATH ??= loginCodePath;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "skill-registry-auth.spec.ts",
  timeout: 45_000,
  workers: 1,
  expect: {
    timeout: 8_000,
  },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4185",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:e2e",
    env: {
      DATABASE_URL: databaseUrl,
      LORUME_AUTH_REQUIRED: "1",
      LORUME_BACKEND_PORT: "4184",
      LORUME_E2E_FRONTEND_PORT: "4185",
      LORUME_E2E_LOGIN_CODE_PATH: loginCodePath,
      VITE_LORUME_AUTH_MODE: "required",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:4185",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
