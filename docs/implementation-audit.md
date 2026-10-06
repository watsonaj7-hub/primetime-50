# PrimeFit 50+ implementation audit

Audit date: 6 October 2026. Selected repository: `watsonaj7-hub/primetime-50`, branch `main`, local commit `036a0de63855f2c2c4c831fb702fb5ab65eeccaa`. Initial tracked/untracked state was clean. This document preserves the pre-implementation audit. The user subsequently authorized Phase 1 implementation; see [phase-1-implementation.md](phase-1-implementation.md) for current code, verification and blockers. Statements below describe the original snapshot, not the changed application.

## Current Architecture

The actual Next.js application lives in `Primetime-50/`. Repository-root `package.json`, `app-shell.tsx`, `layout.tsx`, `page.tsx`, `prompts.ts` and `route.ts` are exact duplicates of their nested equivalents, but the root has no App Router directory/configuration/lockfile. Running from the root is the wrong documented working directory. Both READMEs instruct npm installation and copying `.env.example`, but no such example exists.

The locked/installed framework is **Next.js 15.5.20**, React/React DOM **19.2.7**, TypeScript **5.9.3**. The manifest specifies ranges rather than pinned versions. Node **24.19.0** and pnpm **11.19.0** were available and used. No repository Node version or package-manager pin, agent instruction file, CI workflow or test framework was found.

Architecture: Next.js App Router, mostly static Server Components, Tailwind CSS 3.4.19, Lucide icons, small Radix Slot/cva UI primitives, and one application Client Component (`components/progress-chart.tsx`) using Recharts. Strict TypeScript and `@/*` aliases are configured. There are no Server Actions, application state hooks, click/submit mutation handlers, localStorage/sessionStorage persistence, or database CRUD calls in application code. Native browser inputs hold transient values. The chart's client rendering does not make its data persistent.

### Pages and routes

All eleven pages returned HTTP 200 in the credential-free development workflow. They are not eleven completed business workflows.

| Route | Current implementation | Authentication behavior |
|---|---|---|
| `/` | Static dashboard, workout, nutrition, habits, coach copy, exercise spotlight | Public |
| `/workout` | Static workout plus three fixed exercise input rows | Middleware prefix, bypassed when Supabase configuration absent |
| `/nutrition` | Static targets, editable native meal inputs | Same conditional guard |
| `/progress` | Fixed trends/chart/habits | Same conditional guard |
| `/coach` | Static chat text and unwired textarea/button | Same conditional guard |
| `/library` | Fifty hard-coded exercise cards | Public |
| `/settings` | Static defaults and unwired save | Conditional guard |
| `/login` | Email/password inputs, unwired sign-in/magic-link buttons | Public |
| `/onboarding` | Ten native fields, unwired generation button | Public |
| `/subscription` | Fixed Free/Pro/Premium pricing; unwired controls | Public |
| `/admin` | Static counts/cards; no role check | Session-only prefix if configured, bypassed otherwise |

`app/layout.tsx` provides metadata, global CSS and Inter through `next/font/google`. `middleware.ts` calls Supabase `auth.getUser()` only when both public Supabase variables exist. It redirects unauthenticated protected-prefix visitors to `/login?next=...` when configured. It neither guards API mutations nor checks admin role. Cookie updates are implemented but live session behavior is untested.

### Components and reusable code

Thirteen component files: `app-shell`, `today-workout`, `nutrition-panel`, `progress-chart`, `habit-grid`, `coach-panel`, `exercise-spotlight`, `metric-card`, and UI `button`, `card`, `input`, `select`, `textarea`. `lib/utils.ts` combines clsx/tailwind-merge. `lib/types.ts` defines Json, roles, subscriptions, Profile and WorkoutPlan, not generated database types. `lib/exercises.ts` exports fifty static exercises and the first eight as featured exercises. The cast to `Exercise[]` avoids fully typed tuple validation. Equipment and alternative names are free text, not canonical identifiers.

### Existing API routes

