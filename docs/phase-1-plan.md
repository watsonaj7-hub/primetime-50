# Phase 1 foundation plan — authorized, verification pending

The user authorized this plan with “implement” after the audit. Phase 1 code is now written; the database acceptance gate remains blocked. See [phase-1-implementation.md](phase-1-implementation.md) for actual files and results. The details below preserve the approved scope; proposed filenames were consolidated where appropriate. Preserve the existing UI, URLs and working components. The architecture recommendation is **Supabase PostgreSQL + Supabase Auth + existing Next.js App Router**, with Zod validation, cookie-based SSR, server services and database-enforced ownership. A second ORM or wholesale folder redesign is unnecessary.

Source paths below are relative to `Primetime-50/`. Proposed filenames are explicit; a migration's timestamp prefix is assigned when implementation starts. New files are marked “new” where relevant. Database/auth tests require an isolated Supabase test project or verified local Supabase stack, never production or invented credentials. Configure values securely in environment settings, not chat/source control.

## Sequence and scope

1. Establish repeatable lint/test commands and test infrastructure; resolve font-network access; retain frozen dependency installation. Add version pins/config only in an approved implementation task.
2. Migrate the existing schema safely: user profile uniqueness, canonical units, structured goals/health/equipment/schedule, validation constraints, ownership and role protections. Review against any existing project before migrations; no blind schema recreation.
3. Complete auth registration/login/callback/logout and fail-closed server authorization. Retain current login presentation.
4. Connect onboarding/profile reads and writes, preserve drafts, expose accurate account state and sensible incomplete states.
5. Implement mutation feedback, safe validation/error handling, server-only credential boundaries and strict user isolation.
6. Run unit, service/RLS and end-to-end foundation tests, lint, typecheck and production build. Stop for review at the Phase 1 gate before workout implementation.

REQ-003/004/005/006 acceptance criteria require the later program engine. Phase 1 persists and validates those inputs and tests an eligibility/scheduling contract, but cannot mark their full acceptance VERIFIED until Phase 2 exercises generation. REQ-007 covers all core records over multiple phases; Phase 1 verifies identity/profile/onboarding persistence. REQ-018 defines/test-validates workout bounds now, with actual workout mutation coverage in Phase 2. REQ-039's workout-completion deduplication gate also belongs to Phase 2; the reusable pending/idempotency pattern starts here.

## REQ-001 — Authentication

- **Existing implementation:** Supabase browser/server factories and conditional cookie middleware; inert login UI; no signup/logout/callback or user-facing session restoration.
- **Required changes:** Use Supabase Auth for registration, login, verified session restoration and logout. Support password login and implement the existing magic-link button or clearly scope its availability. Safely handle email verification and callback errors. Restrict post-login redirects to same-origin relative allowlisted paths. Missing auth config must fail closed for protected workflows. `/admin` needs an explicit trusted role check.
- **Database changes:** Profile bootstrap transaction/upsert keyed by `auth.users.id`; no role derived from user metadata. Use migrations/grants that prevent ordinary users from assigning admin roles. Keep identity passwords in Supabase Auth, not custom tables.
- **API/server changes:** A `requireUser()` helper calls the provider's verified user API, not a client-supplied session/user ID. Callback exchanges authorization code into cookies; login/signup/logout actions return typed outcomes and invalidate relevant state. Middleware handles navigation only; all service mutations independently authenticate.
- **Frontend changes:** Wire existing email/password, sign-in and magic-link controls; add registration/logout entry points, session-aware user menu, labels and pending/error/success feedback. Preserve original style.
- **Files expected to change:** `app/login/page.tsx`, `components/app-shell.tsx`, `middleware.ts`, `lib/supabase/browser.ts`, `lib/supabase/server.ts`; new `app/register/page.tsx`, `app/auth/callback/route.ts`, `app/actions/auth.ts`, `components/auth/login-form.tsx`, `register-form.tsx`, `user-menu.tsx`, `lib/auth/require-user.ts`; migrations/test files listed below.
- **Tests required:** Signup with valid/invalid data; email confirmation states; successful/failed login; magic-link callback; reload and renewed session; logout cookie removal; expired/missing config/session; callback redirect injection; ordinary user denied admin; A denied B resource through both app service and direct Supabase client.
- **Acceptance criteria:** Registration authenticates according to documented verification policy; a valid returning session restores; logout revokes local session; cross-user protected access is denied. Provider errors never expose credentials.

