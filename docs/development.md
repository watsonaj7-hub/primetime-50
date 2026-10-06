# Development and Phase 1 validation

The application is in `Primetime-50/`, not the repository root. Use Node 24.19.0 (Node 22+ supported), pnpm 11.19.0 and the committed lockfile. No Vercel/GitHub settings or production deployment is needed for this workflow.

## Install and independent checks

From the repository root:

```sh
cd Primetime-50
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```

In the cloud machine, pass `--store-dir /workspace/.pnpm-store` to installation because its home directory is read-only. The tracked workspace configuration now explicitly approves only sharp, unrs-resolver, esbuild and Supabase install scripts. Supply-chain, checksum and TLS verification remain enabled. No global pnpm install is required. The initial frozen installation succeeded. Reinstallation currently fails registry/supply-chain metadata requests with proxy HTTP 503, even with `--offline`. Existing installed dependencies remain usable, but fresh-task setup is not claimed verified. No integrity or supply-chain setting was relaxed.

Production and browser checks:

```sh
# Stop this application's development process before building: dev and build share .next.
pnpm build
pnpm test:security
pnpm test:guards
```

Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` in this cloud machine. On a regular workstation install the browser with `pnpm exec playwright install chromium`. Browser tests start their own production server on port 3100. Keep it free. They do not deploy or produce user-facing previews. Private-session traces/screenshots are disabled by default.

Inter is used if installed locally; otherwise the existing system sans-serif stack is used. No font-network download is needed to build or run.

## Local database and authentication

The supported local Supabase stack uses Docker, PostgreSQL 15, Auth, REST, gateway and email inbox. Images need substantial Docker disk space; allow enough for unpacked layers, not just compressed image sizes. The cloud onboarding machine's 32GB filesystem was insufficient for the current CLI's PostgreSQL 15/17 images. A smaller CLI could not be fetched because the egress proxy currently returned HTTP 503. See `phase-1-implementation.md`; the SQL and full auth/persistence gate are not yet validated.

On a suitable isolated development machine:

```sh
cd Primetime-50
pnpm db:start
node scripts/local-env.mjs
pnpm dev
```

`local-env.mjs` reads the running CLI's real local API URL and publishable key without displaying values, then creates ignored `.env.local` with restrictive permissions. It never exports a service-role key to the app and preserves existing user configuration. It refuses non-loopback instances. If an existing file is present, edit it deliberately; the helper never replaces a remote project binding.

For the CLI used here, optional telemetry can be disabled with `pnpm exec supabase telemetry disable`. The first CLI command may need permission to write its cache under `~/.supabase` on this sandbox; do not relocate HOME or disable trust checks. Docker must be available.

Auth confirmation is enabled in local configuration and passwords must have at least 12 characters. Confirmation email is delivered to the local inbox, not a production mailbox. The app handles provider code/one-use token confirmation, password login, magic links, cookie session restoration and logout. Provider rate limits still apply; configure email delivery/rate limits for a real deployment separately.

All four migrations are authoritative, in timestamp order. The first is the legacy baseline; the next three add the foundation, parent-ownership checks and private drafts. Existing onboarding rows remain preserved as legacy records; new writes use canonical profiles/health/equipment. Users with only legacy onboarding rows must review and save the new profile. Existing invalid data or cross-tenant references cause migration failure and must be inspected rather than removed automatically.

`pnpm db:reset` is **destructive to the isolated local database**; use only when you intentionally want to reset local development data. Normal stop/start preserves local volumes. Do not reset a user's existing database or run the baseline over an already-created schema. For an existing project, compare its schema and migration history first, adopt the baseline in migration metadata only after confirming it matches, then apply the additive migrations to a reviewed test copy. No remote migrations were applied in this task.

`supabase/schema.sql` is a historical baseline, not the final secure schema. Do not run it alone. The handwritten foundation database type contract can be replaced with a complete generated contract using `pnpm db:types` after the stack is available. SSR 0.6 and the installed SDK use different type generic signatures, so the client factory exposes the current SDK contract through a documented adapter; runtime data is still validated with Zod.

## Full foundation gate

With the isolated stack running and `.env.local` configured, build with the browser-test origin (the publishable URL/key are needed at build time):

```sh
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100 pnpm build
pnpm test:integration
pnpm test:security
pnpm test:e2e
```

The callback origins for ports 3000 and 3100 are configured locally. `NEXT_PUBLIC_APP_URL` must match the actual server origin for mutations/callbacks. Rebuild when changing public configuration; it is compiled into the build. For normal development use the origin in `.env.local`.

Database tests require the CLI-reported **local** endpoint and refuse a remote project. Test admin credentials are read into the test process only, never printed or copied into application configuration. Tests create unique throwaway fixture users and clean up only those users. RLS tests use ordinary authenticated clients, not the admin client. The browser test signs up through the actual UI, confirms the isolated fixture via the local provider's admin API, verifies callback exchange with a provider-issued magic link, and checks profile recovery after logout/login. It does not assert SMTP delivery; verify real delivery separately for the selected deployment.

Tests cover atomic rollback, duplicate saves, role escalation, anonymous/private reads, cross-user CRUD, forged parent IDs and numeric bounds. Foundation browser projects run on desktop and a 375px mobile viewport, checking draft reload, onboarding, settings, safe failures/retry and saved values. These suites deliberately fail initialization if the local stack is missing; a zero-test run is not readiness.

Phase 2 must wait until this gate passes. Workout logging/generation, nutrition calculations, progress history and AI conversations are still later-phase features. Their existing sample panels remain clearly labelled as sample content.

## Remote configuration and secrets

A reviewed test/deployment project needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and a trusted `NEXT_PUBLIC_APP_URL`. Use the publishable/anon key with the hardened RLS policies, **never** the service-role key in `NEXT_PUBLIC_*`. Set values securely in environment settings and permit the actual project hostname; no hostname or credential was invented in this task. Existing project configuration must be inspected before migration.

Private optional integrations remain server-only: `PRIMEFIT_AI_KEY` (or legacy `OPENAI_API_KEY`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the two price IDs. Proxy placeholders cannot perform local Stripe signature verification; use a supported secure local binding for that operation. The cloud secret tool reserves OPENAI-prefixed targets; use `PRIMEFIT_AI_KEY` for a supported proxy binding. Paid AI/checkout routes now require authentication and same-origin requests. Webhooks use signature authentication. Do not treat existing webhook stubs as subscription persistence.
