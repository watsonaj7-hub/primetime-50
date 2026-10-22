# Issue 9 finite pilot-loop source qualification

Initial source9 implementation, 22/10/2026; final source checks and freeze
23/10/2026 (Melbourne). Branch
`glaize/issue-9-pilot-assurance`, base/HEAD
`7a27b59dc0f9faec9e1620051a830bff2ac7dfad` after PR22/source8.
This is an uncommitted source handoff, not independent review, qualified delivery,
issue closure, deployment or pilot acceptance. Source9 accepted repair dispatches:
**0/5 consumed; five remain**. Existing source3=2, source2=1, source7=1,
source4/6/8=0 histories are unchanged. Glaize owns controller verification,
official rendered qualification, independent review, publication and settlement.

## Implementation and evidence boundaries

No production defect was reproduced and no production code, visual design,
dependency, package script, schema, migration, grant or auth policy changed.
Root legacy duplicate application files remain untouched. The actual application
is `Primetime-50/`.

`tests/integration/pilot-loop.test.ts` adds one integrated executable scenario to
the existing Vitest integration project. It uses real Supabase Auth password
login/logout actions, the production SSR client and verified-user guard, profile
and draft routes/services, reviewed selection, workout routes/services, RPC/REST
and the production workout/history controllers. Only Next request-cookie and
redirect adapters are substituted. `tests/pilot/route-transport.ts` dispatches
in-process Requests to the actual handlers; it is not a browser/HTTP server or
proof of browser cookie transport. It can delay/drop an acknowledgement **after**
the handler executes. It cannot manufacture a successful database response.

The scenario provisions two unique, administratively confirmed disposable
`example.test` accounts using the existing local-stack pattern. This is not
email delivery or consent. New registration/confirmation, unconfirmed-login
rejection, token callback and refreshed-session paths remain covered by the
unchanged `foundation-lifecycle.test.ts`; both suites must execute under #17.
The new scenario checks:

- Incomplete profile/draft, A/B draft denial while A's draft actually exists,
  logout/login draft restore, completed onboarding and draft clear, settings
  edit, invalid profile rejection and exact owner values.
- One unique **TEST DATA ONLY** reviewed catalogue version, protected fixture
  insertion, exact persisted compatibility, selection/start through the actual
  controller, two distinct original set IDs and sparse saved revisions.
- Retained invalid reps, an actual committed write with a delayed then lost
  acknowledgement, blocked overlapping save, explicit readback, sparse retry,
  invalid SQL rollback and stale-revision rejection without changing saved data.
- B's own incomplete/draft/profile positive controls; denial of forged profile
  and draft owners, A-owned profile/health/equipment/draft/log/set reads, exact-ID
  logger/history reads, start/save/complete reuse and direct RPC/parent insertion.
- A's unchanged record after B's attempts; completion replay with one timestamp,
  one history entry, actual sign-out denials, cleared controller state, B's denied
  reopening and A's returning login reopening identical original sets/profile.

The suite revokes only its unique synthetic catalogue version and deletes only
its unique fixture accounts in cleanup. It does not seed production, confer
professional approval or authorise database setup. Existing connected suites
retain their SQL/RLS, immutable provenance, transaction/race, numeric boundary,
legacy-parent and history coverage; they are not replaced by this one scenario.
**All connected tests are typechecked; runtime execution remains NOTRUN.**

`tests/unit/pilot-composition.test.ts` adds six production-wired characterisation
cases: controller -> actual route -> service -> actual requireUser guard ->
external SDK double. They cover distinct sparse saves and reopened history,
invalid input before storage, lost committed acknowledgements, service-mapped
503 with no commit, reconciliation/retry, delayed writes across invalidation and
reactivation, repeated completion identity/effects, explicit B owner filtering
and anonymous auth-before-body. The mock store's completion counter is a unit
fixture side-effect assertion, not real SQL idempotency evidence.

All six passed against unchanged production code: **characterisation, no
invented pre-repair RED**. In an isolated disposable copy, removing the production
service owner filter made two cases fail (including B receiving A's exact-ID
record); restoring the exact service returned six PASS. The candidate service
was never mutated. There is no product repair or old-function-restoration claim.
Prior source7/8 client-generation races and source3/4 auth/authority tests are
retained and freshly included in the canonical unit suite.

## Source checks

Final gate results and raw argv/exits/log seals are recorded in the external
builder packet `/home/mike/.hermes/cache/scratch/pf9-owner/e`.
Node 22.23.1, pinned Corepack pnpm 11.19.0 and existing locked dependencies are
used. Child environments contain only PATH/HOME/TMPDIR, optional COREPACK_HOME,
NEXT_TELEMETRY_DISABLED and the seven explicitly synthetic scanner keys.
No local credential configuration or provider call is required.

Final executed results, all exit 0:

| Check | Result |
| --- | --- |
| Production-wired focused composition | 6 characterisation cases PASS |
| Disposable owner-filter removal / exact restoration | 2 FAIL + 4 PASS / 6 PASS; sensitivity only |
| Canonical unit suite | 283 PASS across 20 files (baseline 277 plus 6) |
| Lint | PASS, no warnings |
| Nonincremental TypeScript | PASS, including all connected tests and component fixture |
| Production build | PASS, Next 15.5.20, 23 generated pages |
| Fresh browser-bundle security | 1 PASS |
| Connected integration runtime | NOTRUN, Austin #16 then #17 |
| Source9 official render/mobile/keyboard | NOTRUN, parent-owned pending |

The ordered final checks are `corepack pnpm test`, `corepack pnpm lint`,
`corepack pnpm exec tsc --noEmit --incremental false`, `corepack pnpm build`,
then `corepack pnpm test:security`. Preliminary checkpoint receipts are retained
separately and do not replace final gate receipts. No skip/empty collection is
credited as PASS. No `test:integration`, DB/Docker/socket/alternate-endpoint,
`test:e2e` or `test:guards` command was run. The latter two use the historical
standalone Playwright runner and are not the permitted browser execution path.

## Production-component render fixture and official-browser protocol

`tests/fixtures/pilot-flow.tsx` exports `PilotFlowFixture`. It imports the actual
`ProfileForm`, `WorkoutView`, `HistoryView`, `WorkoutController` and
`HistoryController`; no production markup is cloned and no pure-view extraction
was needed. It supplies synthetic identity and a disposable in-memory transport
using existing validation schemas and the existing TEST DATA ONLY snapshot.
It overrides fetch only inside this isolated fixture, restores it on unmount,
and refuses external/unknown transport. Never import it into production routes.
Fictional reviewer fields are software fixtures, never actual content approval.

The fixture starts with a clearly synthetic, editable prefilled onboarding
draft. Navigation mounts the actual settings form using the profile saved by
onboarding. Workout selection is unavailable until that synthetic profile is
saved. The actual controller performs selection/start, input/save/readback,
completion and history reads through the labelled double. Fixture links adapt
`/settings`, `/workout?id=...` and `/progress?id=...` into the corresponding
production view/controller; this checks fixture navigation only, not Next route
transport. Unknown destinations are blocked with a notice. Reload discards all
data. Transport controls explicitly fail or delay the next non-draft write,
release a held write and simulate sign-out/return. Autosave is a distinct double.

Parent-host entrypoint and corrected v2 Vite recipe are prepared outside the
candidate at `/home/mike/.hermes/cache/scratch/pf9-owner/browser/`. Use bare React
and ReactDOM imports, the existing node_modules link, React dedupe and explicit
optimizeDeps. `server.mjs` is prepared but **not launched**; the parent owns hosting
and server cleanup. `style.css` must be the fresh production-build CSS, whose hash
is in the setup receipt. No new framework or dependency is installed.

Parent must use only the native official Codex Chrome extension, inspect its
current documentation, create one named task-owned localhost tab and record:

1. At desktop and 320/375/768 CSS widths, edit onboarding display name and a
   numeric value, use Tab/Shift+Tab and Enter/Space through all four steps.
   Continue must not save. Save profile; navigate to settings, verify exact
   persisted synthetic values, edit/save again. Check labels, status/alert,
   disabled pending fields, usable focus and scroll/client/control bounds.
2. Exercise invalid profile input; go back, correct it and retry. Arm Fail next
   write before Save settings; confirm useful failure and all retained fields.
   Arm Delay next write; verify pending controls and no extra submit, Release
   write, verify truthful success. Check success only follows release.
3. Enter workout selection; keyboard-select the TEST DATA ONLY version and start.
   Fill distinct values (e.g. 8/12.5/7 and 6/15/8). Enter invalid RPE 11 and save:
   alert must identify it, focus must be useful, every input must remain.
   Correct RPE; exercise synthetic failed save, Check saved values, retention,
   retry, delayed save/release and distinct original identities/revisions.
4. Complete only after checked saves. Repeated action/reopen must preserve one
   original completion and timestamp. Open history, original set/provenance
   disclosures, permanent session and logger links; verify the same original
   values and fixture navigation. Test empty history before completion too.
5. Simulate sign-out while a delayed workout operation is held; verify private
   controller state clears, then release the old operation and return. Open the
   original record/history and confirm stale UI responses do not overwrite it.
   This is synthetic identity behaviour, not real reauthentication acceptance.
6. Measure overflow with long provenance/disclosures open at every width, collect
   actual screenshots, record keyboard/focus/labels and distinguish extension
   noise from app errors. Reset viewport and verify; close only the owned tab
   and verify absence. Do not touch personal tabs, real accounts or settings.