## REQ-002 — User Profile

- **Existing implementation:** SQL profiles table/TypeScript Profile type; settings defaults are hard-coded and not read from storage.
- **Required changes:** A canonical uniquely owned profile, validated editable personal/fitness fields and reliable reload semantics. Define date-of-birth/age handling, optional sex, height/weight canonical units and explicit fitness-level values. Do not infer unknown values.
- **Database changes:** Retain profiles; add missing canonical fitness fields where appropriate, nullable incomplete fields, updated-at behavior and constraints. Remove unrestricted role edits through grants/schema design. Uniqueness on user ID is already defined and must be preserved.
- **API/server changes:** Authenticated profile read/upsert service and actions; derive user ID server-side; only allowlisted writable fields; return a typed profile DTO excluding authorization/private admin fields.
- **Frontend changes:** Hydrate existing settings/onboarding fields from current profile; show incomplete state rather than Austin or invented history. Save/reset feedback; labels; canonical input/display conversion boundary.
- **Files expected to change:** `app/settings/page.tsx`, `app/onboarding/page.tsx`, `lib/types.ts`; new `components/settings/profile-settings.tsx`, `app/actions/profile.ts`, `lib/services/profile.ts`, `lib/validation/profile.ts`, `lib/db/database.types.ts`; profile migration and tests.
- **Tests required:** Create/edit/read round-trip, constraints, incomplete profile, forged user ID, profile bootstrap retries, missing session and unit-normalization boundaries.
- **Acceptance criteria:** Profile edits survive refresh and logout/login; another account cannot read/write them.

## REQ-003 — Fitness Goals

- **Existing implementation:** Combined fat-loss/muscle-gain text field; loose SQL strings and caller-provided plan context.
- **Required changes:** Explicit primary/secondary enums with documented meaning, optional targets, mutual consistency and persisted goals.
- **Database changes:** Add canonical goal fields to current profile/preferences rather than relying on arbitrary strings; reconcile existing onboarding responses without dropping old data. No duplicate source of truth.
- **API/server changes:** Validated owned updates and a typed goal input contract for future program generation. Record current input/version when generation is later implemented.
- **Frontend changes:** Retain onboarding layout while offering explicit goal choices; editable goal settings and save feedback; no “generated plan” claim in Phase 1.
- **Files expected to change:** `app/onboarding/page.tsx`, `app/settings/page.tsx`; new `components/onboarding/goals-step.tsx`, `components/settings/goal-settings.tsx`, `lib/validation/onboarding.ts`, `lib/services/onboarding.ts`, `lib/services/program-input.ts`; preferences migration/tests.
- **Tests required:** Goal enums, invalid combinations, persistence, updated goal included in the generator-input contract; subsequent Phase 2 generation integration.
- **Acceptance criteria:** Phase 1: saved goals round-trip and update authoritative generator inputs. Full requirement: a changed goal changes the subsequent generated prescription, verified in Phase 2.

## REQ-004 — Health Limitations

- **Existing implementation:** Free-text injury/medical/mobility fields; static contraindication strings; no eligibility check.
- **Required changes:** Private structured limitations/restrictions with optional notes; distinguish unknown, none reported and recorded restrictions. No diagnostic claims. Design a conservative conflict-mapping service with explicit uncertainty handling.
- **Database changes:** Add a uniquely user-owned health-profile relation with structured restriction identifiers and timestamps; preserve prior text as notes during migration. RLS must prevent cross-user reads/writes. Keep health detail out of public profile DTOs.
- **API/server changes:** Authenticated health read/upsert, bounded validated notes and canonical restriction arrays; pure exercise eligibility check prepared for Phase 2 integration; do not send all notes to AI automatically.
- **Frontend changes:** Reuse onboarding health area; structured choices plus optional notes, concise purpose/privacy explanation, editable health settings and accurate missing-data state.
- **Files expected to change:** `app/onboarding/page.tsx`, `app/settings/page.tsx`; new `components/onboarding/health-limitations-step.tsx`, `components/settings/health-settings.tsx`, `lib/validation/health.ts`, `lib/services/health.ts`, `lib/safety/exercise-eligibility.ts`, health migration/tests.
- **Tests required:** Health CRUD/ownership, invalid/unknown restrictions, redacted DTOs, known incompatible fixture excluded by eligibility service; Phase 2 end-to-end generation exclusion.
- **Acceptance criteria:** Phase 1 stores private validated restrictions and proves known conflicts are rejected by the eligibility contract. Full requirement additionally proves they never appear automatically in generated workouts.

