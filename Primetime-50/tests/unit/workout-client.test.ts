// PRODUCTION controller/client -> actual route/service -> doubled auth/database.
// All content and approval below are TEST DATA ONLY, never a real catalogue seed.
import { beforeEach, expect, it, vi } from "vitest";
import { WorkoutController, draftsFor, isDirty, savePayload, type WorkoutRecord } from "@/lib/client/workout";
const boundary = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: boundary.auth }));
import { GET, POST, PUT } from "@/app/api/workouts/route";
import { POST as completeRoute } from "@/app/api/workouts/complete/route";
const id = "71000000-0000-4000-8000-000000000001";
const version = "71000000-0000-4000-8000-000000000002";
import { testRecord } from "./workout-fixture";

let stored: WorkoutRecord;
let writes: { method: string; body: Record<string, unknown> }[];
let failure: number | null;
let loseResponse: boolean;
let identity: boolean;
const fetcher: typeof fetch = async (url, init) => {
  const method = init?.method ?? "GET";
  if (method !== "GET") writes.push({ method, body: JSON.parse(String(init?.body)) });
  if (failure && method !== "GET") return new Response("{}", { status: failure });
  const request = new Request(`http://localhost${url}`, { ...init, headers: { origin: "http://localhost", "content-type": "application/json" } });
  const response = method === "GET" ? await GET(request) : String(url).endsWith("/complete") ? await completeRoute(request) : method === "PUT" ? await PUT(request) : await POST(request);
  if (loseResponse && method !== "GET") throw new Error("TEST network response lost");
  return response;
};
function controller(remember = vi.fn()) { return new WorkoutController(fetcher, async () => identity, remember); }
beforeEach(() => {
  vi.resetAllMocks(); stored = testRecord(); writes = []; failure = null; loseResponse = false; identity = true;
  boundary.auth.mockResolvedValue({ user: { id: "TEST_OWNER" }, supabase: { rpc: boundary.rpc, from: boundary.from } });
  boundary.rpc.mockImplementation(async (name, { payload }) => {
    if (name === "reviewed_workout_availability") return { data: { state: "available", workouts: [{ catalogue_version_id: version, prescription_snapshot: stored.prescription_snapshot }] }, error: null };
    if (name === "start_workout_record") { stored.id = payload.id; stored.record_timezone = payload.timezone; }
    if (name === "save_workout_record") {
      if (payload.expected_revision !== stored.revision) return { error: { code: "40001" } };
      for (const set of payload.sets) stored.exercise_set_logs = stored.exercise_set_logs.map(s => s.id === set.id ? set : s);
      stored.revision++;
    }
    if (name === "complete_workout_record" && !stored.completed) { stored.completed = true; stored.completed_at = "2026-10-22T01:00:00Z"; stored.revision++; }
    // Real mutations return a log row, without joined sets.
    const row = { ...stored } as Partial<WorkoutRecord>; delete row.exercise_set_logs;
    return { data: row, error: null };
  });
  const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockImplementation(async () => ({ data: [structuredClone(stored)], error: null })) };
  boundary.from.mockReturnValue(q);
});
function fill(c: WorkoutController) {
  for (const [i,s] of c.state.drafts.entries()) { c.edit(s.id,"reps",String(8+i)); c.edit(s.id,"weight",String(12.5+i)); c.edit(s.id,"rpe",String(6+i/2)); }
}
it("starts the selected version with one remembered identity and reads server-created set IDs", async () => {
  const remember = vi.fn(); const c = controller(remember); await c.load(); await c.start(version,"Australia/Melbourne");
  expect(remember).toHaveBeenCalledTimes(1); expect(writes[0].body).toEqual({ id: c.state.record!.id, mode: "reviewed", timezone: "Australia/Melbourne", catalogue_version_id: version });
  expect(c.state.drafts.map(s => s.id)).toEqual(stored.exercise_set_logs.map(s => s.id));
});
it("keeps start identity/timezone/version after ambiguous response and retry", async () => {
  const remember = vi.fn(); const c = controller(remember); await c.load(); loseResponse = true; await c.start(version,"UTC");
  expect(c.state.record).toBeNull(); expect(c.state.error).toContain("lost"); loseResponse = false; await c.retryStart();
  expect(writes[0].body).toEqual(writes[1].body); expect(remember).toHaveBeenCalledTimes(1); expect(c.state.record).not.toBeNull();
});
it("saves distinct values through production handlers, then refreshes/reopens the same record", async () => {
  const c = controller(); await c.load(id); fill(c); await c.save();
  expect(c.state.error).toBe(""); expect(c.state.needsReconcile).toBe(false); expect(c.state.record!.revision).toBe(2);
  expect(c.state.record!.exercise_set_logs.map(s => [s.reps,s.weight,s.rpe])).toEqual([[8,12.5,6],[9,13.5,6.5]]);
  expect(writes.every(w => JSON.stringify(w.body).length < 16384)).toBe(true);
  const reopened = controller(); await reopened.load(id); expect(reopened.state.drafts).toEqual(c.state.drafts); expect(reopened.state.record!.id).toBe(id);
});
it.each([409,422,503])("retains all local input on HTTP %s and reconciles before retry", async status => {
  const c = controller(); await c.load(id); fill(c); const draft = structuredClone(c.state.drafts); failure = status; await c.save();
  expect(c.state.drafts).toEqual(draft); expect(c.state.needsReconcile).toBe(true); expect(c.state.error).not.toBe("");
  await c.complete(); expect(writes.some(w => w.body.expected_revision === 1)).toBe(false);
  failure = null; await c.reconcile(); expect(c.state.drafts).toEqual(draft); await c.save(); expect(c.state.needsReconcile).toBe(false);
});
it("reconciles a committed save with a lost response before any completion", async () => {
  const c = controller(); await c.load(id); fill(c); loseResponse = true; await c.save();
  expect(stored.revision).toBe(1); expect(c.state.record!.revision).toBe(0); expect(c.state.needsReconcile).toBe(true);
  loseResponse = false; await c.reconcile(); expect(c.state.record!.revision).toBe(1); await c.save(); await c.complete();
  expect(c.state.record!.completed).toBe(true); expect(stored.exercise_set_logs.map(s => s.reps)).toEqual([8,9]);
});
it("prevents duplicate writes, freezes editing in flight and completes only once", async () => {
  const c = controller(); await c.load(id); fill(c); await Promise.all([c.save(),c.save()]);
  expect(writes).toHaveLength(2); await Promise.all([c.complete(),c.complete()]); await c.complete();
  expect(writes.filter(w => w.method === "POST")).toHaveLength(1); const before = structuredClone(c.state.drafts); c.edit(before[0].id,"reps","22"); expect(c.state.drafts).toEqual(before);
});
it("reconciles a lost completion response without a new history identity", async () => {
  const c = controller(); await c.load(id); fill(c); await c.save(); loseResponse = true; await c.complete();
  expect(c.state.record!.completed).toBe(false); expect(c.state.needsReconcile).toBe(true); loseResponse = false; await c.reconcile(); await c.complete();
  expect(c.state.record!.completed).toBe(true); expect(c.state.record!.id).toBe(id); expect(writes.filter(w => w.method === "POST")).toHaveLength(1);
});
it("keeps blank distinct from explicit zero and rejects invalid/rounded values before requests", async () => {
  const r = testRecord(); const drafts = draftsFor(r); drafts[0].reps = "0"; drafts[0].weight = "0"; drafts[0].rpe = "1";
  expect(savePayload(r,drafts).sets).toEqual([{ ...r.exercise_set_logs[0], reps: 0, weight: 0, rpe: 1 }]);
  for (const raw of ["-1","1e2","Infinity","101","1.5","9007199254740993"]) { const c = controller(); await c.load(id); c.edit(c.state.drafts[0].id,"reps",raw); await c.save(); expect(c.state.error).not.toBe(""); expect(c.state.drafts[0].reps).toBe(raw); }
  expect(writes).toHaveLength(0);
});
it("accepts exact decimal precision and equivalent formatting without a false unsaved state", () => {
  const r = testRecord(); r.exercise_set_logs[0] = { ...r.exercise_set_logs[0], reps: 0, weight: 0.125, rpe: 6.25 };
  const d = draftsFor(r); d[0].weight = "00.1250"; expect(isDirty(r,d)).toBe(false);
  d[0].rpe = "6.1234567890123456789"; expect(() => savePayload(r,d)).toThrow("rounding");
});
it("refuses empty/incomplete completion and retains invalid input on reconciliation", async () => {
  const c = controller(); await c.load(id); await c.complete(); expect(writes).toHaveLength(0);
  c.edit(c.state.drafts[0].id,"rpe","bad"); await c.reconcile(); expect(c.state.drafts[0].rpe).toBe("bad"); c.useSaved(); expect(c.state.drafts[0].rpe).toBe("");
});
it("drops late responses after identity change/disposal and sends no stale mutation", async () => {
  let resolve!: (r: Response) => void; const c = new WorkoutController(() => new Promise(r => { resolve = r; }), async () => true, vi.fn());
  const load = c.load(id); await vi.waitFor(() => expect(resolve).toBeTypeOf("function")); c.invalidate(); resolve(new Response(JSON.stringify({ workouts: [testRecord()] }))); await load;
  expect(c.state.record).toBeNull(); expect(c.state.drafts).toEqual([]); await c.save(); expect(writes).toHaveLength(0);
  const d = controller(); await d.load(id); fill(d); identity = false; await d.save(); expect(d.state.signedOut).toBe(true); expect(d.state.drafts).toEqual([]); expect(writes).toHaveLength(0);
});
it("stops sparse saves when another writer changes a later set between acknowledgements", async () => {
  const c = controller(); await c.load(id); fill(c);
  const original = boundary.rpc.getMockImplementation()!;
  boundary.rpc.mockImplementation(async (...args) => {
    const result = await original(...args);
    if (args[0] === "save_workout_record") { stored.exercise_set_logs[1].reps = 44; stored.revision++; }
    return result;
  });
  await c.save(); expect(writes).toHaveLength(1); expect(stored.exercise_set_logs[1].reps).toBe(44);
  expect(c.state.drafts[1].reps).toBe("9"); expect(c.state.needsReconcile).toBe(true); expect(c.state.error).toContain("changed during saving");
});
it("ignores late response after navigation disposal and supports effect remount", async () => {
  let resolve!: (r: Response) => void;
  const c = new WorkoutController(() => new Promise(r => { resolve = r; }), async () => true, vi.fn());
  const load = c.load(id); await vi.waitFor(() => expect(resolve).toBeTypeOf("function")); c.dispose(); resolve(new Response(JSON.stringify({ workouts: [testRecord()] }))); await load;
  expect(c.state.record).toBeNull();
  c.activate(); const reload = c.load(id); await Promise.resolve(); await vi.waitFor(() => expect(c.state.busy).toBe(true)); resolve(new Response(JSON.stringify({ workouts: [testRecord()] }))); await reload;
  expect(c.state.record!.id).toBe(id);
});
it("clears account input on 401 and fails closed on a malformed trusted response", async () => {
  const c = controller(); await c.load(id); fill(c); failure = 401; await c.save();
  expect(c.state.signedOut).toBe(true); expect(c.state.record).toBeNull(); expect(c.state.drafts).toEqual([]);
  const d = new WorkoutController(async () => new Response(JSON.stringify({ workouts: [{ ...testRecord(), exercise_set_logs: [] }] })), async () => true, vi.fn());
  await d.load(id); expect(d.state.record).toBeNull(); expect(d.state.error).not.toBe("");
});
it.each(["unavailable","unsupported","referral_required"])("keeps %s safe and cannot start an unoffered version", async state => {
  boundary.rpc.mockResolvedValue({ data: { state, workouts: [] }, error: null }); const c = controller(); await c.load(); await c.start(version,"UTC"); expect(writes).toHaveLength(0); expect(c.state.availability?.state).toBe(state);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function currentUnsavedGeneration(c: WorkoutController) {
  c.dispose(); c.activate(); await c.load(id);
  expect(c.state.record!.id).toBe(id);
  c.edit(c.state.drafts[0].id,"reps","19");
  c.edit(c.state.drafts[0].id,"rpe","invalid"); await c.save();
  expect(c.state.error).not.toBe("");
  c.edit(c.state.drafts[0].id,"rpe","");
  expect(c.state.drafts[0].reps).toBe("19");
  expect(c.state.busy).toBe(false); expect(c.state.signedOut).toBe(false);
  return c.getSnapshot();
}

it.each(["load","save","saved-read","reconcile","start","complete"] as const)("I1 ignores an old 401 from %s after a new generation has unsaved reps19", async phase => {
  const pending = deferred<Response>(); let armed = false;
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    const method = init?.method ?? "GET";
    const match = phase === "save" ? method === "PUT" : phase === "start" || phase === "complete" ? method === "POST" : method === "GET";
    if (armed && match) { armed = false; return pending.promise; }
    return fetcher(url,init);
  });
  const c = new WorkoutController(transport,async () => true,vi.fn());
  if (phase === "start") await c.load();
  else if (phase !== "load") { await c.load(id); fill(c); if (phase === "complete") await c.save(); }
  armed = true;
  const old = phase === "load" ? c.load(id) : phase === "save" || phase === "saved-read" ? c.save() : phase === "reconcile" ? c.reconcile() : phase === "start" ? c.start(version,"Australia/Melbourne") : c.complete();
  await vi.waitFor(() => expect(armed).toBe(false));
  const current = await currentUnsavedGeneration(c);
  const requests = transport.mock.calls.length; const mutations = writes.length;
  pending.resolve(new Response("{}",{status:401})); await old;
  expect(c.getSnapshot()).toBe(current); // Record, drafts, error, busy and identity all stay intact.
  expect(transport).toHaveBeenCalledTimes(requests); expect(writes).toHaveLength(mutations);
  await c.reconcile(); expect(c.state.signedOut).toBe(false); expect(c.state.drafts[0].reps).toBe("19");
});

