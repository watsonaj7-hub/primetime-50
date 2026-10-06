# Phase 1 implementation and verification

Implemented 6 October 2026 following the user's “implement” authorization of the foundation plan. Base commit: `036a0de63855f2c2c4c831fb702fb5ab65eeccaa`. Git delivery is separate from the runtime verification described below. No deployment, remote migration, payment or paid AI call was made. The application remains in `Primetime-50/`; root legacy application copies were left alone.

**Status: Phase 1 code implemented; foundation acceptance gate BLOCKED.** The production build and independent checks pass. Real authentication, profile persistence and database isolation cannot yet be claimed verified because the isolated Supabase stack could not start. Phase 2 has not begun.

## Implemented behavior

- Registration with email confirmation, password sign-in, magic links, safe provider callback exchange, cookie-backed session restoration and local logout. Public auth UI retains existing styling and now has labels, pending states and generic failures. Auth metadata cannot assign administrator roles.
- Verified-user server guards, fail-closed middleware including onboarding, trusted-role admin checks, allowlisted internal redirects and refreshed cookie handling. Missing configuration no longer bypasses protected routes.
- Four-step onboarding and real profile settings replace hard-coded personal defaults. Validated adult personal data, distinct primary/secondary goals, schedule/duration, private health limitations and canonical equipment flow through owned services and an atomic database RPC. Inputs remain intact on save errors; submit controls disable while pending. Incomplete profiles display explicit states.
- Private server-side onboarding drafts restore partial input and step after reload. Debounced autosave reports failures; no sensitive draft is stored in browser localStorage. Profile completion clears the draft in the same database transaction. Simultaneous edits across tabs are last-write-wins; revision conflict handling is not implemented.
- Strict Zod/request validation, bounded JSON bodies, same-origin mutation checks, safe API error responses and a retry boundary. Existing AI/checkout endpoints now verify users; webhook signature failures are sanitized. Existing AI plan fallback is explicitly demo output, and webhook subscription persistence remains deferred.
- Pure validated program-input/equipment/health eligibility contracts prepare Phase 2. Unknown limitations, medical-clearance flags and notes requiring review conservatively block automatic exercise selection. These contracts are not a workout generator.
- Existing workout/nutrition/progress/coach/habit panels are still sample content, now labelled by a global banner. No personalized workout generation, logging, history, coaching or nutrition calculations are claimed.

## Database and security changes

Four timestamped migrations introduce the original baseline, additive foundation, same-owner parent references/numeric bounds, and private drafts. The foundation stores canonical cm/kg values and structured preferences, adds ownership policies, removes broad administrator exceptions for private data, restricts client profile column writes to exclude roles, and bootstraps profiles without client metadata authority. The atomic RPC derives the user from `auth.uid()` and runs with invoker privileges/RLS.

Health, equipment and drafts are separate owned tables. Composite foreign keys prevent linking a user's workout records to another user's parent. Invalid existing rows cause migration failure rather than silent deletion. Legacy onboarding data is preserved; those users must review new canonical fields. `supabase/schema.sql` is marked historical and must not be run alone.

These SQL files have **not been applied or execution-tested** here. Inspect an existing project's schema/migration history before adoption and test on an isolated copy. The foundation database TypeScript contract is handwritten; regenerate the complete contract once the stack works. The generation helper preserves the previous file on failure. The existing SSR package and current SDK have different generic signatures; factories use a documented typed adapter and service results are validated at runtime.

## Actual check results

| Check | Result | Scope |
|---|---|---|
| Initial frozen pnpm installation | PASS earlier; final reinstall BLOCKED | Installed dependencies remain usable. Registry/supply-chain metadata requests now fail with HTTP 503, including an offline attempt; no verification setting was relaxed. |
| `pnpm lint` | PASS | Noninteractive ESLint configuration |
| `pnpm typecheck` | PASS | Strict TypeScript |
| `pnpm test` | PASS: 42 tests | Profile/draft/workout bounds, safe redirect and eligibility contracts, HTTP validation/origin/error behavior |
| `pnpm build` | PASS | All 21 Next.js routes generated; no font-network dependency |
| `pnpm test:security` | PASS: 1 test | Browser JavaScript lacks private key configuration names and any configured private key values; no credentials printed |
| Production `pnpm test:guards` with system Chromium | PASS: 4 tests | Anonymous protected-route/API denial, cross-origin writes, invalid callback redirects, labelled registration controls and public 50-exercise content |
| `pnpm test:integration` | BLOCKED at initialization | Missing isolated local Supabase; zero database tests executed |
| Foundation desktop/mobile Playwright projects | BLOCKED at initialization | Missing local stack; no authenticated workflow executed |
| Failed `pnpm db:types` with missing stack | PASS preservation check | Command failed safely and the existing contract stayed byte-identical |

This machine has system Chromium at `/usr/bin/chromium`; browser commands require `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`. A run without that setting failed because the Playwright-managed browser was not installed, then the configured system-browser guard run passed. Authenticated browser tests deliberately fail without the database instead of passing mocked flows.

## Blocker and remaining acceptance gate

Docker is available, but current Supabase PostgreSQL images exhausted the 32GB filesystem while unpacking. The attempted image/start processes were stopped; no application database container or migrated volume exists. Some ancillary images are cached. Attempts to fetch an older, smaller CLI subsequently failed with proxy HTTP 503. TLS, checksums and image/package trust checks were retained. No production project or invented credentials were used as a substitute.