## REQ-005 — Equipment

- **Existing implementation:** SQL array and free-text equipment included in a combined textarea; inconsistent catalog vocabulary (`band`, `resistance band`, `dumbbell`, `dumbbells`).
- **Required changes:** Canonical equipment identifiers, clear availability selection and explicit mapping from current catalog descriptions. Do not fabricate availability.
- **Database changes:** User-equipment relation with unique `(user_id, equipment_type)`, availability and timestamps; safe migration of existing arrays. Maintain tenant RLS and normalized allowed values.
- **API/server changes:** Validated owned replacement/upsert with transaction semantics; pure equipment-compatibility contract for future generation/swaps.
- **Frontend changes:** Add equipment choices in existing onboarding/settings UI; preserve selections on failure/reload.
- **Files expected to change:** `app/onboarding/page.tsx`, `app/settings/page.tsx`, eventually `lib/exercises.ts` for catalog normalization; new `components/onboarding/equipment-step.tsx`, `components/settings/equipment-settings.tsx`, `lib/validation/equipment.ts`, `lib/services/equipment.ts`, `lib/services/equipment-compatibility.ts`, equipment migration/tests.
- **Tests required:** Canonical mapping, duplicate/unknown identifiers, CRUD isolation, dumbbell-only compatibility fixtures and negative barbell fixture; Phase 2 program integration.
- **Acceptance criteria:** Phase 1 proves equipment persistence/eligibility. Full requirement verifies dumbbell-only generation contains no incompatible barbell dependence unless an available compatible alternative is selected.

## REQ-006 — Training Availability

- **Existing implementation:** Native 2–5 day select; unused weekly_training_days SQL field; no preferred session duration.
- **Required changes:** Validate/persist days per week and preferred session minutes; document realistic bounds, schedule conventions and timezone. Feed the authoritative generator-input contract.
- **Database changes:** Canonical frequency/duration preferences and checks; preserve existing values; optional preferred training days as future scheduling requires.
- **API/server changes:** Owned preference updates; typed schedule contract and independent cap validation; no claimed real schedule before Phase 2.
- **Frontend changes:** Wire existing days choice, add duration field with labels/units and settings editing; show saved values.
- **Files expected to change:** `app/onboarding/page.tsx`, `app/settings/page.tsx`; new `components/onboarding/training-schedule-step.tsx`, `components/settings/training-settings.tsx`, `lib/validation/training.ts`, `lib/services/training-preferences.ts`, `lib/services/program-input.ts`, preferences migration/tests.
- **Tests required:** Boundary days/durations, persistence, three-day schedule cap contract; later generator schedule integration/timezone cases.
- **Acceptance criteria:** Phase 1 round-trips valid preferences. Full requirement verifies a three-day preference generates at most three weekly prescribed sessions.

## REQ-007 — Persistence

