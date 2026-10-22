// Real local Auth/PostgREST/SQL tests. Only request-cookie binding is substituted;
// accounts, reauthentication, RPC transactions, locks, RLS and constraints are real.
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { stackConfig, testAccount } from "../local-stack";
const context = vi.hoisted(() => ({ current: null as null | { supabase: SupabaseClient; user: { id: string } } }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: async () => {
  if (!context.current) throw new Error("Missing test identity"); return context.current;
} }));
import { POST, PUT, GET } from "@/app/api/workouts/route";
import { POST as complete } from "@/app/api/workouts/complete/route";
const config = stackConfig(); // Never run this suite without an authorised local stack.
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let a: Awaited<ReturnType<typeof testAccount>>, b: Awaited<ReturnType<typeof testAccount>>;
const id = randomUUID(), exercise_key = randomUUID();
const first = { id: randomUUID(), exercise_key, exercise_name: "Synthetic recording fixture; no approved prescription", set_number: 1, reps: 8, weight: 12.5, rpe: 7 };
const second = { ...first, id: randomUUID(), set_number: 2, reps: 6, weight: 15, rpe: 8 };
const start = { id, mode: "personal", timezone: "Australia/Melbourne" };
function req(method: string, body: unknown) { return new Request("http://localhost/api/workouts", { method, headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body) }); }
async function read() { const response = await GET(new Request(`http://localhost/api/workouts?id=${id}`)); expect(response.status).toBe(200); return (await response.json()).workouts[0]; }
beforeAll(async () => { a = await testAccount(config, admin); b = await testAccount(config, admin); context.current = { supabase: a.client, user: a.user }; });
afterAll(async () => { for (const account of [a,b]) if (account) await admin.auth.admin.deleteUser(account.user.id); });
it("starts one draft on concurrent retries; refuses changed provenance and reviewed claims", async () => {
  const responses = await Promise.all([POST(req("POST", start)), POST(req("POST", start))]);
  for (const response of responses) expect(response.status).toBe(200);
  expect((await read()).revision).toBe(0);
  expect((await POST(req("POST", { ...start, timezone: "UTC" }))).status).toBe(409);
  expect((await a.client.rpc("start_workout_record", { payload: { ...start, mode: "reviewed" } })).error).not.toBeNull();
});
it("guards draft provenance and timezone before completion while allowing an ordinary draft edit", async () => {
  const original = await admin.from("workout_logs").select("*").eq("id", id).single();
  expect(original.error).toBeNull();
  expect(original.data).toMatchObject({ completed: false, completed_at: null, record_timezone: "Australia/Melbourne" });
  // Trusted fixture reaches the trigger rather than authenticated managed-write RLS.
  // Positive control proves an accessible draft can still be updated.
  const edited = await admin.from("workout_logs").update({ pain_notes: "Synthetic draft guard positive control" }).eq("id", id).select("*").single();
  expect(edited.error).toBeNull(); expect(edited.data.pain_notes).toBe("Synthetic draft guard positive control");
  expect(edited.data.completed).toBe(false);
  for (const change of [
    { prescription_snapshot: { ...original.data.prescription_snapshot, version: 2 } },
    { record_timezone: "UTC" }
  ]) {
    // Exact 55000 matters: without the snapshot guard CHECK 23514 is insufficient,
    // and without the timezone guard this valid timezone change would succeed.
    expect((await admin.from("workout_logs").update(change).eq("id", id)).error?.code).toBe("55000");
    const after = await admin.from("workout_logs").select("*").eq("id", id).single();
    expect(after.error).toBeNull(); expect(after.data).toEqual(edited.data);
  }
});
it("round-trips distinct sets through real routes and renewed authentication", async () => {
  expect((await PUT(req("PUT", { id, expected_revision: 0, sets: [first,second] }))).status).toBe(200);
  await a.client.auth.signOut();
  expect((await a.client.auth.signInWithPassword({ email: a.email, password: a.password })).error).toBeNull();
  expect((await PUT(req("PUT", { id, expected_revision: 0, sets: [first,second] }))).status).toBe(409); // Lost-response retry: reload; never apply twice.
  const saved = await read();
  expect(saved.exercise_set_logs).toEqual([expect.objectContaining(first), expect.objectContaining(second)]);
  expect(saved.prescription_snapshot).toEqual({ source: "user_recorded", version: 1, prescription: null, weight_unit: "kg" });
});
it("rejects invalid SQL values atomically and stale saves, preserving prior values", async () => {
  const before = await read();
  const invalid = [ { reps: 101 }, { reps: 1.5 }, { weight: -1 }, { weight: "NaN" }, { weight: "Infinity" }, { rpe: 11 }, { set_number: 21 }, { user_id: b.user.id } ];
  for (const change of invalid) {
    const result = await a.client.rpc("save_workout_record", { payload: { id, expected_revision: 1, sets: [{ ...first, reps: 9 }, { ...second, ...change }] } });
    expect(result.error, JSON.stringify(change)).not.toBeNull();
    expect(await read()).toEqual(before);
  }
  expect((await PUT(req("PUT", { id, expected_revision: 0, sets: [{ ...first, reps: 3 }] }))).status).toBe(409);
  expect(await read()).toEqual(before);
});
it("preserves omitted sets, allows drafts and refuses incomplete completion", async () => {
  expect((await PUT(req("PUT", { id, expected_revision: 1, sets: [{ ...first, rpe: null }] }))).status).toBe(200);
  expect((await read()).exercise_set_logs).toContainEqual(expect.objectContaining(second));
  expect((await complete(req("POST", { id, expected_revision: 2 }))).status).toBe(409);
  expect((await read()).completed).toBe(false);
  expect((await PUT(req("PUT", { id, expected_revision: 2, sets: [first] }))).status).toBe(200);
});
it("serialises racing saves and requires the acknowledged revision for completion", async () => {
  const responses = await Promise.all([PUT(req("PUT", { id, expected_revision: 3, sets: [first] })), PUT(req("PUT", { id, expected_revision: 3, sets: [second] }))]);
  expect(responses.map(r => r.status).sort()).toEqual([200,409]);
  expect((await complete(req("POST", { id, expected_revision: 3 }))).status).toBe(409);
});
it("denies B all record/set references and direct mutations, including parent links", async () => {
  context.current = { supabase: b.client, user: b.user };
  expect((await (await GET(new Request(`http://localhost/api/workouts?id=${id}`))).json()).workouts).toEqual([]);
  expect((await PUT(req("PUT", { id, expected_revision: 4, sets: [first] }))).status).toBe(404);
  expect((await complete(req("POST", { id, expected_revision: 4 }))).status).toBe(404);
  context.current = { supabase: a.client, user: a.user };
  expect((await b.client.from("workout_logs").select("*").eq("id", id)).data).toEqual([]);
  expect((await b.client.from("exercise_set_logs").select("*").eq("workout_log_id", id)).data).toEqual([]);
  expect((await b.client.rpc("save_workout_record", { payload: { id, expected_revision: 4, sets: [first] } })).error).not.toBeNull();
  expect((await b.client.rpc("complete_workout_record", { payload: { id, expected_revision: 4 } })).error).not.toBeNull();
  expect((await b.client.rpc("start_workout_record", { payload: start })).error).not.toBeNull();
  expect((await b.client.from("exercise_set_logs").insert({ user_id: b.user.id, workout_log_id: id, set_number: 1 })).error).not.toBeNull();
  const bLog = randomUUID();
  expect((await b.client.rpc("start_workout_record", { payload: { ...start, id: bLog } })).error).toBeNull();
  expect((await b.client.rpc("save_workout_record", { payload: { id: bLog, expected_revision: 0, sets: [first] } })).error).not.toBeNull();
  expect((await a.client.from("workout_logs").update({ completed: true }).eq("id", id).select()).data).toEqual([]);
  expect((await a.client.from("exercise_set_logs").update({ reps: 99 }).eq("id", first.id).select()).data).toEqual([]);
  expect((await a.client.from("workout_logs").delete().eq("id", id).select()).data).toEqual([]);
});
it("completes once under concurrency and replay, retaining one stable timestamp and frozen values", async () => {
  const responses = await Promise.all(Array.from({ length: 5 }, () => complete(req("POST", { id, expected_revision: 4 }))));
  const bodies = await Promise.all(responses.map(async r => { expect(r.status).toBe(200); return r.json(); }));
  for (const body of bodies) expect(body).toEqual(bodies[0]);
  expect(bodies[0].workout.completed_at).toBeTruthy();
  expect((await PUT(req("PUT", { id, expected_revision: 5, sets: [{ ...first, reps: 1 }] }))).status).toBe(409);
  expect((await read()).exercise_set_logs).toHaveLength(2);
  expect((await read()).completed_at).toBe(bodies[0].workout.completed_at);
});
it("denies anonymous RPCs", async () => {
  const anon = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } });
  for (const fn of ["start_workout_record", "save_workout_record", "complete_workout_record"]) expect((await anon.rpc(fn, { payload: start })).error).not.toBeNull();
});

