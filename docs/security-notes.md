# Security Notes

## Current MVP posture

- Supabase Auth manages passwords and application sessions.
- Browser code uses only `NEXT_PUBLIC_SUPABASE_URL` and the publishable/anon key. A publishable key is designed to be public; authorization is enforced by the database policies.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. It bypasses Row Level Security and must never be exposed in client components, browser bundles, logs, source control, or user-facing error messages.
- Household-owned tables have Row Level Security (RLS) enabled. Application pages and server actions establish household context with `requireHousehold()` before reading or mutating household-scoped data.
- Meal-completion and reversal changes run through database RPCs with a deduction ledger, so repeated completion submissions are safe and reversals use the recorded quantities.
- Recipe ingestion accepts only authenticated household members, validates HTTPS public recipe URLs, rejects private-address targets, bounds request/body sizes, and treats fetched HTML and parsed recipe data as untrusted and editable.
- The ingest route rejects cross-origin requests and requires JSON input. It is not a general-purpose proxy.
- Retailer cart actions are not part of the MVP; shopping lists can only be generated, copied, or downloaded as plain text.

## Operational guidance

- Keep `.env.local` out of source control. Use `.env.example` only as a placeholder template.
- Local Supabase's CLI labels the server-only credential as the `Secret key`; do not confuse it with the browser-safe `Publishable key`.
- Run the RLS integration tests and MVP E2E flow against a local Supabase stack before release. See [Local Development](local-development.md#verification).
- This is a local MVP posture, not a production deployment guide. A production deployment needs independently managed secrets, HTTPS, approved redirect URLs, production SMTP, monitoring, backup/recovery procedures, and a separate security review.
