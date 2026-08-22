import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const localSecuritySuite = "tests/security/local-supabase-security.test.ts";
const runLocalSecuritySuite = process.env.RUN_LOCAL_SECURITY_TESTS === "true";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    testTimeout: 15_000,
    setupFiles: ["./tests/setup.ts"],
    include: runLocalSecuritySuite
      ? [localSecuritySuite]
      : ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: runLocalSecuritySuite ? [] : [localSecuritySuite],
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
});
