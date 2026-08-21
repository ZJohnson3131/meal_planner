import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "vite";

export const EXPECTED_LOCAL_SUPABASE_PROJECT_ID = "task-3-supabase-docker";

export type ValidatedLocalSupabaseEnvironment = Readonly<{
  anonKey: string;
  apiUrl: string;
}>;

export function assertExpectedLocalSupabaseProject(): ValidatedLocalSupabaseEnvironment {
  const env = loadEnv("test", process.cwd(), "");
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error("E2E mutations require a valid local Supabase API URL");
  }

  if (!(["127.0.0.1", "localhost", "::1"].includes(url.hostname)) || url.port !== "54321") {
    throw new Error("E2E mutations require the expected loopback Supabase API port 54321");
  }
  if (!anonKey || anonKey.startsWith("replace-with")) {
    throw new Error("E2E mutations require a real local Supabase anon key");
  }

  const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
  if (projectId !== EXPECTED_LOCAL_SUPABASE_PROJECT_ID) {
    throw new Error(
      `E2E mutations require Supabase project_id ${EXPECTED_LOCAL_SUPABASE_PROJECT_ID}`,
    );
  }

  return Object.freeze({ anonKey, apiUrl });
}
