# Issue #3 foundation source assurance

22/10/2026; base `dcfe015c0a081329445502348db4497708202a00`.
This is a source qualification checkpoint. Issue #3 remains incomplete.

The profile and draft PUT handlers previously decoded request JSON before
service authentication. Actual-handler regressions reproduced anonymous 400,
413 and 415 responses before user verification, and consumption of a
schema-invalid anonymous body before its eventual 401. No private-data access
or unauthorised persistence bypass was reproduced.

Both handlers now check origin, verify the user, then decode the bounded body.
Services retain their own authentication for independent callers. This adds
one verified-user lookup per same-origin PUT; it avoids expanding service APIs
or trusting caller-supplied identity. Authenticated validation, error messages
and persistence calls are unchanged. No UI, schema, database types, provider
configuration or legacy root application implementation changed.

## Executed source checks

Node 22.23.1, Corepack-selected pnpm 11.19.0; existing controller-copied
dependencies, no installation. Lockfile SHA256:
`5df3e4352ea2d6c12983084bcd07eda24a1749e6d0760932ad7dbac45f0f8270`.
Commands ran from `Primetime-50/`, with writable scratch TMPDIR.

| Check | Result |
|---|---|
| Pre-fix actual-handler regression | RED: 8 failures; 14 characterisation cases passed |
| Repaired route suite | GREEN: 22 passed |
| Disposable copy restoring exact base route files | RED: same 8 failures; restored repair GREEN: 22 passed |
| Existing auth/actions/callback/session source characterisation | 23 passed, no production changes to these paths |
| `corepack pnpm lint` | PASS |
| `corepack pnpm typecheck` | PASS, including authored integration/browser tests |
| `corepack pnpm test` | PASS: 87 tests (42 existing, 45 added) |
| `NEXT_TELEMETRY_DISABLED=1 corepack pnpm build` | PASS: own Next.js 15.5.20 build, 21 generated pages |
| `corepack pnpm test:security` | PASS: 1 test against this build's browser bundles |

Unit tests invoke production handlers, services, guards, auth actions,
callback and cookie adapters. External SDK/framework doubles isolate these
contracts; they do not prove provider sessions, database persistence or rendering.
The build and unit runs emitted Node's existing experimental proxy-agent warning.

## Original acceptance mapping

| Original criterion | Source evidence and remaining gate |
|---|---|
| Registration/confirmation, returning password/magic-link login, logout and renewed session | Action/callback/verified-user/cookie forwarding characterisation passes. New real-stack lifecycle test exercises registration, rejected unconfirmed login, fixture confirmation, password login/logout, refreshSession and a one-use provider-issued callback. Real-stack execution and browser session renewal remain NOT RUN. |
| Exact profile, goals, health, equipment, availability and preferences across refresh/logout/login | Route/service validation contract passes. Existing RPC stores canonical values. New lifecycle test compares every profile value and timestamps after session refresh/relogin; expanded browser test compares the full DTO after reload/relogin. Database/browser execution NOT RUN. |
| Draft restore, atomic clear and honest new-account states | Production reads return null for incomplete profiles; onboarding restores drafts, settings links incomplete users to onboarding. Lifecycle test checks exact draft restore across logout/login and that a late invalid-equipment RPC rolls back profile completion and draft deletion. Expanded browser test checks initial null states, restored fields and clear. Database/browser execution NOT RUN. |
| Failed-save input retention and actionable feedback | Handler tests preserve controlled validation/save errors and conceal provider details. Existing controlled UI state retains input, disables pending controls and reports errors. Browser test now also checks pending controls, single save request and unchanged stored profile under injected network failure before real retry. Rendering/input behaviour NOT RUN. |
| Fixture confirmation versus actual email | Tests explicitly label administrative confirmation and generated one-use links as fixtures. No actual mailbox or deployment delivery evidence; NOT RUN. |

## Runnable outstanding gates

With a separately authorised isolated local Supabase stack, the ordered
migrations and matching local app configuration described in
[development.md](development.md):

- `corepack pnpm test:integration` runs existing RLS/service checks plus
  `foundation-lifecycle.test.ts`. The new test uses real Supabase Auth,
  production SSR client, auth actions, callbacks, route handlers, services and
  PostgREST/RPC, with only framework request-cookie/redirect adapters.
  It creates and deletes one unique fixture account and refuses remote targets.
- Rebuild for the documented test origin, then execute the desktop/mobile
  foundation browser tests through the separately permitted official Codex
  connection. No browser/computer use occurred in this assignment.

Full isolated Supabase is unavailable under the existing Docker/socket
restrictions. No socket or transport retry was made. No integration, generated
database types, configured PostgreSQL 15, browser, real email, hosted or
deployment acceptance is claimed. Parent PG18.1 SQL-only receipts were not
used to qualify this source. The pending independent exact-candidate assessment
belongs to Glaize; this checkpoint does not authorise issue closure.
