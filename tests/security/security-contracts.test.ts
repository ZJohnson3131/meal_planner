import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

describe("database hardening migration contract", () => {
  test("removes obsolete attack surfaces and revokes legacy completion", async () => {
    const sql = await source("supabase/migrations/0005_security_integrity_hardening.sql");

    expect(sql).toMatch(/drop table public\.shopping_providers;/i);
    expect(sql).toMatch(/drop function public\.apply_meal_completion_deductions\(uuid, jsonb\);/i);
    expect(sql).toMatch(/revoke all on function public\.apply_meal_completion_deductions\(uuid, jsonb\)/i);
    expect(sql).toMatch(/revoke all privileges on all tables in schema public from anon, authenticated;/i);
    expect(sql).toMatch(/revoke all privileges on schema public from PUBLIC;/i);
    expect(sql).toMatch(/revoke all privileges on all tables in schema public from PUBLIC;/i);
    expect(sql).toMatch(/revoke all privileges on all sequences in schema public from PUBLIC;/i);
    expect(sql).toMatch(/revoke all privileges on all functions in schema public from PUBLIC;/i);
    expect(sql).toMatch(/alter default privileges in schema public revoke all on tables from PUBLIC;/i);
    expect(sql).toMatch(/alter default privileges in schema public revoke all on sequences from PUBLIC;/i);
    expect(sql).toMatch(/alter default privileges in schema public revoke execute on functions from PUBLIC;/i);
    expect(sql).not.toMatch(/grant (?:insert|delete|all privileges|update on).* to authenticated/i);
  });

  test("sanitizes existing recipe URLs before enforcing the persistent URL contract", async () => {
    const sql = await source("supabase/migrations/0005_security_integrity_hardening.sql");

    expect(sql).toMatch(/update public\.recipes\s+set source_url = public\.sanitize_recipe_source_url\(source_url\)/i);
    expect(sql).toMatch(/source_url is distinct from public\.sanitize_recipe_source_url\(source_url\)/i);
    expect(sql).toMatch(/source_url = public\.sanitize_recipe_source_url\(source_url\)/i);
  });

  test("locks ownership, parentage, pantry versions, and immutable deduction history", async () => {
    const sql = await source("supabase/migrations/0005_security_integrity_hardening.sql");

    for (const contract of [
      "pantry_items_household_normalized_name_key",
      "recipes_reject_household_reparenting",
      "meal_plan_entries_reject_household_reparenting",
      "recipe_ingredients_reject_reparenting",
      "shopping_list_items_reject_reparenting",
      "pantry_deductions_enforce_history",
      "pantry_items_values_check",
      "recipe_ingredients_values_check",
      "shopping_list_items_values_check",
    ]) {
      expect(sql).toContain(contract);
    }
    expect(sql).toMatch(/p_expected_version bigint/i);
    expect(sql).toMatch(/version = version \+ 1/i);
    expect(sql).toMatch(/Recipe ingredients are locked while a completion is active/i);
  });

  test("keeps database unit canonicalization aligned with the TypeScript piece and pinch vocabulary", async () => {
    const sql = await source("supabase/migrations/0005_security_integrity_hardening.sql");

    expect(sql).toMatch(/when 'pieces' then 'piece'/i);
    expect(sql).toMatch(/when 'pinches' then 'pinch'/i);
    expect(sql).toMatch(/when 'piece' then 1/i);
    expect(sql).toMatch(/when 'pinch' then 1/i);
  });

  test("exposes only the hardened authenticated RPC surface", async () => {
    const sql = await source("supabase/migrations/0005_security_integrity_hardening.sql");

    expect(sql).toMatch(
      /create or replace function public\.create_recipe_with_ingredients\(\s*p_household_id uuid,\s*p_recipe jsonb,\s*p_ingredients jsonb\s*\)/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.update_recipe_with_ingredients\(\s*p_recipe_id uuid,\s*p_recipe jsonb,\s*p_ingredients jsonb\s*\)/i,
    );
    expect(sql).toMatch(
      /drop function if exists public\.create_recipe_with_ingredients\(uuid, text, text, text, boolean, numeric, text, text, jsonb\);/i,
    );
    for (const rpc of [
      "assign_dinner",
      "set_dinner_status",
      "complete_meal_plan_entry",
      "reverse_meal_completion_deductions",
      "create_pantry_item",
      "update_pantry_item",
      "delete_pantry_item",
      "create_recipe_with_ingredients",
      "update_recipe_with_ingredients",
      "create_shopping_list_with_items",
      "set_shopping_item_status",
    ]) {
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${rpc}\\(`, "i"));
    }
  });

  test("keeps the globally curated catalogue read-only and adoption-authorized", async () => {
    const sql = await source("supabase/migrations/0007_curated_dinner_library.sql");

    for (const table of [
      "curated_recipe_collections",
      "curated_recipes",
      "curated_recipe_ingredients",
      "curated_tags",
      "curated_recipe_tags",
      "curated_recipe_adoptions",
    ]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    }
    expect(sql).toMatch(/curated_collections_published_select/i);
    expect(sql).toMatch(/curated_recipes_published_select/i);
    expect(sql).toMatch(/curated_recipe_ingredients_published_select/i);
    expect(sql).toMatch(/curated_recipe_adoptions_member_select/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/not public\.is_household_member\(p_household_id\)/i);
    expect(sql).toMatch(/and r\.published\s+and c\.published/i);
    expect(sql).toMatch(/revoke all on function public\.adopt_curated_recipe\(uuid, uuid\) from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.adopt_curated_recipe\(uuid, uuid\) to authenticated/i);
    expect(sql).toMatch(/pg_advisory_xact_lock/i);
  });
});

describe("deployment and HTTP hardening contracts", () => {
  test("keeps secret material out of the Docker build context and runtime image", async () => {
    const [dockerfile, compose, dockerignore] = await Promise.all([
      source("Dockerfile"),
      source("docker-compose.yml"),
      source(".dockerignore"),
    ]);

    expect(dockerignore).toContain(".env.*");
    expect(dockerignore).toContain("*.pem");
    expect(dockerignore).toContain("**/secrets/**");
    expect(dockerfile).not.toMatch(/SERVICE_ROLE|SUPABASE_DB|PASSWORD|SECRET/i);
    expect(dockerfile).toContain("USER node");
    expect(compose).toContain('"127.0.0.1:3000:3000"');
    expect(compose).not.toMatch(/SERVICE_ROLE|SUPABASE_DB|PASSWORD|SECRET/i);
  });

  test("configures static browser headers and nonce CSP without advertising Next.js", async () => {
    const [config, proxy] = await Promise.all([
      source("next.config.ts"),
      source("proxy.ts"),
    ]);
    for (const header of [
      "Cross-Origin-Opener-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Strict-Transport-Security",
    ]) {
      expect(config).toContain(header);
    }
    expect(config).toContain("poweredByHeader: false");
    expect(config).not.toContain("Content-Security-Policy");
    expect(proxy).toContain("Content-Security-Policy");
    expect(proxy).toContain("frame-ancestors 'none'");
    expect(proxy).toContain("object-src 'none'");
    expect(proxy).toContain("'strict-dynamic'");
    expect(proxy).not.toContain("'unsafe-inline'");
  });

  test("isolates Playwright on a guarded non-default local server", async () => {
    const [playwright, guard, mvpFlow, extensionFlow] = await Promise.all([
      source("playwright.config.ts"),
      source("tests/e2e/local-project-guard.ts"),
      source("tests/e2e/mvp-flow.spec.ts"),
      source("tests/e2e/extension-import.spec.ts"),
    ]);

    expect(playwright).toContain("const E2E_PORT = 31_073");
    expect(playwright).toContain("reuseExistingServer: false");
    expect(playwright).toContain("--hostname 127.0.0.1 --port ${E2E_PORT}");
    expect(playwright).toContain("assertExpectedLocalSupabaseProject()");
    expect(playwright).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY: localSupabase.anonKey");
    expect(playwright).toContain("NEXT_PUBLIC_SUPABASE_URL: localSupabase.apiUrl");
    expect(guard).toContain('EXPECTED_LOCAL_SUPABASE_PROJECT_ID = "task-3-supabase-docker"');
    expect(guard).toContain('resolve(process.cwd(), "supabase/config.toml")');
    expect(mvpFlow).toContain("assertExpectedLocalSupabaseProject();");
    expect(extensionFlow).toContain("assertExpectedLocalSupabaseProject();");
  });
});
