# Meal Planner

A local-first MVP for planning weekly dinners, managing recipes and pantry stock, generating shopping lists, and recording pantry deductions when meals are completed. It is built with Next.js, TypeScript, and local Supabase.

## Get started

See [Local Development](docs/local-development.md) for prerequisites, safe local Supabase setup, environment-variable mapping, service URLs, and Windows-safe commands.

Read [Security Notes](docs/security-notes.md) before working with local credentials or changing authorization, recipe ingestion, or database access.

## MVP acceptance flow

With the local stack running:

1. Create an account; the app creates a default household.
2. Add a pantry item.
3. Create a recipe manually, or ingest a public HTTPS recipe URL and review the extracted data.
4. Assign the recipe to a dinner in the weekly planner.
5. Generate a shopping list; it reflects planned meals minus compatible pantry stock and flags ambiguous conversions for review.
6. Complete the planned meal and confirm that matched pantry stock changes once. Reversing the completion requires confirmation and restores recorded quantities where possible.

## Verification

Run these commands after starting local Supabase:

```powershell
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
docker compose build
```

## Docker

Build and run the production Next.js container:

```powershell
docker compose up --build web
```

The container reads local environment values from `.env.local` and serves the app on http://localhost:3000.