| Method/path | Behavior observed or inspected | Gaps |
|---|---|---|
| `POST /api/ai/plan` | Zod accepts broad onboarding/recentProgress objects. Without a key, returns a fixed 4-week-labelled plan containing one Monday session. With a key, code calls OpenAI `gpt-4o-mini` JSON mode. | No authentication, rate limit, persisted context, business-rule enforcement, output schema validation, storage, or controlled errors. Different profiles produced identical fallback JSON. Live provider branch untested. |
| `POST /api/stripe/checkout` | Valid `pro` input returned JSON 400: Stripe not configured. Code creates subscription checkout when credentials/price exist. | No auth, customer/user binding, authoritative subscription persistence, rate limit or validation error handling. Redirects depend on unset app URL. Live checkout untested. |
| `POST /api/stripe/webhook` | Returned JSON 400: webhook not configured. Code checks signature via Stripe SDK when configured. | Supported-event switch bodies do nothing; no event deduplication, subscription update, customer ownership resolution or recovery. Live signatures/events untested. |

No other APIs, callback handlers, Server Actions or mutation services exist. There is no ORM. Supabase SDK helpers are present, but apart from auth middleware the app does not invoke them.

## Validation actually executed

All commands ran in `/workspace/primetime-50/Primetime-50` unless explicitly noted. No test script was invented. Browser checks below are audit probes, not a repository test suite.

| Check | Result and evidence |
|---|---|
| Read-only Git access | `git ls-remote origin HEAD` succeeded using existing platform authentication. No token requested. |
| Frozen dependencies | Initial `CI=1 pnpm install --frozen-lockfile --store-dir /workspace/.pnpm-store` downloaded 427 packages, verified 484 lock entries, then failed because sharp/unrs-resolver build approvals are placeholder strings in tracked workspace config. |
| Corrected installation | Copied existing manifest/lockfile to `/workspace/.cloud-setup/install-app`, supplied external boolean approvals only for sharp/unrs-resolver, and installed with `--modules-dir`/`--virtual-store-dir` pointing to the real app. Exit 0; both lifecycle scripts succeeded. No tracked configuration changes, checksum changes or verification bypasses. Repeated installation also exited 0. Exact reusable command is `/workspace/.cloud-setup/install.sh`. |
| TypeScript | Existing `pnpm run typecheck` exited 0 after disabling pnpm's automatic pre-run reinstall. Repeated after route generation. Reusable setup uses the same package script through `npm run typecheck`. |
| Lint | Existing `pnpm run lint` invokes deprecated `next lint`, asks to create ESLint configuration, then exits 1 noninteractively. No ESLint configuration is present. Did not generate one during audit. This is repository tooling debt. |
| Unit tests | UNRUN: no unit-test script, files, runner or dependencies exist. Not a passing zero-test suite. |
| Integration/E2E tests | UNRUN: no integration/E2E scripts or suites exist. External Chromium probes were run separately. |
| Production build | Existing `pnpm run build` failed solely at the observed compile stage because Inter could not download from `fonts.googleapis.com`. Both font hosts returned proxy HTTP 403. Later build stages/bundle inspection are unverified. Required domains were saved in the environment draft; that does not apply them to the current machine. |
| Development startup | Existing `pnpm run dev --hostname 0.0.0.0 --port 3000` started. It reports the font download failure and uses its built-in fallback font. App content still returned 200. No source/font mock was introduced. |
| Page smoke checks | Eleven routes returned 200, seven requested navigation links clicked successfully, exercise library rendered fifty articles. Browser reported no page errors. |
| Controls/persistence | All fourteen application button instances across the pages were clicked; no mutation requests or application text/URL changes. Eleven development-tools buttons are excluded from the application count. Saving workout Sets=5 and reloading restored an empty field. Saving changed name/metric units and reloading restored static defaults. |
| Mobile layout | At 375×812, eight audited routes had document width 375 and no horizontal overflow. This does not verify mobile keyboard usability, other widths or a working logger. |
| API probes | AI empty/two different profile inputs → 200 identical fallback. AI `onboarding: 3` → 500 non-JSON error. Stripe valid plan/unconfigured → 400 JSON. Invalid Stripe plan → 500 non-JSON error. Unconfigured webhook → 400 JSON. No paid provider calls or database mutations were made. |
| Secret source scan | Heuristic patterns across all 54 initially tracked files found no embedded private key/credential matches. Names/presence inspected only; no values printed. Not proof of history cleanliness or production bundle safety. |

