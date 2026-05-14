# Meal Planner MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local Dockerized Next.js + Supabase MVP for recipe capture, dinner planning, pantry tracking, shopping-list generation, and pantry deduction on meal completion.

**Architecture:** The app is a modular Next.js App Router project backed by local Supabase Auth and Postgres. Household ownership is enforced in app code and database Row Level Security. Domain logic for units, ingredient aggregation, pantry deltas, and meal completion is implemented in focused TypeScript modules with tests before UI wiring.

**Tech Stack:** Next.js, TypeScript, Supabase Auth/Postgres, Supabase CLI local stack, Docker Compose, Vitest, React Testing Library, Playwright, Zod, Cheerio, recipe-scrapers or schema.org JSON-LD parsing helpers, Tailwind CSS.

---

## Execution Mode

Use inline execution in a fresh implementation session. Work through tasks sequentially. Do not batch unrelated tasks. After each task:

1. Run the listed verification command.
2. Commit the task.
3. Update this implementation plan to reflect completed steps and the next active task.
4. Stop briefly and report the result before continuing.

The implementation session should first invoke `superpowers:executing-plans`. When writing application code, invoke `superpowers:test-driven-development` for feature or bugfix tasks.

Never implement directly on `main`. Create an isolated branch or worktree for each feature, fix, or workflow cleanup, then merge back after verification.

## Progress Log

- 2026-05-15: Task 1, Scaffold The Next.js Application, completed and merged via PR #1.
- 2026-05-15: Current next task is Task 2, Add Test Tooling.

## Approved Spec

Source spec: `docs/superpowers/specs/2026-05-13-meal-planner-mvp-design.md`

The plan implements:

- Local Dockerized MVP.
- Next.js + TypeScript + Supabase.
- Supabase Auth and household-centered data model.
- Row Level Security on household-owned tables.
- Recipe manual entry and URL ingestion with editable review.
- Dinner-only weekly planning with expandable meal slots.
- Pantry inventory.
- Safe unit conversion for compatible units.
- Shopping list generated from planned meals minus pantry.
- Meal completion pantry deduction with an idempotent ledger.
- Exportable shopping list.

## File Structure Map

Create this structure:

```text
.
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── pantry/page.tsx
│   │   ├── planner/page.tsx
│   │   ├── recipes/page.tsx
│   │   ├── recipes/new/page.tsx
│   │   ├── recipes/[id]/page.tsx
│   │   └── shopping/page.tsx
│   ├── actions/
│   │   ├── auth.ts
│   │   ├── meal-plans.ts
│   │   ├── pantry.ts
│   │   ├── recipes.ts
│   │   └── shopping.ts
│   ├── api/recipes/ingest/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── app-nav.tsx
│   ├── forms/
│   │   ├── pantry-item-form.tsx
│   │   ├── recipe-form.tsx
│   │   └── url-ingest-form.tsx
│   ├── meal-planner/
│   │   ├── completion-dialog.tsx
│   │   └── weekly-dinner-planner.tsx
│   ├── pantry/
│   │   └── pantry-table.tsx
│   ├── recipes/
│   │   └── recipe-list.tsx
│   └── shopping/
│       └── shopping-list-view.tsx
├── lib/
│   ├── auth/
│   │   ├── household.ts
│   │   └── require-user.ts
│   ├── domain/
│   │   ├── ingredient-aggregation.ts
│   │   ├── pantry-deductions.ts
│   │   ├── pantry-delta.ts
│   │   ├── shopping-export.ts
│   │   └── units.ts
│   ├── recipes/
│   │   ├── parse-ingredient-line.ts
│   │   └── recipe-ingestion.ts
│   ├── supabase/
│   │   ├── browser.ts
│   │   ├── middleware.ts
│   │   ├── server.ts
│   │   └── service.ts
│   └── validation/
│       ├── pantry.ts
│       ├── recipes.ts
│       └── shopping.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 0001_initial_schema.sql
│   ├── seed.sql
│   └── tests/
│       └── rls.sql
├── tests/
│   ├── domain/
│   │   ├── ingredient-aggregation.test.ts
│   │   ├── pantry-deductions.test.ts
│   │   ├── pantry-delta.test.ts
│   │   ├── shopping-export.test.ts
│   │   └── units.test.ts
│   ├── integration/
│   │   ├── recipe-ingestion.test.ts
│   │   └── household-access.test.ts
│   └── e2e/
│       └── mvp-flow.spec.ts
├── docker-compose.yml
├── Dockerfile
├── middleware.ts
├── next.config.ts
├── package.json
├── playwright.config.ts
├── README.md
├── tsconfig.json
└── vitest.config.ts
```

## Task 1: Scaffold The Next.js Application

**Files:**

- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `.gitignore`
- Create: `README.md`

- [x] **Step 1: Generate the app scaffold**

Run:

```bash
npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir false --import-alias "@/*"
```

Expected: project files are created in the repo root. If the command refuses because the directory is not empty, create a temporary directory with the same command and copy only the generated app/tooling files into this repo, preserving `docs/`.

- [x] **Step 2: Install MVP dependencies**

Run:

```bash
npm install @supabase/ssr @supabase/supabase-js zod cheerio
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event playwright @playwright/test
```

Expected: dependencies are added to `package.json` and `package-lock.json`.

- [x] **Step 3: Ensure core scripts exist**

Edit `package.json` scripts to include:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "supabase:reset": "supabase db reset",
    "typecheck": "tsc --noEmit"
  }
}
```

- [x] **Step 4: Add minimal landing route**

Set `app/page.tsx`:

```tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 px-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Meal Planner
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-slate-950">
          Plan dinners, track your pantry, and generate shopping lists.
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">
          A local-first MVP for managing recipes, weekly dinners, pantry stock,
          and the gap between what you have and what you need.
        </p>
      </div>
      <div className="flex gap-3">
        <Link className="rounded-md bg-emerald-700 px-4 py-2 text-white" href="/login">
          Log in
        </Link>
        <Link className="rounded-md border border-slate-300 px-4 py-2" href="/signup">
          Create account
        </Link>
      </div>
    </main>
  );
}
```

- [x] **Step 5: Verify scaffold**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both commands pass.

- [x] **Step 6: Commit**

Run:

```bash
git add package.json package-lock.json next.config.ts tsconfig.json app .gitignore README.md
git commit -m "chore: scaffold Next.js meal planner app"
```

## Task 2: Add Test Tooling

**Files:**

- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `playwright.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Create Vitest config**

Create `vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
});
```

- [ ] **Step 2: Create test setup**

Create `tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Create Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 13"] } },
  ],
});
```

- [ ] **Step 4: Add a smoke test**

Create `tests/e2e/mvp-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("landing page exposes auth entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /plan dinners/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /log in/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /create account/i })).toBeVisible();
});
```

- [ ] **Step 5: Verify tests**

