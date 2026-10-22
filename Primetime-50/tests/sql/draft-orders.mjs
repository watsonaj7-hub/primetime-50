// Actual SQL transactions, no mocked storage. Shared by isolated SQL-only and
// configured full-stack suites. Caller supplies three dedicated max:1 clients.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

// Return a lazy driver query so its binding can also be checked without sockets.
export function completeProfile(db, payload) {
  return db.unsafe("select public.save_foundation_profile($1::jsonb)", [payload]);
}

export async function runDraftOrderCases(connect, users, payload) {
  assert.equal(users.length, 5, "five unique incomplete fixture accounts required");
  const first = connect(), second = connect(), observer = connect();
  const names = [];
  const requestDraft = db => db.unsafe(
    "insert into public.onboarding_drafts(user_id,draft_json) values(auth.uid(),'{\"step\":3}') on conflict(user_id) do update set draft_json=excluded.draft_json"
  );
  const complete = db => completeProfile(db, payload);
  async function actor(db, id, isolation = "read committed") {
    await db.unsafe("set role authenticated");
    await db`select set_config('request.jwt.claim.sub', ${id}, false)`;
    await db.unsafe(`begin isolation level ${isolation}`);
    await db.unsafe("set local statement_timeout='10s'");
  }
  async function assertBlocked(pid, blocker) {
    for (let n = 0; n < 200; n++) {
      const [row] = await observer`select ${blocker}::int = any(pg_blocking_pids(${pid}::int)) as blocked`;
      if (row.blocked) return;
      await delay(20);
    }
    throw new Error("second writer did not demonstrably block behind first writer");
  }
  async function state(id, completed, draft) {
    const [row] = await observer`select onboarding_completed_at is not null as completed,
      (select draft_json from public.onboarding_drafts where user_id=${id}) as draft
      from public.profiles where user_id=${id}`;
    assert.equal(row.completed, completed);
    assert.deepEqual(row.draft, draft);
  }
  function outcome(promise) {
    return promise.then(() => ({ ok: true }), error => ({ ok: false, code: error.code }));
  }
  try {
    const [a] = await first`select pg_backend_pid() as pid`;
    const [b] = await second`select pg_backend_pid() as pid`;
    // Draft owns the gate/parent first. Completion must wait, then clear it.
    await actor(first, users[0]);
    await requestDraft(first);
    await actor(second, users[0]);
    let pending = outcome(complete(second));
    await assertBlocked(b.pid, a.pid);
    await first.unsafe("commit");
    assert.deepEqual(await pending, { ok: true });
    await second.unsafe("commit");
    await state(users[0], true, null);
    names.push("draft-first commit is followed by completion and clear without deadlock");

    // Completion owns the parent and clears an existing child. Late upsert must
    // block BEFORE taking the child lock and then fail, rather than invert locks.
    await actor(first, users[1]); await requestDraft(first); await first.unsafe("commit");
    await actor(first, users[1]); await complete(first);
    await actor(second, users[1]);
    pending = outcome(requestDraft(second));
    await assertBlocked(b.pid, a.pid);
    await first.unsafe("commit");
    assert.deepEqual(await pending, { ok: false, code: "55000" });
    await second.unsafe("rollback");
    await state(users[1], true, null);
    names.push("completion-first commit rejects blocked late upsert without deadlock");

    // A rolled-back completion must not leave a permanent denial or erase input.
    await actor(first, users[2]); await requestDraft(first); await first.unsafe("commit");
    await actor(first, users[2]); await complete(first);
    await actor(second, users[2]);
    pending = outcome(requestDraft(second));
    await assertBlocked(b.pid, a.pid);
    await first.unsafe("rollback");
    assert.deepEqual(await pending, { ok: true });
    await second.unsafe("commit");
    await state(users[2], false, { step: 3 });
    names.push("rolled-back completion releases waiting draft and preserves incomplete state");

    // An old repeatable-read snapshot cannot resurrect a completed draft after
    // the gate is released. Parent row locking must force 40001.
    await actor(second, users[3], "repeatable read");
    await second`select onboarding_completed_at from public.profiles where user_id=${users[3]}`;
    await actor(first, users[3]); await complete(first); await first.unsafe("commit");
    assert.deepEqual(await outcome(requestDraft(second)), { ok: false, code: "40001" });
    await second.unsafe("rollback");
    await state(users[3], true, null);
    names.push("stale repeatable-read snapshot cannot resurrect draft");

    // Plain UPDATE locks an existing child row, unlike an INSERT-only test.
    // It too must take the statement gate before its tuple lock.
    await actor(first, users[4]); await requestDraft(first); await first.unsafe("commit");
    await actor(first, users[4]);
    await first.unsafe("update public.onboarding_drafts set draft_json='{\"step\":2}' where user_id=auth.uid()");
    await actor(second, users[4]);
    pending = outcome(complete(second));
    await assertBlocked(b.pid, a.pid);
    await first.unsafe("commit");
    assert.deepEqual(await pending, { ok: true });
    await second.unsafe("commit");
    await state(users[4], true, null);
    names.push("direct draft UPDATE before completion preserves lock order and final clear");
    return names;
  } finally {
    // Each factory must create a dedicated max:1 client. Release both open
    // transactions in parallel so a failed lock assertion cannot strand them.
    await Promise.allSettled([first.unsafe("rollback"), second.unsafe("rollback")]);
    await Promise.all([first.end({ timeout: 1 }), second.end({ timeout: 1 }), observer.end({ timeout: 1 })]);
  }
}
