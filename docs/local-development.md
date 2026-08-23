# Local Development

## Prerequisites

- Node.js 22
- Docker Desktop (or a Docker-compatible runtime)
- Supabase CLI

The commands below use the Windows-safe `npm.cmd` and `npx.cmd` executables. In a shell where `npm` and `npx` are already available, their equivalent commands work as well.

## Start the local stack

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Copy the local environment template:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Start Supabase:

   ```powershell
   npx.cmd supabase start
   ```

4. Populate `.env.local` with the values printed by that command. Do not paste the values into documentation, commits, issues, or pull requests.

   | `.env.local` variable | Local Supabase CLI value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `API URL` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `Publishable key` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `Secret key` |
   | `DATABASE_URL` | `DB URL` |

   The URL and publishable key are intentionally browser-visible. The secret key and database URL are local server/development values and must remain private.

5. Apply all migrations and seed data to the local database:

   ```powershell
   npx.cmd supabase db reset
   ```

6. Start the Next.js development server:

   ```powershell
   npm.cmd run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000).

## Optional local Ollama planning

The **Plan my week** feature uses Ollama only on your computer. Install Ollama,
start its local runtime, choose a model, then set `OLLAMA_MODEL` in `.env.local`
to that model name (for example after `ollama pull llama3.2`). Leave
`OLLAMA_BASE_URL` at `http://127.0.0.1:11434`; remote endpoints are deliberately
rejected. No recipe or household data is sent to a third-party AI provider.

Local services are available at:

- App: http://localhost:3000
- Supabase API: http://127.0.0.1:54321
- Supabase Studio: http://127.0.0.1:54323
- Inbucket (local email capture): http://127.0.0.1:54324

Stop the local Supabase stack when finished:

```powershell
npx.cmd supabase stop
```

## Verification

Run the full MVP verification suite after the local stack is running:

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
docker compose build
```

`test:e2e` exercises the local browser acceptance flow, so it requires the local Supabase stack and the Playwright browsers installed for the project.