Machine-local browser evidence: `/workspace/.cloud-setup/audit/browser-results.json`; helper: `/workspace/.cloud-setup/audit/browser-check.cjs`. These are not committed test infrastructure.

## Existing Functionality

Navigation, page rendering, responsive shell, native text/number/select/textarea editing, static exercise instructions and chart rendering work. A chart tooltip displayed in a separate browser probe. The API's no-key fallback and explicit unconfigured Stripe responses work as described above. These are the only directly demonstrated behaviors; registration, persistence, training, nutrition calculations and coaching were not demonstrated.

### Visible control audit

Statuses refer to product behavior: WORKING, PARTIAL, UI ONLY, BROKEN, UNKNOWN. Native editing is separate from saving.

| Location/control | Status | Evidence and persistence |
|---|---|---|
| Brand/Home; desktop Workout/Meals/Progress/Coach/Library/Settings links | WORKING | Links reach valid pages; browser clicked the seven main destinations. |
| Mobile Home/Workout/Meals/Progress/Coach links | UNKNOWN for direct mobile clicks | Same working Link targets; responsive nav renders; mobile navigation clicks were not separately tested. Library/Settings have no mobile-nav entries. |
| Home Start onboarding; Ask the AI coach; Open coach chat; login Create your profile | WORKING routing | Existing anchors target `/onboarding` or `/coach`; destination pages returned 200. No account/plan/chat behavior implied. |
| Home and workout Log workout; Swap exercise | UI ONLY | Four button instances; no handlers, navigation, dialog or request after click. |
| Workout Sets/Reps/Weight/RPE × three exercises | PARTIAL | Native editable fields only; no independent per-set model, numeric bounds, labels or storage. |
| Workout Save log | UI ONLY | No request; entered value disappeared after reload. |
| Nutrition Meal name/Calories/Protein; dietary preference select | PARTIAL | Native editable controls; select does not filter suggestions or calculate totals. |
| Nutrition Add meal | UI ONLY | No mutation or list update. |
| Progress chart pointer tooltip | WORKING display | Recharts tooltip renders hard-coded series; no real history behind it. |
| Progress metrics/habit cards | UI ONLY | Display elements, no logging controls; fixed data. |
| Coach message textarea | PARTIAL | Native editable draft only; not submitted or persisted. |
| Coach Send to coach | UI ONLY | No network call, response or storage. |
| Library cards | WORKING static content | Fifty cards show instructions/safety text. No search, filters, media or detail interaction. |
| Settings display name; units; progress email; progression select | PARTIAL | Native changes work, but no effect on app calculations/notifications/storage. |
| Settings Save settings | UI ONLY | Browser reload restores Austin/imperial. |
| Login email/password fields | PARTIAL | Native inputs only; no auth validation/session. |
| Login Sign in; Send magic link | UI ONLY | Both clicks produce no request or session. |
| Onboarding age/height/weight/waist; sex/fitness/location/days selects; two free-text textareas | PARTIAL | Editable browser values; no profile state, wizard, validation or persistence. No explicit session duration or structured equipment selection. |
| Onboarding Generate personalised plan | UI ONLY | No call to the existing plan route. |
| Subscription Current plan; two Upgrade buttons | UI ONLY | No checkout call or persisted subscription state. |
| Admin cards | UI ONLY | Static display, no user/exercise/safety management controls. |
| Invalid API input handling | BROKEN | Bad AI object type/Stripe enum returned uncaught 500 instead of structured validation response. |
| Configured Supabase authentication and live AI/Stripe | UNKNOWN | Bindings absent; no live verification. |

## Partial Functionality