- **Existing implementation:** Raw schema and seeds only; no data-access services; save/reload browser probe loses input.
- **Required changes:** Adopt versioned reviewed migrations, typed authenticated services, stable ownership constraints and transactional onboarding. Future workout/nutrition/history entities are added incrementally in their phases, not implemented now.
- **Database changes:** Baseline/adopt the existing schema safely after inspecting the target project. Enforce one authoritative current onboarding/profile state per user, health/equipment/schedule relations, numeric constraints and same-tenant parent foreign keys. Add migration rollback/recovery notes; make future catalog seeding idempotent with stable identifiers.
- **API/server changes:** Supabase SSR requests use session-scoped credentials and RLS, not service-role bypass. Implement atomic onboarding save via a scoped transaction/RPC with safe grants and fixed search path where needed. Handle constraint errors without dumping database details.
- **Frontend changes:** Hydrate persisted values; no fabricated user values; allow legitimate incomplete records. Refresh/revalidate only after successful writes.
- **Files expected to change:** `lib/supabase/server.ts`, `lib/types.ts`, `app/onboarding/page.tsx`, `app/settings/page.tsx`; new `supabase/migrations/<timestamp>_foundation.sql`, `supabase/migrations/<timestamp>_ownership.sql`, `lib/db/database.types.ts`, `lib/services/onboarding.ts`, `app/actions/onboarding.ts`; integration tests.
- **Tests required:** Apply migrations to an isolated empty and representative existing test database; full profile round-trip; transaction rollback on invalid equipment/health step; repeated saves; reload/logout/login; tenant consistency and concurrent writes.
- **Acceptance criteria:** Foundation data survives refresh/logout/login without partial onboarding corruption. The all-core-record acceptance remains partial until later feature persistence tests exist.

## REQ-018 — Validation

- **Existing implementation:** Only broad AI-object and Stripe-plan schemas; bad values cause 500; number fields lack bounds; SQL accepts invalid workout ranges.
- **Required changes:** Shared strict schemas for all implemented mutations; reject unknown writable fields, invalid IDs/enums/nonfinite numbers, oversized text and invalid dates. Define sets 1–20, reps 0–100, weight ≥0 and RPE 1–10 independently from React.
- **Database changes:** CHECK constraints mirror stable numeric/enumeration invariants; tenant constraints and relevant uniqueness. Validate existing data before introducing constraints; do not silently delete bad rows.
- **API/server changes:** Authenticate before owned mutations; safe parse and structured field errors; malformed JSON → controlled 400; validation → documented 4xx; bounded input/provider output. Harden existing AI/Stripe input error paths without implementing later feature scope.
- **Frontend changes:** Accessible field-level feedback and sane input attributes; retain values; server remains authoritative.
- **Files expected to change:** Existing three API routes and new actions; new `lib/validation/profile.ts`, `onboarding.ts`, `health.ts`, `equipment.ts`, `training.ts`, `workout.ts`, `lib/http/errors.ts`, foundation migration; components/tests.
- **Tests required:** All bounds, NaN/infinity, malformed JSON, unknown keys/forged user ID, oversized text, invalid dates, correct 4xx shape; direct DB constraint checks. Actual workout writes are tested when Phase 2 adds them.
- **Acceptance criteria:** Implemented mutations reject invalid data; declared workout bounds pass unit/constraint tests. Full workout-ingestion acceptance verified with Phase 2 persistence.

## REQ-025 — Secret Security

- **Existing implementation:** Private provider environment reads occur in server routes; no heuristic embedded-key findings; production bundle check blocked by fonts.
- **Required changes:** Explicit server-only modules, typed public configuration, secure missing-config errors and restricted logging. Supabase publishable key is public; service-role/OpenAI/Stripe/private database credentials remain server-side. Do not invent values or copy them into scripts/docs.
- **Database changes:** No credentials in user profile/metadata; service-role privilege restricted to approved administrative paths; regular writes use RLS.
- **API/server changes:** Central server-only provider/config accessor. The onboarding tool reserves `OPENAI_*` secret target names: if later using proxy injection, choose a supported target such as `PRIMEFIT_AI_KEY` with an explicit server-side code change, and limit its destination to the provider. Plan separately for local signature verification, which needs an actual local webhook secret, not a proxy placeholder. Preserve optional no-key development behavior visibly as demo rather than real AI.
- **Frontend changes:** Public configuration only; do not return provider exceptions, tokens or private admin fields. Session cookies/provider access follow Supabase's supported auth model.
- **Files expected to change:** `lib/supabase/browser.ts`, `lib/supabase/server.ts`, `app/api/ai/plan/route.ts`, Stripe routes; new `lib/config/server.ts`, `lib/config/public.ts`, sanitized `.env.example`, secret regression tests and setup documentation.
- **Tests required:** Production build; inspect browser bundles and representative responses using nonproduction sentinel values; no secret presence in logs/errors; public URL/publishable key explicitly allowed; missing required configuration fails clearly.
- **Acceptance criteria:** No private provider/database credential appears in production browser artifacts or payloads. Source existence alone is insufficient.

