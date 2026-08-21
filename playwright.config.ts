import { defineConfig, devices } from "@playwright/test";

import { assertExpectedLocalSupabaseProject } from "./tests/e2e/local-project-guard";

const E2E_PORT = 31_073;
const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
const localSupabase = assertExpectedLocalSupabaseProject();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: E2E_ORIGIN,
    trace: "on-first-retry",
  },
  webServer: {
    command: `node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${E2E_PORT}`,
    env: {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: localSupabase.anonKey,
      NEXT_PUBLIC_SUPABASE_URL: localSupabase.apiUrl,
    },
    url: E2E_ORIGIN,
    reuseExistingServer: false,
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 13"] } },
  ],
});