The scaffold covers most intended screens, auth client construction, a sizable SQL data model, plan-generation prompts, payment route shapes and static exercise metadata. None is connected into the register → onboard → generate → log → history → progress → coach loop. Native control values live in the DOM, not persistent client application state. There is no stored user identity driving the dashboard.

## Missing Functionality

Missing: registration/logout/auth callbacks, actual login, session-aware UI, profile/onboarding/settings CRUD, applied migrations, program services, current/upcoming schedule resolution, workout start/save/complete/history, set-level records, timers, safe swaps, progression, measurements, legitimate chart/dashboard calculations, meal/water logging, recovery/habit logging, conversations/context retrieval, deterministic AI safety handling, account deletion, labels/loading/errors/empty states and automated unit/service/E2E coverage. The required MVP release journey cannot run today.

## Demo / Hard-Coded Data

| Source | Sample values masquerading as personal data |
|---|---|
| `app/page.tsx` | Workout consistency 86%, 6 of 7 days; strength +12%; recovery 78; protein adherence 91%, 136g/day. |
| `components/today-workout.tsx` | Same full-body workout and six movements for everyone; 45-minute moderate-load claim. |
| `app/workout/page.tsx` | Three fixed logging exercises unrelated to a stored plan. |
| `components/nutrition-panel.tsx` | 1,920 calories, 12% deficit, 135g protein, fixed salmon/lentil meal. |
| `components/progress-chart.tsx` | Six weeks of invented weight, waist and strength values. |
| `app/progress/page.tsx` | −4.1 lb, −1.7 in, 7,840 steps, 7h 12m sleep. |
| `components/habit-grid.tsx` | 83% completion, streak 12, Done today, 7h 20m sleep. |
| `components/coach-panel.tsx` | Claims all planned sets completed at RPE 6–7 and suggests 2.5% increase without history. Banner claims safety flag creation, which does not occur. |
| `app/coach/page.tsx` | Fixed coach greeting rather than a conversation. |
| `app/settings/page.tsx` | Austin, imperial, weekly email and moderate progression defaults. |
| `app/admin/page.tsx` | 1,248 active members, eight workout types, three pending safety flags. |
| `app/api/ai/plan/route.ts` | Fixed default plan returned regardless of supplied profile when key absent; not labelled as demo in response. |

Catalog content is intentionally authored reference data, not fabricated user performance: fifty exercise definitions in TypeScript and fifty SQL seed exercises plus five foods. Subscription prices are static product configuration. Catalog/schema seeds are not proof of a live database or subscription.

## Database

The repository intends **Supabase PostgreSQL**, using Supabase Auth's `auth.users` foreign keys and `@supabase/supabase-js`/`@supabase/ssr`. There is no ORM, database connection configuration or evidence of an applied schema in this machine. No app query reads or writes these tables. `supabase/schema.sql` defines eighteen tables:

| Tables | Intended purpose and gaps |
|---|---|
| `profiles`, `onboarding_responses` | Identity/profile, units, health/equipment/goals/preferences. Onboarding allows multiple rows/user; no canonical current profile or session minutes. |
| `subscriptions` | Stripe IDs/tier/status; webhook does not update it. |
| `exercises`, `food_items` | Reference catalogs; alternative names are free text; media empty. |
| `workout_plans`, `workout_days`, `workout_exercises` | JSON plan plus schedule/exercise rows. Parent FKs and independent user IDs do not enforce matching ownership. |
| `workout_logs`, `exercise_set_logs` | Basic performance storage; no completion timestamp/status model, numeric range checks, canonical weight unit or uniqueness for duplicate sets. |
| `nutrition_targets`, `meal_logs` | Targets and meals; no calculator, mutation or aggregation. |
| `body_metrics`, `habit_logs` | Per-user/date unique rows; no active calculations or check-in UI. |
| `progress_reports`, `ai_coach_messages`, `safety_flags` | Reports, flat messages and flags; no conversation parent, business service or UI writes. |