it.each(["false","true","rejected"] as const)("I1 ignores an old %s identity result after remount without dispatching stale work", async result => {
  const pending = deferred<boolean>(); let first = true;
  const verify = vi.fn(async () => { if (first) { first = false; return pending.promise; } return true; });
  const transport = vi.fn(fetcher); const c = new WorkoutController(transport,verify,vi.fn());
  const old = c.load(id);
  const current = await currentUnsavedGeneration(c);
  const requests = transport.mock.calls.length;
  if (result === "rejected") pending.reject(new Error("TEST old identity failure")); else pending.resolve(result === "true");
  await old;
  expect(c.getSnapshot()).toBe(current); expect(transport).toHaveBeenCalledTimes(requests); expect(writes).toHaveLength(0);
  await c.reconcile(); expect(c.state.signedOut).toBe(false); expect(c.state.drafts[0].reps).toBe("19");
});

it.each(["fetch","json"] as const)("I1 stops the old availability continuation after pending %s, before its second request", async stage => {
  const pending = deferred<Response>(); const body = deferred<unknown>();
  const response = new Response("{}"); const json = vi.spyOn(response,"json").mockReturnValue(body.promise);
  const transport = vi.fn<typeof fetch>(async (url, init) => String(url).includes("view=") ? stage === "fetch" ? pending.promise : response : fetcher(url,init));
  const c = new WorkoutController(transport,async () => true,vi.fn()); const old = c.load();
  await vi.waitFor(() => stage === "fetch" ? expect(transport).toHaveBeenCalledTimes(1) : expect(json).toHaveBeenCalledTimes(1));
  const current = await currentUnsavedGeneration(c); const requests = transport.mock.calls.length;
  const available = { availability: { state: "available", workouts: [{ catalogue_version_id: version, prescription_snapshot: stored.prescription_snapshot }] } };
  if (stage === "fetch") pending.resolve(new Response(JSON.stringify(available))); else body.resolve(available);
  await old;
  expect(c.getSnapshot()).toBe(current); expect(transport).toHaveBeenCalledTimes(requests); expect(writes).toHaveLength(0);
});