## REQ-039 — Loading States

- **Existing implementation:** No asynchronous mutation state; all action buttons are inert.
- **Required changes:** Typed pending/success/error actions, disabled duplicate submissions and server-side idempotency. Authentication/email requests also need rate limits/feedback. Client disabling alone is insufficient.
- **Database changes:** Unique current-profile/equipment keys and transaction/upsert semantics make foundation retries safe; explicit completion idempotency belongs to Phase 2.
- **API/server changes:** Stable mutation outcomes and safe retry semantics; repeated foundation writes don't duplicate profile/onboarding rows. Define a reusable mutation-result type and idempotency conventions.
- **Frontend changes:** Use React action state/pending mechanisms; aria-busy/status announcements; preserve current button styling; success messages and recoverable retry.
- **Files expected to change:** Login/register/onboarding/settings components/actions; new `components/shared/submit-button.tsx`, `components/shared/mutation-status.tsx`, `lib/types/mutation.ts`; foundation tests.
- **Tests required:** Slow requests, double clicks, concurrent duplicates, pending accessibility and success reset. Phase 2 adds repeated workout-completion tests.
- **Acceptance criteria:** Foundation mutations show accurate status and repeated submits don't create duplicates. Full requirement's duplicate-completion acceptance remains deferred to Phase 2.

## REQ-040 — Error Handling

- **Existing implementation:** Explicit missing-Stripe JSON errors but unhandled Zod/provider/JSON exceptions; no UI error feedback.
- **Required changes:** Consistent safe recoverable errors, field errors, error boundaries, retry and preserved drafts. Distinguish unauthorized, invalid input, unavailable service and unexpected failures.
- **Database changes:** Translate constraints/RLS denial safely; transactions prevent partial saves. Do not persist raw exceptions or secrets in user records.
- **API/server changes:** Structured error mapper, narrow provider catches, safe correlation IDs where useful, no credentials/body dumps. API responses preserve correct nonzero failure semantics and HTTP statuses.
- **Frontend changes:** Keep entered data on failures; label errors/accessibility announcements; clear recoverable auth/onboarding/settings messages; error boundary with retry.
- **Files expected to change:** Three existing API routes, new actions and form components; new `app/error.tsx`, `lib/http/errors.ts`, `components/shared/form-errors.tsx`; error tests.
- **Tests required:** Offline/timeout, provider rejection, expired auth, invalid JSON, database failure, rollback and draft preservation; no private error details.
- **Acceptance criteria:** Network/server failures display actionable safe feedback and retain reasonable unsaved input; retry can succeed without duplication.

## REQ-045 — Data Privacy

- **Existing implementation:** RLS definitions exist but self-owned profile role edits appear permitted under standard grants; parent ownership consistency absent; no live tests or app CRUD.
- **Required changes:** Enforce verified identity at every query/mutation, least-privilege grants, role immutability, minimal DTOs and privacy boundaries. Explicitly document any legitimate admin support access; it must not be an accidental exception.
- **Database changes:** Column-level role protection or trusted role relation; user-scoped CRUD policies; same-user parent foreign keys; fixed search path/minimal grants for any security-definer functions; private health rows; review deletion cascades/retention. Apply policies to all existing tables, including direct client access.
- **API/server changes:** Derive ownership from authenticated context; whitelist writable fields; never use request body `user_id` as authority; filter nested relations as well as top-level rows; do not use privileged clients for ordinary user CRUD.
- **Frontend changes:** Clear state/cache on logout/account switch; no stale data from prior user; consent/purpose for health data; no false personalized data when empty.
- **Files expected to change:** `middleware.ts`, `lib/supabase/server.ts`, all new services/actions, shell/session components; new `lib/auth/require-user.ts`, ownership migration, RLS/service isolation tests and privacy documentation.
- **Tests required:** Two users plus anonymous/admin fixtures; A attempts B select/insert/update/delete and nested-parent links through both app and direct SDK; role escalation insert/update denied; account switch cache cleared; health DTO minimization; explicit allowed admin behavior separately tested.
- **Acceptance criteria:** Every owned query is authenticated and ownership-controlled; automated cross-user tests deny access without revealing B's record contents or existence unnecessarily.