Run:

```bash
npm run test
npm run test:e2e
```

Expected: Vitest runs with no tests or passing setup; Playwright smoke test passes.

- [ ] **Step 6: Commit**

Run:

```bash
git add vitest.config.ts playwright.config.ts tests package.json package-lock.json
git commit -m "test: add Vitest and Playwright setup"
```

## Task 3: Add Local Supabase And Docker Setup

**Files:**

- Create: `supabase/config.toml`
- Create: `.env.example`
- Create: `.env.local`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Modify: `README.md`

- [ ] **Step 1: Initialize Supabase local files**

Run:

```bash
npx supabase init
```

Expected: `supabase/config.toml` exists.

- [ ] **Step 2: Start Supabase locally**

Run:

```bash
npx supabase start
```

Expected: local API URL, anon key, service role key, and database URL are printed. Copy only local development values into `.env.local`.

- [ ] **Step 3: Add environment templates**

Create `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-local-service-role-key
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Create `.env.local` with the values printed by `npx supabase start`. Never commit `.env.local`.

- [ ] **Step 4: Add Dockerfile**

Create `Dockerfile`:

```Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 5: Configure standalone output**

Modify `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 6: Add app Docker Compose service**

Create `docker-compose.yml`:

```yaml
services:
  web:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    environment:
      NODE_ENV: production
```

- [ ] **Step 7: Update ignore rules**

Ensure `.gitignore` includes:

```gitignore
.env
.env.local
.env.*.local
.next
node_modules
test-results
playwright-report
```

- [ ] **Step 8: Verify local setup**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add supabase/config.toml .env.example Dockerfile docker-compose.yml next.config.ts .gitignore README.md package.json package-lock.json
git commit -m "chore: add local Supabase and Docker setup"
```

## Task 4: Create Database Schema And RLS Policies

**Files:**

- Create: `supabase/migrations/0001_initial_schema.sql`
- Create: `supabase/seed.sql`
- Create: `supabase/tests/rls.sql`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/0001_initial_schema.sql`:

```sql
create extension if not exists "pgcrypto";

create type household_role as enum ('owner', 'member');
create type meal_plan_status as enum ('planned', 'completed', 'skipped');
create type shopping_list_status as enum ('draft', 'active', 'archived');
create type shopping_item_status as enum ('needed', 'checked', 'dismissed');
create type ingestion_status as enum ('manual', 'parsed', 'needs_review', 'failed');
create type deduction_status as enum ('applied', 'reversed', 'review_required');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_memberships (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role household_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.meal_slots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  description text,
  source_url text,
  favorite boolean not null default false,
  servings numeric,
  instructions text not null default '',
  ingestion_status ingestion_status not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  item_name text not null,
  quantity numeric,
  unit text,
  notes text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_slot_id uuid not null references public.meal_slots(id),
  recipe_id uuid not null references public.recipes(id),
  planned_for date not null,
  status meal_plan_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, meal_slot_id, planned_for)
);

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_name text not null,
  quantity numeric not null default 0,
  unit text not null,
  category text,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pantry_deductions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_plan_entry_id uuid not null references public.meal_plan_entries(id) on delete cascade,
  pantry_item_id uuid references public.pantry_items(id) on delete set null,
  recipe_ingredient_id uuid not null references public.recipe_ingredients(id),
  item_name text not null,
  quantity numeric not null,
  unit text not null,
  status deduction_status not null default 'applied',
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique (meal_plan_entry_id, recipe_ingredient_id)
);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status shopping_list_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  item_name text not null,
  required_quantity numeric,
  pantry_quantity numeric,
  delta_quantity numeric,
  unit text,
  status shopping_item_status not null default 'needed',
  review_required boolean not null default false,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_household_memberships_user_id on public.household_memberships(user_id);
create index idx_recipes_household_id on public.recipes(household_id);
create index idx_meal_plan_entries_household_date on public.meal_plan_entries(household_id, planned_for);
create index idx_pantry_items_household_id on public.pantry_items(household_id);
create index idx_shopping_lists_household_id on public.shopping_lists(household_id);

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_memberships hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  dinner_slot_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into public.households (name)
  values ('My Household')
  returning id into new_household_id;

  insert into public.household_memberships (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');

  insert into public.meal_slots (household_id, name, sort_order, is_default)
  values (new_household_id, 'Dinner', 10, true)
  returning id into dinner_slot_id;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_memberships enable row level security;
alter table public.meal_slots enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.pantry_items enable row level security;
alter table public.pantry_deductions enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.shopping_providers enable row level security;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "households_member_select" on public.households for select using (public.is_household_member(id));
create policy "households_member_update" on public.households for update using (public.is_household_member(id)) with check (public.is_household_member(id));

create policy "memberships_member_select" on public.household_memberships for select using (public.is_household_member(household_id));

create policy "meal_slots_member_all" on public.meal_slots for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "recipes_member_all" on public.recipes for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "recipe_ingredients_member_all" on public.recipe_ingredients for all
using (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_household_member(r.household_id)
  )
)
with check (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_household_member(r.household_id)
  )
);

create policy "meal_plan_entries_member_all" on public.meal_plan_entries for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "pantry_items_member_all" on public.pantry_items for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "pantry_deductions_member_all" on public.pantry_deductions for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "shopping_lists_member_all" on public.shopping_lists for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "shopping_list_items_member_all" on public.shopping_list_items for all
using (
  exists (
    select 1 from public.shopping_lists sl
    where sl.id = shopping_list_id and public.is_household_member(sl.household_id)
  )
)
with check (
  exists (
    select 1 from public.shopping_lists sl
    where sl.id = shopping_list_id and public.is_household_member(sl.household_id)
  )
);

create policy "shopping_providers_read" on public.shopping_providers for select using (true);
```

- [ ] **Step 2: Add seed data**

Create `supabase/seed.sql`:

```sql
insert into public.shopping_providers (code, name, enabled)
values
  ('coles', 'Coles', false),
  ('woolworths', 'Woolworths', false),
  ('generic', 'Generic grocery export', false)
on conflict (code) do nothing;
```

- [ ] **Step 3: Add RLS smoke checks**

Create `supabase/tests/rls.sql`:

```sql
-- Run manually against the local database after creating two test users.
-- Expected result: authenticated users can only see rows in households where
-- they have a household_memberships row. Service-role access is not covered by
-- RLS and must never be exposed to browser code.

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

- [ ] **Step 4: Reset local database**

Run:

```bash
npx supabase db reset
```

Expected: migration and seed apply cleanly.

- [ ] **Step 5: Commit**

Run:

```bash
git add supabase
git commit -m "feat: add household database schema and RLS"
```

## Task 5: Add Supabase Clients And Auth Guard

**Files:**

- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/service.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `middleware.ts`
- Create: `lib/auth/require-user.ts`
- Create: `lib/auth/household.ts`