Use a working isolated local Supabase environment with enough image space and functioning package/image egress, then follow [development.md](development.md). Apply ordered migrations, configure the real public local URL/key, build for the test origin, and run integration plus desktop/mobile foundation suites. Required evidence includes actual registration/confirmation/login/logout and renewed session, draft reload, atomic profile/settings persistence, failure/retry, two-user RLS denial, forbidden role escalation, parent ownership and numeric constraints. Local fixture confirmation uses the provider admin API; SMTP delivery is not asserted and needs separate deployment verification.

Until those checks pass, REQ-001, REQ-002 and REQ-045 remain BLOCKED. Goals/health/equipment/training/settings and other cross-phase requirements remain PARTIAL. Imperial display conversion and recommendation changes are deferred to their later workflows; current inputs explicitly require cm/kg while saving the display preference. Phase 2 and production release remain deferred.

## Environment handoff

The cloud setup helper now installs directly from the approved tracked workspace and frozen lockfile, then runs lint/typecheck/unit tests. Its syntax is validated; final execution is BLOCKED during registry/supply-chain metadata checks by proxy HTTP 503, including an offline attempt. The initial install succeeded and existing installed dependencies support the passing checks. Fresh-task installation/restoration is not claimed verified. No supply-chain checks were disabled. Startup instructions describe current fail-closed behavior, production checks and the database blocker. Existing network and repository membership are preserved. Saved cloud configuration is a draft: saving does not execute setup, publish the environment or deploy the application. Review/save the draft in environment settings before publishing any snapshot, with the database limitation understood. Future processes must be started again; do not run development and production builds against `.next` simultaneously.

## Changed-file inventory

Paths below are relative to the repository root. Includes source, migrations, tooling, tests and documentation; generated caches and ignored local environment files are excluded.

- `.gitignore`
- `Primetime-50/.env.example`
- `Primetime-50/.nvmrc`
- `Primetime-50/README.md`
- `Primetime-50/app/actions/auth.ts`
- `Primetime-50/app/admin/page.tsx`
- `Primetime-50/app/api/ai/plan/route.ts`
- `Primetime-50/app/api/profile/draft/route.ts`
- `Primetime-50/app/api/profile/route.ts`
- `Primetime-50/app/api/stripe/checkout/route.ts`
- `Primetime-50/app/api/stripe/webhook/route.ts`
- `Primetime-50/app/auth/callback/route.ts`
- `Primetime-50/app/error.tsx`
- `Primetime-50/app/layout.tsx`
- `Primetime-50/app/login/page.tsx`
- `Primetime-50/app/onboarding/page.tsx`
- `Primetime-50/app/register/page.tsx`
- `Primetime-50/app/settings/page.tsx`
- `Primetime-50/components/app-shell.tsx`
- `Primetime-50/components/auth/auth-form.tsx`
- `Primetime-50/components/auth/user-menu.tsx`
- `Primetime-50/components/onboarding/profile-form.tsx`
- `Primetime-50/components/shared/mutation-status.tsx`
- `Primetime-50/components/today-workout.tsx`
- `Primetime-50/components/ui/button.tsx`
- `Primetime-50/eslint.config.mjs`
- `Primetime-50/lib/auth/redirect.ts`
- `Primetime-50/lib/auth/require-user.ts`
- `Primetime-50/lib/config/public.ts`
- `Primetime-50/lib/db/database.types.ts`
- `Primetime-50/lib/http/errors.ts`
- `Primetime-50/lib/services/draft.ts`
- `Primetime-50/lib/services/profile.ts`
- `Primetime-50/lib/services/program-input.ts`
- `Primetime-50/lib/supabase/browser.ts`
- `Primetime-50/lib/supabase/server.ts`
- `Primetime-50/lib/types/mutation.ts`
- `Primetime-50/lib/validation/draft.ts`
- `Primetime-50/lib/validation/profile.ts`
- `Primetime-50/middleware.ts`
- `Primetime-50/package.json`
- `Primetime-50/playwright.config.ts`
- `Primetime-50/pnpm-lock.yaml`
- `Primetime-50/pnpm-workspace.yaml`
- `Primetime-50/scripts/db-types.mjs`
- `Primetime-50/scripts/local-env.mjs`
- `Primetime-50/supabase/.gitignore`
- `Primetime-50/supabase/config.toml`
- `Primetime-50/supabase/migrations/20261006000100_baseline.sql`
- `Primetime-50/supabase/migrations/20261006000200_foundation.sql`
- `Primetime-50/supabase/migrations/20261006000300_parent_ownership.sql`
- `Primetime-50/supabase/migrations/20261006000400_onboarding_drafts.sql`
- `Primetime-50/supabase/schema.sql`
- `Primetime-50/tailwind.config.ts`
- `Primetime-50/tests/e2e/foundation.spec.ts`
- `Primetime-50/tests/e2e/guards.spec.ts`
- `Primetime-50/tests/fixture.ts`
- `Primetime-50/tests/integration/foundation.test.ts`
- `Primetime-50/tests/local-stack.ts`
- `Primetime-50/tests/security/secret-boundaries.test.ts`
- `Primetime-50/tests/server-only.ts`
- `Primetime-50/tests/unit/draft.test.ts`
- `Primetime-50/tests/unit/foundation.test.ts`
- `Primetime-50/tests/unit/http.test.ts`
- `Primetime-50/vitest.config.mts`
- `README.md`
- `docs/development.md`
- `docs/implementation-audit.md`
- `docs/phase-1-implementation.md`
- `docs/phase-1-plan.md`
- `docs/requirements.md`
