# Meal Planner

Local-first meal planning MVP built with Next.js, TypeScript, and Supabase.

## Prerequisites

- Node.js 22
- Docker Desktop or another Docker-compatible runtime

## Local Development

Install dependencies:

```bash
npm install
```

Start the local Supabase stack:

```bash
npm run supabase:start
```

Copy `.env.example` to `.env.local` and replace the placeholder keys with the local values printed by Supabase. The current local Supabase CLI labels these as `Publishable` and `Secret`.

Start the Next.js dev server:

```bash
npm run dev
```

Open http://localhost:3000.

Useful local URLs:

- App: http://localhost:3000
- Supabase API: http://127.0.0.1:54321
- Supabase Studio: http://127.0.0.1:54323
- Mailpit: http://127.0.0.1:54324

Stop Supabase when finished:

```bash
npm run supabase:stop
```

Reset the local database:

```bash
npm run supabase:reset
```

## Docker

Build and run the production Next.js container:

```bash
docker compose up --build web
```

The container reads `.env.local` and serves the app on http://localhost:3000.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