- [ ] **Step 1: Add browser client**

Create `lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Add server client**

Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
}
```

- [ ] **Step 3: Add service-role client**

Create `lib/supabase/service.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required on the server");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
```

- [ ] **Step 4: Add middleware client**

Create `lib/supabase/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isAppRoute = pathname.startsWith("/dashboard")
    || pathname.startsWith("/recipes")
    || pathname.startsWith("/pantry")
    || pathname.startsWith("/planner")
    || pathname.startsWith("/shopping");

  if (isAppRoute && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
```

- [ ] **Step 5: Add root middleware**

Create `middleware.ts`:

```ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 6: Add auth helpers**

Create `lib/auth/require-user.ts`:

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return data.user;
}
```

Create `lib/auth/household.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";

export type HouseholdContext = {
  userId: string;
  householdId: string;
};

export async function requireHousehold(): Promise<HouseholdContext> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("household_memberships")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("No household membership found for the current user");
  }

  return {
    userId: user.id,
    householdId: data.household_id,
  };
}
```

- [ ] **Step 7: Verify**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add lib middleware.ts
git commit -m "feat: add Supabase auth clients and household guard"
```

## Task 6: Implement Auth Pages And App Shell

**Files:**

- Create: `app/actions/auth.ts`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/signup/page.tsx`
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/dashboard/page.tsx`
- Create: `components/app-nav.tsx`

- [ ] **Step 1: Add auth actions**

Create `app/actions/auth.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/login?error=invalid_credentials");
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) {
    redirect("/signup?error=signup_failed");
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
```

- [ ] **Step 2: Add login page**

Create `app/(auth)/login/page.tsx` with a form that posts to `signIn`, using email and password fields and a link to `/signup`.

- [ ] **Step 3: Add signup page**

Create `app/(auth)/signup/page.tsx` with a form that posts to `signUp`, using display name, email, and password fields and a link to `/login`.

- [ ] **Step 4: Add app navigation**

Create `components/app-nav.tsx`:

```tsx
import Link from "next/link";
import { signOut } from "@/app/actions/auth";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/recipes", label: "Recipes" },
  { href: "/planner", label: "Planner" },
  { href: "/pantry", label: "Pantry" },
  { href: "/shopping", label: "Shopping" },
];