Schema includes pgcrypto, three enums, user/date indexes, update triggers and RLS. Only role values in coach messages and a few uniqueness constraints validate data. No structured water log, recovery check-in, habit definition or exercise-alternative relation exists. Raw schema creation is not rerunnable migration infrastructure; seed inserts are not idempotent and may duplicate on repetition. SQL was inspected, not applied to a remote project.

**Recommendation:** retain Supabase PostgreSQL and Supabase Auth. Add versioned migrations, generated database types, Zod mutation schemas, authenticated server services and RLS/column privileges. Reuse existing tables where their semantics fit; migrate deficiencies instead of replacing the datastore or introducing a second ORM by default. Keep external identity in `auth.users`, profile keyed uniquely by user, canonical units, explicit private health/preferences, and server-controlled roles. Never use a service-role key in normal user CRUD.

## Authentication

`lib/supabase/browser.ts` and `server.ts` build clients from public URL/anon key; server helper adapts Next cookies. These helpers are not called by login/onboarding/settings pages. There is no signup, login submission, logout, callback route, route-level data authorization or profile creation trigger/service. Middleware fails open when configuration is absent and `/admin` has no admin-role validation. Session restoration and user isolation cannot be claimed.

**Recommendation:** complete existing Supabase Auth integration using cookie-based SSR, signup/email verification or password/magic-link login, callback exchange and logout. Validate every mutation server-side with a verified user; derive user ID from the session, never the body. Middleware is navigation assistance; per-service authorization and database RLS remain mandatory. Preserve login/settings UI and add behavior/labels/status rather than redesigning it.

## Environment variable names and integrations

All application-required names below were **absent** in the current process and have no saved binding in the configuration metadata. No variable values or credential files were displayed.

| Name | Intended use |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public project URL; needed for live auth/database. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable Supabase client key; safe only with correct RLS. Never replace with service-role key. |
| `OPENAI_API_KEY` | Private server plan-generation key. Current onboarding secret tool reserves this target name; a later integration must use a supported binding and explicitly planned server change. No key requested for the audit. |
| `STRIPE_SECRET_KEY` | Private server checkout/API credential. |
| `STRIPE_WEBHOOK_SECRET` | Local webhook-signature verification secret; a destination-proxy placeholder is not sufficient for local HMAC verification. |
| `STRIPE_PRO_PRICE_ID`, `STRIPE_PREMIUM_PRICE_ID` | Non-secret Stripe price identifiers. |
| `NEXT_PUBLIC_APP_URL` | Public origin for checkout redirect URLs. |

Optional setup tooling uses `NEXT_TELEMETRY_DISABLED` and `pnpm_config_verify_deps_before_run`. Platform GitHub access was verified through Git, without assuming an unset/present token proves access.

Actual package registry access succeeded. Font requests to `fonts.googleapis.com` and `fonts.gstatic.com` are denied by current proxy policy; those hosts are added to the saved draft while preserving the package-manager preset. Live optional integrations later require a real project-specific Supabase hostname, `api.openai.com` and `api.stripe.com`, plus appropriate secure bindings. Unknown Supabase domains or credentials were not invented or provisioned.

## Security Risks

1. **Potential self-service admin escalation in the proposed schema.** `profiles` insert/update policies constrain `user_id` but not `role`. Under standard Supabase client table privileges, a user could set their own role to admin, then `public.is_admin()` authorizes broad reads/admin actions. This is a source-level policy defect, not a reproduced live attack: project grants/database availability are unknown. Restrict role writes with column grants and server-controlled role storage; test direct client mutations.
2. **Fail-open guards and unguarded endpoints.** All protected pages were anonymously accessible with current missing config. AI/checkout routes do not verify users even when provider keys are configured; future key configuration could expose paid request abuse. `/admin` checks no role.
3. **Cross-user parent-link integrity.** Own `user_id` checks do not prove that referenced plan/day/log/exercise records belong to that same user. Use tenant-consistent composite foreign keys and/or explicit relation policies; test forged foreign IDs.
4. **Insufficient validation/error handling.** Broad AI records and unhandled parse/provider/output errors; no numeric bounds in SQL/logger. AI output is only JSON-parsed and may violate limitations/equipment/safety. Invalid requests currently yield 500.
5. **AI safety/privacy incomplete.** Prompt copy is not deterministic triage; arbitrary user input is forwarded rather than minimal trusted stored context. No safety-output enforcement, consent, context minimization, rate limits or flags written.
6. **Incomplete payment ownership.** Checkout lacks user/customer linkage; webhook events do not persist status or deduplicate. Signature checking exists in code but was not tested with real bindings.
7. **Security-definer review.** Pin `is_admin()` search path and minimize grants; keep user-editable fields separate from authorization state. Default Supabase grants/policies must be tested rather than assumed.
8. **Secrets evidence is limited.** No private key matches found in current source. Private provider variables occur only in server routes, but production bundle/payload checks and Git history scan were not completed. No service-role credential should be exposed through `NEXT_PUBLIC_*`.