Current-turn browser work was **inventory/bootstrap only**: official Chrome
extension backend 1, instance `619675ae-52af-4010-a6f4-ad1756b6edd9`, profile
`kaosjammo` was exposed. No tab was created, claimed, navigated or closed; no
viewport was changed. There was **no tool refusal or current route failure**.
Source9 render/mobile/keyboard/screenshots remain **NOTRUN — parent-owned pending
qualification**, not a database transfer and not a fabricated method gate.

Explicitly reused prior evidence: source7's closing official Chrome qualification
covered selector/logger keyboard order, invalid RPE/error focus, synthetic 503,
reconciliation/completion and widths 320/375/768/1440; source8's official v2 render
continuation covered original history/provenance, personal/reviewed records,
keyboard disclosures and 320/375/768/default geometry. Their production files are
unchanged here. Those results do not qualify the new integrated fixture or real
DB loop. Prior v1 harness failures remain historical setup failures; v2 uses
bare imports/node_modules/dedupe/optimisation, not the broken absolute React recipe.

## Original criteria and remaining owners

The original criteria are preserved without weakening their meaning:

| Original criterion | Implemented / verified source boundary | Remaining acceptance |
| --- | --- | --- |
| 1. The full non-mocked app/database loop passes for new and returning test accounts, with recorded exact commit and commands. | Integrated executable scenario plus unchanged registration lifecycle; all authored connected files typechecked. No runtime PASS. | Configured PG15/Supabase/Auth/REST/session/cookies/types and connected execution: Austin #16 then #17, **NOTRUN**. |
| 2. Invalid input/network failures retain input and show truthful feedback; repeated actions preserve idempotency. | Six production-wired unit characterisations; existing source3/7/8 tests reused; actual component fixture/protocol supplied. | New non-DB rendered interaction: parent, **NOTRUN**. Real failure/transaction/retry/DB idempotency: Austin #17, **NOTRUN**. |
| 3. Two-user negative tests cover the connected workflow, not just the profile service. | Integrated A/B scenario across draft/profile/health/equipment/selection/log/set/completion/history; route/service unit authority coverage. | Actual two-identity RLS/Auth/REST execution: Austin #16 then #17, **NOTRUN**. |
| 4. Common mobile widths have no horizontal overflow and keyboard-only users can complete the critical workflow. | Actual production-component integrated fixture and stepwise protocol supplied; source7/8 unchanged render evidence explicitly reused. | Source9 non-DB mobile/keyboard/focus/render: parent, **NOTRUN**, stays contributor-owned. Only connected cookies/real reauth/DB portion transfers to #17. |
| 5. No paid AI, Stripe, health-provider account or fabricated response is required; missing infrastructure is reported as blocked, not green. | No paid/provider dependency added. Doubles explicitly labelled; security/build source checks separate from connected execution. | No paid/provider or mock-backend-as-real claim; missing environment remains blocked. |
| 6. Austin's content sign-off and the agreed pilot evaluation are recorded separately from automated software evidence. | Actual #5 content, versioned rules/professional sign-off and pilot feedback/decision are **ABSENT** in the supplied current owner record. | Austin owns actual content/sign-off and agreed pilot evaluation. No invented feedback, consent or software-test substitute. |

Only genuinely database-dependent setup/execution transfers under the
22/10/2026 authority: [#16](https://github.com/watsonaj7-hub/primetime-50/issues/16)
then [#17](https://github.com/watsonaj7-hub/primetime-50/issues/17). With Austin's
separately authorised local setup and matching migrations/types, run
`corepack pnpm test:integration` from `Primetime-50/`, preserving actual account,
SQLSTATE, per-suite and cleanup results. Record source manifest, actual source
commit after parent publication, migration hashes/order and non-secret environment
identity. This worker neither executes stack discovery nor creates accounts.
Real browser HTTP/cookies/registration/reauthentication must then be exercised
through the official connection against that authorised local app using the
same workflow above, without the synthetic fixture or transport double.

Production has no actual reviewed catalogue approval. The safe unavailable
catalogue means the real app cannot start a reviewed workout until Austin's
content/approval exists; this is an intentional gate, not a defect to bypass.
No provider, clinical prescription, real user data, production deployment or
pilot-ready assertion follows from this source work.

The external freeze packet contains all tracked plus intended new source paths,
modes/sizes/SHA256/blob IDs, in-memory virtual tree, base/head/branch, nonempty
full-root newline index inventories and separate raw-index identities, owned and
excluded inventories, raw check receipts/seals and the host recipe. Source writes
stop at manifest creation. The parent must verify that exact candidate and raw
gates, run fresh-copy controller gates, complete source9 official render and
independent review, publish its factual closeout/readback, then assess any
published candidate before qualified delivery/closure. No staging, commit,
Git-object write, push, PR/comment/closure, email, cron, access/provider/settings
or instruction-file mutation is part of this writer handoff.