export function AppNav() {
  return (
    <nav className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
      <Link className="font-semibold text-slate-950" href="/dashboard">
        Meal Planner
      </Link>
      <div className="flex items-center gap-4">
        {links.map((link) => (
          <Link className="text-sm text-slate-700 hover:text-slate-950" href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
        <form action={signOut}>
          <button className="text-sm text-slate-700 hover:text-slate-950" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
```

- [ ] **Step 5: Add protected layout**

Create `app/(app)/layout.tsx`:

```tsx
import { AppNav } from "@/components/app-nav";
import { requireHousehold } from "@/lib/auth/household";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireHousehold();

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 6: Add dashboard**

Create `app/(app)/dashboard/page.tsx` with links to Recipes, Planner, Pantry, and Shopping and short current-MVP labels.

- [ ] **Step 7: Verify**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add app components
git commit -m "feat: add authentication pages and app shell"
```

## Task 7: Implement Unit Conversion Domain Logic

**Files:**

- Create: `tests/domain/units.test.ts`
- Create: `lib/domain/units.ts`

- [ ] **Step 1: Write failing unit tests**

Create `tests/domain/units.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { convertQuantity, normalizeUnit } from "@/lib/domain/units";

describe("unit conversion", () => {
  it("normalizes supported unit aliases", () => {
    expect(normalizeUnit("grams")).toBe("g");
    expect(normalizeUnit("KG")).toBe("kg");
    expect(normalizeUnit("litres")).toBe("l");
    expect(normalizeUnit("tablespoons")).toBe("tbsp");
  });

  it("converts mass within the same dimension", () => {
    expect(convertQuantity(1.5, "kg", "g")).toEqual({ ok: true, quantity: 1500, unit: "g" });
    expect(convertQuantity(500, "g", "kg")).toEqual({ ok: true, quantity: 0.5, unit: "kg" });
  });

  it("converts volume within the same dimension", () => {
    expect(convertQuantity(2, "l", "ml")).toEqual({ ok: true, quantity: 2000, unit: "ml" });
    expect(convertQuantity(3, "tbsp", "tsp")).toEqual({ ok: true, quantity: 9, unit: "tsp" });
  });

  it("rejects ambiguous conversions", () => {
    expect(convertQuantity(1, "each", "g")).toEqual({
      ok: false,
      reason: "Cannot convert each to g",
    });
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm run test -- tests/domain/units.test.ts
```

Expected: fail because `lib/domain/units.ts` does not exist.

- [ ] **Step 3: Implement units module**

Create `lib/domain/units.ts`:

```ts
export type UnitDimension = "mass" | "volume" | "count";

type UnitDefinition = {
  canonical: string;
  dimension: UnitDimension;
  toBase: number;
};

const units: Record<string, UnitDefinition> = {
  g: { canonical: "g", dimension: "mass", toBase: 1 },
  gram: { canonical: "g", dimension: "mass", toBase: 1 },
  grams: { canonical: "g", dimension: "mass", toBase: 1 },
  kg: { canonical: "kg", dimension: "mass", toBase: 1000 },
  kilogram: { canonical: "kg", dimension: "mass", toBase: 1000 },
  kilograms: { canonical: "kg", dimension: "mass", toBase: 1000 },
  ml: { canonical: "ml", dimension: "volume", toBase: 1 },
  millilitre: { canonical: "ml", dimension: "volume", toBase: 1 },
  millilitres: { canonical: "ml", dimension: "volume", toBase: 1 },
  l: { canonical: "l", dimension: "volume", toBase: 1000 },
  litre: { canonical: "l", dimension: "volume", toBase: 1000 },
  litres: { canonical: "l", dimension: "volume", toBase: 1000 },
  tsp: { canonical: "tsp", dimension: "volume", toBase: 5 },
  teaspoon: { canonical: "tsp", dimension: "volume", toBase: 5 },
  teaspoons: { canonical: "tsp", dimension: "volume", toBase: 5 },
  tbsp: { canonical: "tbsp", dimension: "volume", toBase: 15 },
  tablespoon: { canonical: "tbsp", dimension: "volume", toBase: 15 },
  tablespoons: { canonical: "tbsp", dimension: "volume", toBase: 15 },
  each: { canonical: "each", dimension: "count", toBase: 1 },
};

export type ConversionResult =
  | { ok: true; quantity: number; unit: string }
  | { ok: false; reason: string };

export function normalizeUnit(unit: string | null | undefined): string {
  const key = String(unit ?? "").trim().toLowerCase();
  return units[key]?.canonical ?? key;
}

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): ConversionResult {
  const from = units[String(fromUnit).trim().toLowerCase()];
  const to = units[String(toUnit).trim().toLowerCase()];

  if (!from || !to || from.dimension !== to.dimension) {
    return { ok: false, reason: `Cannot convert ${fromUnit} to ${toUnit}` };
  }

  const baseQuantity = quantity * from.toBase;
  return {
    ok: true,
    quantity: Number((baseQuantity / to.toBase).toFixed(4)),
    unit: to.canonical,
  };
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- tests/domain/units.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/domain/units.test.ts lib/domain/units.ts
git commit -m "feat: add safe unit conversion rules"
```

## Task 8: Implement Ingredient Aggregation And Pantry Delta

**Files:**

- Create: `tests/domain/ingredient-aggregation.test.ts`
- Create: `tests/domain/pantry-delta.test.ts`
- Create: `lib/domain/ingredient-aggregation.ts`
- Create: `lib/domain/pantry-delta.ts`

- [ ] **Step 1: Write aggregation tests**

Create `tests/domain/ingredient-aggregation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregateIngredients } from "@/lib/domain/ingredient-aggregation";

describe("aggregateIngredients", () => {
  it("groups ingredients by normalized item name and compatible unit", () => {
    const result = aggregateIngredients([
      { itemName: "Chicken Breast", quantity: 500, unit: "g" },
      { itemName: "chicken breast", quantity: 0.5, unit: "kg" },
      { itemName: "Rice", quantity: 1, unit: "kg" },
    ]);

    expect(result).toEqual([
      { itemName: "chicken breast", quantity: 1000, unit: "g", reviewRequired: false },
      { itemName: "rice", quantity: 1, unit: "kg", reviewRequired: false },
    ]);
  });
});
```

- [ ] **Step 2: Write pantry delta tests**

Create `tests/domain/pantry-delta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculatePantryDelta } from "@/lib/domain/pantry-delta";

describe("calculatePantryDelta", () => {
  it("subtracts matching pantry items with safe conversion", () => {
    const result = calculatePantryDelta({
      required: [{ itemName: "rice", quantity: 1000, unit: "g", reviewRequired: false }],
      pantry: [{ id: "p1", itemName: "Rice", quantity: 0.25, unit: "kg" }],
    });

    expect(result).toEqual([
      {
        itemName: "rice",
        requiredQuantity: 1000,
        pantryQuantity: 250,
        deltaQuantity: 750,
        unit: "g",
        reviewRequired: false,
        reviewReason: null,
        pantryItemId: "p1",
      },
    ]);
  });

  it("flags ambiguous unit mismatches", () => {
    const result = calculatePantryDelta({
      required: [{ itemName: "onion", quantity: 1, unit: "each", reviewRequired: false }],
      pantry: [{ id: "p1", itemName: "onion", quantity: 300, unit: "g" }],
    });

    expect(result[0]).toMatchObject({
      itemName: "onion",
      reviewRequired: true,
      reviewReason: "Cannot convert g to each",
    });
  });
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
npm run test -- tests/domain/ingredient-aggregation.test.ts tests/domain/pantry-delta.test.ts
```

Expected: fail because implementation files do not exist.

- [ ] **Step 4: Implement aggregation**

Create `lib/domain/ingredient-aggregation.ts`:

```ts
import { convertQuantity, normalizeUnit } from "@/lib/domain/units";

export type IngredientInput = {
  itemName: string;
  quantity: number | null;
  unit: string | null;
};

export type AggregatedIngredient = {
  itemName: string;
  quantity: number | null;
  unit: string | null;
  reviewRequired: boolean;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function aggregateIngredients(ingredients: IngredientInput[]): AggregatedIngredient[] {
  const grouped = new Map<string, AggregatedIngredient>();

  for (const ingredient of ingredients) {
    const itemName = normalizeName(ingredient.itemName);
    const unit = ingredient.unit ? normalizeUnit(ingredient.unit) : null;
    const key = itemName;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        itemName,
        quantity: ingredient.quantity,
        unit,
        reviewRequired: ingredient.quantity === null || unit === null,
      });
      continue;
    }

    if (existing.quantity === null || ingredient.quantity === null || !existing.unit || !unit) {
      existing.reviewRequired = true;
      continue;
    }

    const converted = convertQuantity(ingredient.quantity, unit, existing.unit);
    if (!converted.ok) {
      existing.reviewRequired = true;
      continue;
    }

    existing.quantity = Number((existing.quantity + converted.quantity).toFixed(4));
  }

  return Array.from(grouped.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
}
```

- [ ] **Step 5: Implement pantry delta**

Create `lib/domain/pantry-delta.ts`:

```ts
import type { AggregatedIngredient } from "@/lib/domain/ingredient-aggregation";
import { convertQuantity } from "@/lib/domain/units";

export type PantryItemInput = {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
};

export type PantryDeltaItem = {
  itemName: string;
  requiredQuantity: number | null;
  pantryQuantity: number | null;
  deltaQuantity: number | null;
  unit: string | null;
  reviewRequired: boolean;
  reviewReason: string | null;
  pantryItemId: string | null;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function calculatePantryDelta(input: {
  required: AggregatedIngredient[];
  pantry: PantryItemInput[];
}): PantryDeltaItem[] {
  return input.required.map((required) => {
    const matches = input.pantry.filter((item) => normalizeName(item.itemName) === required.itemName);

    if (matches.length === 0) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: 0,
        deltaQuantity: required.quantity,
        unit: required.unit,
        reviewRequired: required.reviewRequired,
        reviewReason: required.reviewRequired ? "Ingredient requires review" : null,
        pantryItemId: null,
      };
    }

    if (matches.length > 1) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: null,
        deltaQuantity: required.quantity,
        unit: required.unit,
        reviewRequired: true,
        reviewReason: "Multiple pantry matches",
        pantryItemId: null,
      };
    }

    const pantryItem = matches[0];
    if (required.quantity === null || !required.unit) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: pantryItem.quantity,
        deltaQuantity: null,
        unit: required.unit,
        reviewRequired: true,
        reviewReason: "Missing required quantity or unit",
        pantryItemId: pantryItem.id,
      };
    }

    const converted = convertQuantity(pantryItem.quantity, pantryItem.unit, required.unit);
    if (!converted.ok) {
      return {
        itemName: required.itemName,
        requiredQuantity: required.quantity,
        pantryQuantity: pantryItem.quantity,
        deltaQuantity: required.quantity,
        unit: required.unit,
        reviewRequired: true,
        reviewReason: converted.reason,
        pantryItemId: pantryItem.id,
      };
    }

    return {
      itemName: required.itemName,
      requiredQuantity: required.quantity,
      pantryQuantity: converted.quantity,
      deltaQuantity: Math.max(0, Number((required.quantity - converted.quantity).toFixed(4))),
      unit: required.unit,
      reviewRequired: required.reviewRequired,
      reviewReason: required.reviewRequired ? "Ingredient requires review" : null,
      pantryItemId: pantryItem.id,
    };
  });
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test -- tests/domain/ingredient-aggregation.test.ts tests/domain/pantry-delta.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add tests/domain lib/domain/ingredient-aggregation.ts lib/domain/pantry-delta.ts
git commit -m "feat: calculate pantry delta from planned ingredients"
```

## Task 9: Implement Meal Completion Deduction Logic

**Files:**

- Create: `tests/domain/pantry-deductions.test.ts`
- Create: `lib/domain/pantry-deductions.ts`

- [ ] **Step 1: Write failing deduction tests**

Create `tests/domain/pantry-deductions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDeductionPlan } from "@/lib/domain/pantry-deductions";

describe("buildDeductionPlan", () => {
  it("deducts clean matches once", () => {
    const result = buildDeductionPlan({
      mealPlanEntryId: "meal-1",
      existingDeductions: [],
      ingredients: [{ id: "ri-1", itemName: "rice", quantity: 500, unit: "g" }],
      pantry: [{ id: "p1", itemName: "rice", quantity: 1, unit: "kg" }],
    });

    expect(result).toEqual([
      {
        mealPlanEntryId: "meal-1",
        recipeIngredientId: "ri-1",
        pantryItemId: "p1",
        itemName: "rice",
        quantity: 0.5,
        unit: "kg",
        reviewRequired: false,
        reviewReason: null,
      },
    ]);
  });

  it("does not double deduct an already deducted ingredient", () => {
    const result = buildDeductionPlan({
      mealPlanEntryId: "meal-1",
      existingDeductions: [{ recipeIngredientId: "ri-1" }],
      ingredients: [{ id: "ri-1", itemName: "rice", quantity: 500, unit: "g" }],
      pantry: [{ id: "p1", itemName: "rice", quantity: 1, unit: "kg" }],
    });

    expect(result).toEqual([]);
  });

  it("flags ambiguous conversions for review", () => {
    const result = buildDeductionPlan({
      mealPlanEntryId: "meal-1",
      existingDeductions: [],
      ingredients: [{ id: "ri-1", itemName: "onion", quantity: 1, unit: "each" }],
      pantry: [{ id: "p1", itemName: "onion", quantity: 300, unit: "g" }],
    });

    expect(result[0]).toMatchObject({
      reviewRequired: true,
      reviewReason: "Cannot convert each to g",
    });
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm run test -- tests/domain/pantry-deductions.test.ts
```

Expected: fail because implementation file does not exist.

- [ ] **Step 3: Implement deduction planner**

Create `lib/domain/pantry-deductions.ts`:

```ts
import { convertQuantity } from "@/lib/domain/units";

export type DeductionIngredient = {
  id: string;
  itemName: string;
  quantity: number | null;
  unit: string | null;
};

export type DeductionPantryItem = {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
};

export type ExistingDeduction = {
  recipeIngredientId: string;
};

export type DeductionPlanItem = {
  mealPlanEntryId: string;
  recipeIngredientId: string;
  pantryItemId: string | null;
  itemName: string;
  quantity: number | null;
  unit: string | null;
  reviewRequired: boolean;
  reviewReason: string | null;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function buildDeductionPlan(input: {
  mealPlanEntryId: string;
  existingDeductions: ExistingDeduction[];
  ingredients: DeductionIngredient[];
  pantry: DeductionPantryItem[];
}): DeductionPlanItem[] {
  const alreadyDeducted = new Set(input.existingDeductions.map((item) => item.recipeIngredientId));

  return input.ingredients
    .filter((ingredient) => !alreadyDeducted.has(ingredient.id))
    .map((ingredient) => {
      const matches = input.pantry.filter((item) => normalizeName(item.itemName) === normalizeName(ingredient.itemName));

      if (matches.length !== 1) {
        return {
          mealPlanEntryId: input.mealPlanEntryId,
          recipeIngredientId: ingredient.id,
          pantryItemId: null,
          itemName: normalizeName(ingredient.itemName),
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          reviewRequired: true,
          reviewReason: matches.length === 0 ? "No pantry match" : "Multiple pantry matches",
        };
      }

      const pantryItem = matches[0];
      if (ingredient.quantity === null || !ingredient.unit) {
        return {
          mealPlanEntryId: input.mealPlanEntryId,
          recipeIngredientId: ingredient.id,
          pantryItemId: pantryItem.id,
          itemName: normalizeName(ingredient.itemName),
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          reviewRequired: true,
          reviewReason: "Missing ingredient quantity or unit",
        };
      }

      const converted = convertQuantity(ingredient.quantity, ingredient.unit, pantryItem.unit);
      if (!converted.ok) {
        return {
          mealPlanEntryId: input.mealPlanEntryId,
          recipeIngredientId: ingredient.id,
          pantryItemId: pantryItem.id,
          itemName: normalizeName(ingredient.itemName),
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          reviewRequired: true,
          reviewReason: converted.reason,
        };
      }

      return {
        mealPlanEntryId: input.mealPlanEntryId,
        recipeIngredientId: ingredient.id,
        pantryItemId: pantryItem.id,
        itemName: normalizeName(ingredient.itemName),
        quantity: converted.quantity,
        unit: pantryItem.unit,
        reviewRequired: false,
        reviewReason: null,
      };
    });
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- tests/domain/pantry-deductions.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/domain/pantry-deductions.test.ts lib/domain/pantry-deductions.ts
git commit -m "feat: plan idempotent pantry deductions"
```

## Task 10: Implement Recipe Validation And Ingestion

**Files:**

- Create: `lib/validation/recipes.ts`
- Create: `lib/recipes/parse-ingredient-line.ts`
- Create: `lib/recipes/recipe-ingestion.ts`
- Create: `tests/integration/recipe-ingestion.test.ts`
- Create: `app/api/recipes/ingest/route.ts`

- [ ] **Step 1: Write ingestion tests**

Create `tests/integration/recipe-ingestion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRecipeHtml } from "@/lib/recipes/recipe-ingestion";

describe("parseRecipeHtml", () => {
  it("extracts JSON-LD recipe fields", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@type": "Recipe",
          "name": "Lemon Chicken",
          "recipeYield": "4 servings",
          "recipeIngredient": ["500g chicken breast", "1 lemon"],
          "recipeInstructions": [
            { "@type": "HowToStep", "text": "Cook chicken." },
            { "@type": "HowToStep", "text": "Add lemon." }
          ]
        }
      </script>
    `;

    expect(parseRecipeHtml(html, "https://example.test/lemon-chicken")).toEqual({
      title: "Lemon Chicken",
      sourceUrl: "https://example.test/lemon-chicken",
      servings: 4,
      ingredients: [
        { itemName: "chicken breast", quantity: 500, unit: "g", notes: null },
        { itemName: "lemon", quantity: 1, unit: "each", notes: null },
      ],
      instructions: "Cook chicken.\n\nAdd lemon.",
      ingestionStatus: "parsed",
    });
  });

  it("returns needs_review when structured recipe data is missing", () => {
    expect(parseRecipeHtml("<html><title>No recipe</title></html>", "https://example.test")).toMatchObject({
      sourceUrl: "https://example.test",
      ingestionStatus: "needs_review",
      ingredients: [],
    });
  });
});
```

- [ ] **Step 2: Implement recipe validation**

Create `lib/validation/recipes.ts`:

```ts
import { z } from "zod";

export const recipeIngredientSchema = z.object({
  itemName: z.string().min(1),
  quantity: z.coerce.number().positive().nullable(),
  unit: z.string().min(1).nullable(),
  notes: z.string().nullable().optional(),
});

export const recipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  favorite: z.boolean().default(false),
  servings: z.coerce.number().positive().nullable().optional(),
  instructions: z.string().default(""),
  ingredients: z.array(recipeIngredientSchema).min(1),
});
```

- [ ] **Step 3: Implement ingredient line parser**

Create `lib/recipes/parse-ingredient-line.ts`:

```ts
import { normalizeUnit } from "@/lib/domain/units";

const numberPattern = /^(\d+(?:\.\d+)?|\d+\/\d+)\s*([a-zA-Z]+)?\s+(.+)$/;

function parseNumber(raw: string): number {
  if (raw.includes("/")) {
    const [left, right] = raw.split("/").map(Number);
    return Number((left / right).toFixed(4));
  }
  return Number(raw);
}

export function parseIngredientLine(line: string) {
  const trimmed = line.trim();
  const match = trimmed.match(numberPattern);

  if (!match) {
    return {
      itemName: trimmed.toLowerCase(),
      quantity: null,
      unit: null,
      notes: null,
    };
  }

  const [, rawQuantity, rawUnit, rawName] = match;
  const unit = rawUnit ? normalizeUnit(rawUnit) : "each";

  return {
    itemName: rawName.trim().toLowerCase(),
    quantity: parseNumber(rawQuantity),
    unit,
    notes: null,
  };
}
```

- [ ] **Step 4: Implement recipe ingestion parser**

Create `lib/recipes/recipe-ingestion.ts`:

```ts
import * as cheerio from "cheerio";
import { parseIngredientLine } from "@/lib/recipes/parse-ingredient-line";

type ParsedRecipe = {
  title: string;
  sourceUrl: string;
  servings: number | null;
  ingredients: Array<{
    itemName: string;
    quantity: number | null;
    unit: string | null;
    notes: string | null;
  }>;
  instructions: string;
  ingestionStatus: "parsed" | "needs_review" | "failed";
};

function flattenJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (value && typeof value === "object" && "@graph" in value) {
    return flattenJsonLd((value as { "@graph": unknown })["@graph"]);
  }
  return [value];
}

function isRecipe(node: unknown) {
  if (!node || typeof node !== "object") return false;
  const type = (node as { "@type"?: string | string[] })["@type"];
  return Array.isArray(type) ? type.includes("Recipe") : type === "Recipe";
}

function parseServings(raw: unknown): number | null {
  const text = Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parseInstructions(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw
      .map((step) => (typeof step === "string" ? step : String((step as { text?: unknown }).text ?? "")))
      .filter(Boolean)
      .join("\n\n");
  }
  return String(raw ?? "");
}

export function parseRecipeHtml(html: string, sourceUrl: string): ParsedRecipe {
  const $ = cheerio.load(html);
  const nodes = $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((script) => {
      try {
        return flattenJsonLd(JSON.parse($(script).text()));
      } catch {
        return [];
      }
    });

  const recipe = nodes.find(isRecipe) as Record<string, unknown> | undefined;
  if (!recipe) {
    return {
      title: $("title").text() || "Untitled recipe",
      sourceUrl,
      servings: null,
      ingredients: [],
      instructions: "",
      ingestionStatus: "needs_review",
    };
  }

  const ingredients = Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient.map((line) => parseIngredientLine(String(line)))
    : [];

  return {
    title: String(recipe.name ?? "Untitled recipe"),
    sourceUrl,
    servings: parseServings(recipe.recipeYield),
    ingredients,
    instructions: parseInstructions(recipe.recipeInstructions),
    ingestionStatus: ingredients.length > 0 ? "parsed" : "needs_review",
  };
}
```

- [ ] **Step 5: Add ingestion route**

Create `app/api/recipes/ingest/route.ts`:

```ts
import { NextResponse } from "next/server";
import { parseRecipeHtml } from "@/lib/recipes/recipe-ingestion";
import { requireHousehold } from "@/lib/auth/household";

export async function POST(request: Request) {
  await requireHousehold();
  const { url } = await request.json();

  if (typeof url !== "string" || !url.startsWith("http")) {
    return NextResponse.json({ error: "A valid recipe URL is required" }, { status: 400 });
  }

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    return NextResponse.json(
      {
        title: "Untitled recipe",
        sourceUrl: url,
        servings: null,
        ingredients: [],
        instructions: "",
        ingestionStatus: "failed",
      },
      { status: 200 },
    );
  }

  const html = await response.text();
  return NextResponse.json(parseRecipeHtml(html, url));
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test -- tests/integration/recipe-ingestion.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add lib/validation/recipes.ts lib/recipes app/api/recipes/ingest tests/integration/recipe-ingestion.test.ts
git commit -m "feat: parse recipes from structured webpage data"
```

## Task 11: Implement Recipe CRUD UI

**Files:**

- Create: `app/actions/recipes.ts`
- Create: `components/forms/recipe-form.tsx`
- Create: `components/forms/url-ingest-form.tsx`
- Create: `components/recipes/recipe-list.tsx`
- Create: `app/(app)/recipes/page.tsx`
- Create: `app/(app)/recipes/new/page.tsx`
- Create: `app/(app)/recipes/[id]/page.tsx`

- [ ] **Step 1: Add recipe server actions**

Create `app/actions/recipes.ts` with actions:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";

export async function createRecipe(formData: FormData) {
  const { householdId } = await requireHousehold();
  const supabase = await createClient();

  const ingredientNames = formData.getAll("ingredientName").map(String);
  const quantities = formData.getAll("ingredientQuantity").map(String);
  const units = formData.getAll("ingredientUnit").map(String);

  const { data: recipe, error } = await supabase
    .from("recipes")
    .insert({
      household_id: householdId,
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      source_url: String(formData.get("sourceUrl") ?? "") || null,
      favorite: formData.get("favorite") === "on",
      servings: Number(formData.get("servings") || 0) || null,
      instructions: String(formData.get("instructions") ?? ""),
      ingestion_status: String(formData.get("ingestionStatus") ?? "manual"),
    })
    .select("id")
    .single();

  if (error || !recipe) throw new Error("Failed to create recipe");

  const ingredients = ingredientNames
    .map((name, index) => ({
      recipe_id: recipe.id,
      item_name: name,
      quantity: Number(quantities[index] || 0) || null,
      unit: units[index] || null,
      display_order: index,
    }))
    .filter((item) => item.item_name.trim().length > 0);

  if (ingredients.length > 0) {
    const { error: ingredientError } = await supabase.from("recipe_ingredients").insert(ingredients);
    if (ingredientError) throw new Error("Failed to create recipe ingredients");
  }

  revalidatePath("/recipes");
  redirect(`/recipes/${recipe.id}`);
}
```

- [ ] **Step 2: Add recipe form**

Create `components/forms/recipe-form.tsx` as a server-compatible form using `createRecipe`. Include fields for title, source URL, favorite, servings, instructions, and at least five ingredient rows.

- [ ] **Step 3: Add URL ingest form**

Create `components/forms/url-ingest-form.tsx` as a client component. It posts to `/api/recipes/ingest`, then fills hidden/default form fields or displays extracted data for copy into the recipe form.

- [ ] **Step 4: Add recipe list**

Create `components/recipes/recipe-list.tsx` that renders recipe title, favorite status, source link if present, and link to details.

- [ ] **Step 5: Add recipe pages**

Create:

- `app/(app)/recipes/page.tsx`: lists recipes for current household.
- `app/(app)/recipes/new/page.tsx`: renders URL ingest form and manual recipe form.
- `app/(app)/recipes/[id]/page.tsx`: shows recipe details, ingredients, instructions, source URL.

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add app/actions/recipes.ts app/\(app\)/recipes components/forms components/recipes
git commit -m "feat: add recipe capture and library UI"
```

## Task 12: Implement Pantry CRUD UI

**Files:**

- Create: `lib/validation/pantry.ts`
- Create: `app/actions/pantry.ts`
- Create: `components/forms/pantry-item-form.tsx`
- Create: `components/pantry/pantry-table.tsx`
- Create: `app/(app)/pantry/page.tsx`

- [ ] **Step 1: Add pantry validation**

Create `lib/validation/pantry.ts`:

```ts
import { z } from "zod";

export const pantryItemSchema = z.object({
  itemName: z.string().min(1),
  quantity: z.coerce.number().min(0),
  unit: z.string().min(1),
  category: z.string().optional(),
  expiryDate: z.string().optional(),
});
```

- [ ] **Step 2: Add pantry actions**

Create `app/actions/pantry.ts` with `createPantryItem`, `updatePantryItem`, and `deletePantryItem`. Each action must call `requireHousehold()`, include `household_id` in filters or inserts, and revalidate `/pantry`.

- [ ] **Step 3: Add pantry form**

Create `components/forms/pantry-item-form.tsx` with item name, quantity, unit, category, and expiry date fields.

- [ ] **Step 4: Add pantry table**

Create `components/pantry/pantry-table.tsx` with item name, quantity, unit, category, expiry date, and delete action.

- [ ] **Step 5: Add pantry page**

Create `app/(app)/pantry/page.tsx` that loads pantry items for the current household and renders the form plus table.

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add lib/validation/pantry.ts app/actions/pantry.ts app/\(app\)/pantry components/forms/pantry-item-form.tsx components/pantry
git commit -m "feat: add pantry inventory management"
```

## Task 13: Implement Dinner Planner

**Files:**

- Create: `app/actions/meal-plans.ts`
- Create: `components/meal-planner/weekly-dinner-planner.tsx`
- Create: `app/(app)/planner/page.tsx`

- [ ] **Step 1: Add meal plan actions**

Create `app/actions/meal-plans.ts` with:

- `assignDinner(formData)`: upserts a `meal_plan_entries` row for household, dinner slot, date, recipe.
- `markMealSkipped(formData)`: sets status to `skipped`.
- `markMealPlanned(formData)`: sets status to `planned`.

Each action must call `requireHousehold()`, query the household's default Dinner slot, and filter by `household_id`.

- [ ] **Step 2: Add weekly planner component**

Create `components/meal-planner/weekly-dinner-planner.tsx` that renders seven days starting from the selected week start, one dinner slot per day, recipe selector, and status badge.

- [ ] **Step 3: Add planner page**

Create `app/(app)/planner/page.tsx` that loads recipes and current week meal entries for the household.

- [ ] **Step 4: Verify**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add app/actions/meal-plans.ts app/\(app\)/planner components/meal-planner/weekly-dinner-planner.tsx
git commit -m "feat: add weekly dinner planner"
```

## Task 14: Implement Shopping List Generation And Export

**Files:**

- Create: `lib/domain/shopping-export.ts`
- Create: `tests/domain/shopping-export.test.ts`
- Create: `lib/validation/shopping.ts`
- Create: `app/actions/shopping.ts`
- Create: `components/shopping/shopping-list-view.tsx`
- Create: `app/(app)/shopping/page.tsx`

- [ ] **Step 1: Write export test**

Create `tests/domain/shopping-export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exportShoppingListText } from "@/lib/domain/shopping-export";

describe("exportShoppingListText", () => {
  it("formats needed and review items", () => {
    expect(
      exportShoppingListText([
        { itemName: "rice", deltaQuantity: 750, unit: "g", reviewRequired: false },
        { itemName: "onion", deltaQuantity: 1, unit: "each", reviewRequired: true },
      ]),
    ).toBe("- rice: 750 g\n- onion: 1 each [review]");
  });
});
```

- [ ] **Step 2: Implement export helper**

Create `lib/domain/shopping-export.ts`:

```ts
export type ShoppingExportItem = {
  itemName: string;
  deltaQuantity: number | null;
  unit: string | null;
  reviewRequired: boolean;
};

export function exportShoppingListText(items: ShoppingExportItem[]) {
  return items
    .map((item) => {
      const quantity = item.deltaQuantity === null ? "" : `: ${item.deltaQuantity} ${item.unit ?? ""}`.trimEnd();
      const review = item.reviewRequired ? " [review]" : "";
      return `- ${item.itemName}${quantity}${review}`;
    })
    .join("\n");
}
```

- [ ] **Step 3: Add shopping actions**

Create `app/actions/shopping.ts` with `generateShoppingList(formData)`. It must:

1. Require household context.
2. Load planned meal entries for a start/end date.
3. Load recipe ingredients for planned recipes.
4. Load pantry items.
5. Call `aggregateIngredients()` and `calculatePantryDelta()`.
6. Insert a `shopping_lists` row.
7. Insert `shopping_list_items` rows.
8. Revalidate `/shopping`.

- [ ] **Step 4: Add shopping page and view**

Create `app/(app)/shopping/page.tsx` and `components/shopping/shopping-list-view.tsx`. The view must render generate controls, needed items, review flags, checkboxes, copyable text, and a downloadable plain text link.

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- tests/domain/shopping-export.test.ts tests/domain/ingredient-aggregation.test.ts tests/domain/pantry-delta.test.ts
npm run typecheck
npm run lint
```

Expected: tests, typecheck, and lint pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add lib/domain/shopping-export.ts tests/domain/shopping-export.test.ts lib/validation/shopping.ts app/actions/shopping.ts app/\(app\)/shopping components/shopping
git commit -m "feat: generate exportable shopping lists"
```

## Task 15: Wire Meal Completion To Pantry Deduction Ledger

**Files:**

- Modify: `app/actions/meal-plans.ts`
- Create: `components/meal-planner/completion-dialog.tsx`
- Modify: `components/meal-planner/weekly-dinner-planner.tsx`

- [ ] **Step 1: Extend meal plan actions**

Modify `app/actions/meal-plans.ts` to add:

- `completeMeal(formData)`: loads meal, recipe ingredients, pantry items, existing deductions; calls `buildDeductionPlan`; applies clean deductions in a transaction-like sequence; inserts deduction rows; marks meal completed.
- `reverseCompletedMeal(formData)`: requires confirmation flag, restores exact recorded quantities where possible, marks deduction rows reversed, and sets meal back to planned.

If a deduction plan item has `reviewRequired: true`, insert a deduction row with `status = 'review_required'` and do not change pantry quantity for that item.

- [ ] **Step 2: Add completion dialog**

Create `components/meal-planner/completion-dialog.tsx` that shows clean deductions and review-required items before submitting completion.

- [ ] **Step 3: Wire planner buttons**

Modify `components/meal-planner/weekly-dinner-planner.tsx` to expose Complete, Skip, Restore, and Plan actions based on status.

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- tests/domain/pantry-deductions.test.ts
npm run typecheck
npm run lint
```

Expected: tests, typecheck, and lint pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add app/actions/meal-plans.ts components/meal-planner
git commit -m "feat: deduct pantry stock when meals are completed"
```

## Task 16: Add Integration And Security Tests

**Files:**

- Create: `tests/integration/household-access.test.ts`
- Modify: `supabase/tests/rls.sql`
- Modify: `tests/e2e/mvp-flow.spec.ts`

- [ ] **Step 1: Add household access integration test**

Create `tests/integration/household-access.test.ts` with service-client setup that creates two local test users and verifies household-scoped queries only return rows for the authenticated user when using anon-authenticated clients.

Use deterministic test emails:

```ts
const ownerEmail = "owner@example.test";
const outsiderEmail = "outsider@example.test";
```

The test must fail if an outsider can read or update another household's `recipes`, `pantry_items`, `meal_plan_entries`, or `shopping_lists`.

- [ ] **Step 2: Expand RLS SQL notes**

Modify `supabase/tests/rls.sql` to include explicit checks for tables with RLS enabled:

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'households',
    'household_memberships',
    'meal_slots',
    'recipes',
    'recipe_ingredients',
    'meal_plan_entries',
    'pantry_items',
    'pantry_deductions',
    'shopping_lists',
    'shopping_list_items',
    'shopping_providers'
  )
  and rowsecurity is true
order by tablename;
```

- [ ] **Step 3: Expand E2E acceptance flow**

Modify `tests/e2e/mvp-flow.spec.ts` to cover:

1. Sign up.
2. Add pantry item.
3. Create manual recipe.
4. Plan dinner.
5. Generate shopping list.
6. Mark meal completed.
7. Confirm pantry quantity changed once.

- [ ] **Step 4: Verify**

Run:

```bash
npm run test
npm run test:e2e
npm run typecheck
npm run lint
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests supabase/tests/rls.sql
git commit -m "test: cover household security and MVP flow"
```

## Task 17: Final Local MVP Verification And Documentation

**Files:**

- Modify: `README.md`
- Create: `docs/local-development.md`
- Create: `docs/security-notes.md`

- [ ] **Step 1: Document local development**

Create `docs/local-development.md` with:

```md
# Local Development

1. Install Node.js 22, Docker Desktop, and the Supabase CLI.
2. Copy `.env.example` to `.env.local`.
3. Run `npx supabase start`.
4. Copy local Supabase URL, anon key, service role key, and database URL into `.env.local`.
5. Run `npx supabase db reset`.
6. Run `npm install`.
7. Run `npm run dev`.
8. Open `http://localhost:3000`.

Use `npx supabase stop` to stop the local Supabase stack.
```

- [ ] **Step 2: Document security notes**

Create `docs/security-notes.md` with:

```md
# Security Notes

- Supabase Auth handles passwords and sessions.
- Browser code only uses the anon key.
- The service-role key is server-only and must never be exposed through client components.
- Household-owned tables use Row Level Security.
- Server actions call `requireHousehold()` before household-scoped mutations.
- Recipe ingestion treats remote HTML as untrusted input.
- Retailer cart actions are not implemented in the MVP.
```

- [ ] **Step 3: Update README**

Update `README.md` with:

- Project goal.
- Local setup link to `docs/local-development.md`.
- Security notes link to `docs/security-notes.md`.
- MVP acceptance flow.
- Commands for `npm run test`, `npm run test:e2e`, `npm run typecheck`, and `npm run build`.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
docker compose build
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md docs/local-development.md docs/security-notes.md
git commit -m "docs: document local MVP setup and security posture"
```

## Completion Criteria

The MVP implementation is complete when:

- A user can create an account and is assigned a default household.
- RLS is enabled on household-owned tables.
- Recipes can be entered manually.
- Recipe URL ingestion can parse JSON-LD recipe pages and falls back to review.
- Recipes can be favorited and viewed.
- Pantry items can be created, viewed, updated, and deleted.
- Dinners can be planned for a week.
- A shopping list can be generated from planned dinners minus pantry stock.
- Compatible units convert safely.
- Ambiguous unit conversions are flagged for review.
- Shopping lists can be copied or downloaded as plain text.
- Marking a meal completed deducts matched pantry items exactly once.
- Reversing a completed meal requires confirmation and restores recorded quantities where possible.
- Unit, integration, E2E, typecheck, lint, build, and Docker build verification pass.

## Inline Execution Checkpoints

Use these checkpoints in the implementation session:

1. **Foundation checkpoint** after Tasks 1-6: app scaffold, Supabase, auth, protected shell.
2. **Domain checkpoint** after Tasks 7-9: unit conversion, pantry delta, deduction logic.
3. **Core product checkpoint** after Tasks 10-15: recipes, pantry, planner, shopping, completion.
4. **Hardening checkpoint** after Tasks 16-17: security tests, E2E flow, docs, Docker verification.

Do not start the next checkpoint until the current checkpoint passes its verification commands and is committed.