## Anticipated file inventory

These are planned changes, **not files changed by this audit**. Keep naming/folder conventions consistent with the existing project; no bulk restructuring.

- Existing: `package.json`, `pnpm-lock.yaml` only if approved test/tooling dependencies require it, `pnpm-workspace.yaml`, `tsconfig.json` only if tooling requires it; `middleware.ts`, `lib/types.ts`, Supabase client helpers; `app/login/page.tsx`, `app/onboarding/page.tsx`, `app/settings/page.tsx`, `components/app-shell.tsx`, three API routes; UI input/select/textarea primitives where labels/ARIA need support.
- New auth: `app/register/page.tsx`, `app/auth/callback/route.ts`, `app/actions/auth.ts`, `lib/auth/require-user.ts`, `components/auth/login-form.tsx`, `components/auth/register-form.tsx`, `components/auth/user-menu.tsx`.
- New onboarding/settings: `app/actions/profile.ts`, `app/actions/onboarding.ts`, `components/onboarding/onboarding-wizard.tsx`, `personal-details-step.tsx`, `goals-step.tsx`, `health-limitations-step.tsx`, `equipment-step.tsx`, `training-schedule-step.tsx`, `onboarding-review.tsx`; `components/settings/profile-settings.tsx`, `goal-settings.tsx`, `health-settings.tsx`, `equipment-settings.tsx`, `training-settings.tsx`.
- New services: `lib/services/profile.ts`, `onboarding.ts`, `health.ts`, `equipment.ts`, `training-preferences.ts`, `program-input.ts`, `equipment-compatibility.ts`; `lib/safety/exercise-eligibility.ts`.
- New shared boundaries: `lib/validation/profile.ts`, `onboarding.ts`, `health.ts`, `equipment.ts`, `training.ts`, `workout.ts`; `lib/db/database.types.ts`, `lib/config/server.ts`, `lib/config/public.ts`, `lib/http/errors.ts`, `lib/types/mutation.ts`, `app/error.tsx`, `components/shared/submit-button.tsx`, `mutation-status.tsx`, `form-errors.tsx`.
- New database/tooling: `supabase/migrations/<timestamp>_foundation.sql`, `<timestamp>_ownership.sql`, `supabase/config.toml` if adopting a local stack; `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`, version-pin files, documented migration/test procedures. Do not change Vercel or GitHub settings.
- New tests: `tests/unit/validation.test.ts`, `program-input.test.ts`, `exercise-eligibility.test.ts`, `equipment-compatibility.test.ts`; `tests/integration/auth.test.ts`, `profile.test.ts`, `onboarding.test.ts`, `ownership.test.ts`, `errors.test.ts`; `tests/e2e/foundation.spec.ts`, `tests/security/secret-boundaries.test.ts`; isolated fixture/setup files. Choose the smallest suitable test stack and frozen lock updates after approval.
- Documentation: update these audit/requirement documents only as evidence changes; add setup/security notes needed to operate the approved implementation.

## Required checks and Phase 1 acceptance gate

Run repository scripts for configured lint/typecheck/unit/service tests and the production build; ensure actual tests execute. Apply migrations only to the approved isolated database. Run foundation E2E in desktop and representative mobile viewports:

1. Create User A and complete any required verification; authenticate.
2. Complete onboarding with personal details, goals, limitations, equipment and training availability.
3. Confirm the server persisted validated canonical records; refresh recovers them.
4. Edit the profile; simulate failed save to verify input preservation/status/retry.
5. Log out, log back in and recover the same profile/preferences/health data.
6. Create User B. Attempt A→B access, direct role escalation and cross-user parent linkage; verify denial through both app services and database policies.
7. Verify missing/expired sessions and missing required auth configuration cannot access protected workflows; ordinary user cannot access admin.
8. Inspect built browser artifacts and relevant payloads for private credentials; run accessibility label/keyboard and duplicate-submission tests.

A working onboarding form, SQL file or successful typecheck alone does not pass this gate. The full workout → history → progress → coach release test belongs to later phases and remains outstanding.

**Phase 1 implementation was authorized. Stop before Phase 2 until the foundation gate passes and is reviewed. No production deployment is part of this task.**