it.each(["401","success","false","true"] as const)("I1 disposed-only late %s cannot clear or revive state or dispatch more requests", async outcome => {
  const response = deferred<Response>(); const check = deferred<boolean>();
  const transport = vi.fn<typeof fetch>(() => response.promise);
  const c = new WorkoutController(transport,() => outcome === "false" || outcome === "true" ? check.promise : Promise.resolve(true),vi.fn());
  const old = c.load(id);
  await vi.waitFor(() => expect(outcome === "401" || outcome === "success" ? transport.mock.calls.length : 1).toBe(1));
  c.dispose(); const disposed = c.getSnapshot();
  if (outcome === "false" || outcome === "true") check.resolve(outcome === "true");
  else response.resolve(outcome === "401" ? new Response("{}",{status:401}) : new Response(JSON.stringify({workouts:[testRecord()]})));
  await old; expect(c.getSnapshot()).toBe(disposed);
  expect(transport).toHaveBeenCalledTimes(outcome === "401" || outcome === "success" ? 1 : 0);
  await c.save(); expect(writes).toHaveLength(0); expect(c.getSnapshot()).toBe(disposed);
});

it.each(["401","false"] as const)("I1 still clears private input for a current-generation %s auth failure", async outcome => {
  const c = controller(); await c.load(id); fill(c);
  if (outcome === "401") failure = 401; else identity = false;
  await c.save(); expect(c.state.signedOut).toBe(true); expect(c.state.record).toBeNull(); expect(c.state.drafts).toEqual([]); expect(c.state.busy).toBe(false);
  const attempts = writes.length; await c.save(); expect(writes).toHaveLength(attempts);
});