There are currently no actual user-data CRUD queries to approve as safe. That absence does not satisfy privacy requirements.

## Technical Debt

Wrong root-level run instructions and duplicated source; missing `.env.example`; unpinned Node/package manager; incomplete pnpm lifecycle approvals; no ESLint config or tests/CI; build-time remote font dependency; no versioned migrations or generated DB types; untyped tuple cast/catalog IDs; missing input labels and success/failure/loading/empty states; fabricated metrics; incomplete subscription handling; no isolated calculation/services layer. These should be addressed in their relevant approved phase. The audit did not repair them by changing source or disabling checks.

## Existing Components To Reuse

Retain AppShell navigation/responsive layout, global styling/theme, card/button/input/select/textarea primitives, metric cards, chart presentation, workout/nutrition panels and exercise card content. Extend them with labels, controlled state, validated data and honest empty/loading/error states. Preserve current URLs. Convert static TodayWorkout and logger into data consumers. Reuse Supabase SSR scaffolding after hardening; reuse schema concepts and exercise cues after normalization. Keep prompt copy as one input to a tested safety service, not the safety mechanism itself.

## Phase 1 plan and stop point

The detailed per-requirement plan, proposed migrations, exact anticipated files, tests and release gate are in [phase-1-plan.md](phase-1-plan.md). All fifty-two requirements are mapped in [requirements.md](requirements.md). Phase 1 has **not** started; no deployment, Vercel change or GitHub settings change was made.

## Environment setup outcome

Dependencies, typechecking and the development demo are usable. Production readiness is blocked by font-domain access; lint remains a repository tooling defect. Saved setup/start instructions reproduce installation without editing protected source and explain fresh-task service startup. Current running processes do not survive publication. Review/save the font domain changes in environment settings and retry the build before calling the environment fully ready or publishing a validated production snapshot.

Files added to the repository: `docs/requirements.md`, `docs/implementation-audit.md`, `docs/phase-1-plan.md`.

Local-only files created: `/workspace/.cloud-setup/install.sh`, `/workspace/.cloud-setup/start.md`, `/workspace/.cloud-setup/install-app/package.json`, `/workspace/.cloud-setup/install-app/pnpm-lock.yaml` (copies), `/workspace/.cloud-setup/install-app/pnpm-workspace.yaml` (setup approvals), `/workspace/.cloud-setup/audit/browser-check.cjs`, `/workspace/.cloud-setup/audit/browser-results.json`. The installer also generated local pnpm workspace/store metadata. Generated outputs: app `node_modules/`, `.next/`, `tsconfig.tsbuildinfo` and `/workspace/.pnpm-store/`. Repository-local metadata modified: `.git/info/exclude`, additively excluding only those three app output paths. Supplied attachments were downloaded under `/workspace/attachments/` for reading. Temporary unsuccessful pnpm global configuration was removed.

Saved environment draft fields: `install_script`, `start_skill`, and custom network domains `fonts.googleapis.com` / `fonts.gstatic.com`. Existing repository membership, package-manager network presets and secret bindings were preserved. Draft persistence was confirmed; these saves neither applied networking to the running instance nor published it. No credentials were added. Local setup/evidence files are not application implementations.
