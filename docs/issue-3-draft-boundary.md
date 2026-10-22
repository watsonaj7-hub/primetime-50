# Issue #3 I1: completed onboarding draft boundary

22/10/2026; repair cycle **1/5**, four remaining. This supplements the preserved
initial [source checkpoint](issue-3-foundation-source-assurance.md).
Issue #3 is not complete.

The independent reviewer identified a real inherited race: an already-started
draft PUT can upsert after the profile transaction clears the draft. Glaize
reproduced the late upsert succeeding on fresh native PostgreSQL 18.1 with the
four baseline migrations. That is attributed SQL-only RED, not Auth, PostgREST,
configured PostgreSQL 15 or browser acceptance.

## Production rule

The additive `20261022051500_completed_draft_boundary.sql` migration adds:

- The same transaction-scoped advisory gate in BEFORE STATEMENT triggers on
  both profiles and drafts, for INSERT/UPDATE/DELETE. Every normal table-write
  path, including upsert, multi-row writes and RLS-bypassing roles, acquires
  the gate before tuple locks.
- A draft INSERT/UPDATE guard that locks and reads its accessible profile.
  A completed profile rejects the write with SQLSTATE 55000. Existing RLS and
  grants remain; a hidden/missing parent fails closed. The parent lock also
  forces stale repeatable-read snapshots to abort rather than admit a draft.
- A profile UPDATE guard that prevents a non-null completion timestamp
  becoming null. The existing profile RPC still supports completed edits,
  preserves the first completion time and clears drafts in its transaction.

If draft saving takes the gate first, completion waits for it and then clears
the draft. If completion takes the gate first and commits, late drafts wait
and are rejected. If completion rolls back, the waiting draft remains valid.
Plain child UPDATE normally takes its tuple lock before a row trigger runs;
the statement gate prevents that lock from being held by a competing writer
while completion owns the parent and needs to delete the child.

The deliberate cost is global serialization of profile/draft mutations across
users until transaction end. This small foundation uses one gate to cover
privileged multi-owner writes without inventing an identity-based lock key.
Do not hold these transactions open. This protocol covers normal table DML;
arbitrary caller transactions that explicitly take row/advisory locks in a
different order can still deadlock and must follow gate-before-row order.
Privileged trigger disabling/schema destruction is outside the application
contract. No production grants or RLS policies were weakened.

No historical migration or existing row is rewritten/deleted by this migration.
Any already-stale legacy draft is preserved; further draft edits are rejected
for completed profiles, and the next legitimate profile save clears it through
the existing trigger. Migration application is a separate isolated/live gate.

The production draft service maps this specific database rejection to HTTP409
and explicitly says the draft was **not saved**, with direction to Settings.
The existing autosave status displays that outcome; other failures retain
their existing retry feedback. Input state, layout, semantics, navigation and
completed-profile editing remain unchanged. Rendered behaviour is NOT RUN.

PostgreSQL's [statement-trigger ordering](https://www.postgresql.org/docs/15/trigger-definition.html)
and [transaction/row lock behaviour](https://www.postgresql.org/docs/15/explicit-locking.html)
inform this design. They do not substitute for executing the candidate tests.

## Tests and bounded parent execution

Executed here: production route/service regression RED (503 instead of409),
then GREEN; disposable restoration of exact pre-fix saveDraft reproduced RED,
then restored repair GREEN. These tests double the external storage boundary
and do not qualify the SQL fix. Initial 87 source tests remain; one case added.

Authored, **NOT RUN here**:

- `tests/sql/draft-boundary.sql`: incomplete restore/write, rollback retaining
  exact draft, successful clear, late/duplicate direct denial, monotonic
  completion, completed edits, ownership/anonymous denial, owner/service-role
  INSERT and service-role direct UPDATE/reassignment protection, unchanged
  cleared state after denials.
- `tests/sql/draft-orders.mjs`: real parallel SQL transactions. Observes
  `pg_blocking_pids` before releasing the first writer, then checks both commit
  orders, completion rollback, stale repeatable-read and direct child UPDATE.
  Ten-second statement timeouts turn hangs/deadlocks into failures.
- Canonical integration includes these same order cases against the real local
  stack, authenticated/service-role PostgREST direct writes and production
  draft PUT409 in the existing lifecycle test.
- The browser test holds an actual outgoing draft PUT, completes the profile,
  releases the request to the real handler/database, checks the truthful
  denial/input retention/cleared draft, then edits in Settings.

Only Glaize/operator may run the following where native sockets are separately
authorised. From a frozen candidate copy's `Primetime-50/` with the same locked
dependencies:

```sh
TMPDIR=/home/mike/.hermes/cache/scratch POSTGRES_BIN=/home/mike/.pg0/installation/18.1.0/bin node scripts/test-draft-sql.mjs
```

The runner starts only a fresh private no-TCP cluster, applies **all ordered
migrations**, prints each SHA256, runs the sequential fixture plus five
concurrency cases, checks assertion inventory/no TCP, and stops only its own
cluster. Success removes its disposable files; failure retains evidence.
The SQL role/auth schema objects are explicit test fixtures. It never targets
a host database, retained account or production project.

For a SQL sabotage control, omit only the new migration in a separate
disposable candidate copy, run the same unchanged runner and expect late owned
upsert rejection to fail with SUCCESS; restore the exact new migration and
rerun. Do not remove or roll back a migration from an existing database.

With an authorised isolated full stack and ordered migrations available, use
`corepack pnpm test:integration`. Browser/mobile execution remains a separate
official Codex connection gate. No socket/Docker/transport retry or browser
execution occurred here; **0 native SQL assertions and 0 migrations applied**.
The CLI migration helper could not even display help because its telemetry
cache is read-only in this sandbox; the additive file was authored directly,
without changing HOME, permissions, telemetry settings or safeguards.