it("retains legacy data and its same-owner parent FK protections without an admin read exception", async () => {
  const plan = await a.client.from("workout_plans").insert({ user_id: a.user.id, plan_name: "Synthetic unreviewed fixture", duration_weeks: 1, goal: "test", plan_json: {} }).select("id").single();
  expect(plan.error).toBeNull();
  const day = await a.client.from("workout_days").insert({ user_id: a.user.id, workout_plan_id: plan.data!.id, workout_type: "test" }).select("id").single();
  expect(day.error).toBeNull();
  const exercise = await a.client.from("workout_exercises").insert({ user_id: a.user.id, workout_day_id: day.data!.id, exercise_name: "Unreviewed test fixture", position: 1 }).select("id").single();
  expect(exercise.error).toBeNull();
  expect((await b.client.from("workout_days").insert({ user_id: b.user.id, workout_plan_id: plan.data!.id, workout_type: "test" })).error?.code).toBe("23503");
  expect((await b.client.from("workout_exercises").insert({ user_id: b.user.id, workout_day_id: day.data!.id, exercise_name: "test", position: 1 })).error?.code).toBe("23503");
  expect((await b.client.from("workout_logs").insert({ user_id: b.user.id, workout_day_id: day.data!.id })).error?.code).toBe("23503");
  for (const table of ["workout_plans", "workout_days", "workout_exercises"]) expect((await b.client.from(table).select("*").eq("user_id", a.user.id)).data).toEqual([]);
  const legacy = await a.client.from("workout_logs").insert({ user_id: a.user.id, workout_day_id: day.data!.id, completed: true }).select("*").single();
  expect(legacy.error).toBeNull();
  expect(legacy.data).toMatchObject({ completed: true, completed_at: null, record_mode: null, prescription_snapshot: null });
  expect((await a.client.rpc("complete_workout_record", { payload: { id: legacy.data!.id, expected_revision: 0 } })).error?.code).toBe("P0002");
  expect((await a.client.from("workout_logs").select("*").eq("id", legacy.data!.id).single()).data).toEqual(legacy.data);
});
it("rejects malformed payloads and immutable provenance changes at the real SQL seam", async () => {
  for (const payload of [null, [], {}, { ...start, user_id: b.user.id }, { ...start, snapshot: {} }, { ...start, timezone: "invalid/zone" }])
    expect((await a.client.rpc("start_workout_record", { payload })).error).not.toBeNull();
  // Trusted test fixture client reaches CHECK/trigger validation, independently of RLS/RPC validation.
  expect((await admin.from("workout_logs").update({ prescription_snapshot: {} }).eq("id", id)).error?.code).toBe("55000");
  expect((await admin.from("exercise_set_logs").insert({ user_id: a.user.id, workout_log_id: id, set_number: 21, reps: 1 })).error?.code).toBe("23514");
});
