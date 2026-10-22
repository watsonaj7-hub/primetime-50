// Characterisation: production controllers -> handlers -> services -> verified-user
// guard. Only external SDK/storage is doubled. NOT connected DB/RLS evidence.
import { beforeEach, expect, it, vi } from "vitest";
import { testRecord } from "./workout-fixture";
import { routeTransport, deferred } from "../pilot/route-transport";
const db = vi.hoisted(() => ({ owner: "A" as string | null, row: null as unknown, calls: [] as string[], filters: [] as [string, unknown][], completeEffects: 0, fail: false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: db.owner ? { id: db.owner, user_metadata: { user_id: "A" } } : null }, error: null }) },
  from: () => {
    const filters: [string, unknown][] = [];
    const q = { select: () => q, eq: (k: string, v: unknown) => { filters.push([k,v]); return q; }, in: () => q, order: () => q,
      limit: async () => { db.filters.push(...filters); return { data: filters.every(([k,v]) => (db.row as Record<string,unknown>)[k] === v) ? [structuredClone(db.row)] : [], error: null }; } };
    return q;
  },
  rpc: async (name: string, { payload }: { payload: { id: string; expected_revision: number; sets?: ReturnType<typeof testRecord>["exercise_set_logs"] } }) => {
    db.calls.push(name);
    if (db.fail) { db.fail = false; return { error: { code: "XX000", message: "private storage diagnostics" } }; }
    const row = db.row as ReturnType<typeof testRecord> & { user_id: string };
    if (db.owner !== row.user_id || payload.id !== row.id) return { error: { code: "P0002" } };
    if (name === "complete_workout_record" && row.completed) return { data: structuredClone(row), error: null };
    if (payload.expected_revision !== row.revision) return { error: { code: "40001" } };
    if (name === "save_workout_record") for (const s of payload.sets ?? []) Object.assign(row.exercise_set_logs.find(v => v.id === s.id)!, s);
    if (name === "complete_workout_record") { row.completed = true; row.completed_at = "2026-10-22T01:00:00Z"; db.completeEffects++; }
    row.revision++; return { data: structuredClone(row), error: null };
  }
}) }));
import * as routes from "@/app/api/workouts/route";
import { POST as complete } from "@/app/api/workouts/complete/route";
import { WorkoutController } from "@/lib/client/workout";
import { HistoryController } from "@/lib/client/history";
const api = { ...routes, complete };
const id = testRecord().id;
function controller(fetcher = routeTransport(api)) { return new WorkoutController(fetcher, async () => db.owner === "A", () => {}); }
function edit(c: WorkoutController) { c.state.drafts.forEach((s,i) => { c.edit(s.id,"reps",String(8-i)); c.edit(s.id,"weight",String(12.5+i)); c.edit(s.id,"rpe",String(7+i)); }); }
beforeEach(() => { db.owner = "A"; db.row = { ...testRecord(), user_id: "A" }; db.calls = []; db.filters = []; db.completeEffects = 0; db.fail = false; });
it("retains invalid input before storage, then saves distinct sparse revisions and completes once into history", async () => {
  const c = controller(); await c.load(id); edit(c);
  c.edit(c.state.drafts[0].id,"reps","1.5"); await c.save();
  expect(c.state.drafts[0].reps).toBe("1.5"); expect(c.state.error).toContain("whole number"); expect(db.calls).toEqual([]);
  c.edit(c.state.drafts[0].id,"reps","8"); await c.save();
  expect(c.state.record?.revision).toBe(2); expect(c.state.needsReconcile).toBe(false);
  expect(c.state.record?.exercise_set_logs.map(s => [s.reps,s.weight,s.rpe])).toEqual([[8,12.5,7],[7,13.5,8]]);
  await c.complete(); const saved = structuredClone(c.state.record); await c.complete();
  expect(c.state.record).toEqual(saved); expect(db.completeEffects).toBe(1); expect(db.calls.filter(n => n === "complete_workout_record")).toHaveLength(1);
  const history = new HistoryController(routeTransport(api), async () => db.owner === "A"); await history.load(id);
  expect(history.state.selected).toEqual(saved); expect(history.state.records).toHaveLength(1);
  expect(db.filters).toContainEqual(["user_id","A"]); expect(db.filters).toContainEqual(["completed",true]);
});
it("drops a committed acknowledgement, retains every local field and reconciles before retry without duplicate writes", async () => {
  let lost = true;
  const c = controller(routeTransport(api, async (req,r) => { if (req.method === "PUT" && lost) { lost = false; throw new Error("TEST DATA ONLY lost acknowledgement"); } return r; }));
  await c.load(id); edit(c); const drafts = structuredClone(c.state.drafts); await c.save();
  expect(c.state.error).toContain("lost acknowledgement"); expect(c.state.needsReconcile).toBe(true); expect(c.state.drafts).toEqual(drafts);
  expect((db.row as ReturnType<typeof testRecord>).revision).toBe(1);
  await c.save(); expect(db.calls).toHaveLength(1);
  await c.reconcile(); expect(c.state.drafts).toEqual(drafts); await c.save();
  expect(db.calls).toEqual(["save_workout_record","save_workout_record"]); expect(c.state.record?.revision).toBe(2); expect(c.state.needsReconcile).toBe(false);
});
it("ignores delayed write acknowledgements after logout/reactivation without overwriting new input", async () => {
  const gate = deferred(), entered = deferred(); let hold = true;
  const c = controller(routeTransport(api, async (req,r) => { if (req.method === "PUT" && hold) { hold = false; entered.release(); await gate.promise; } return r; }));
  await c.load(id); edit(c); const saving = c.save(); await entered.promise;
  expect(c.state.busy).toBe(true); await c.save(); expect(db.calls).toHaveLength(1);
  c.invalidate(); expect(c.state.drafts).toEqual([]); c.activate(); await c.load(id); c.edit(c.state.drafts[0].id,"reps","19");
  gate.release(); await saving; expect(c.state.drafts[0].reps).toBe("19"); expect(c.state.signedOut).toBe(false);
});
it("keeps retry identity and one completion side effect when completion acknowledgement is lost", async () => {
  const c = controller(); await c.load(id); edit(c); await c.save();
  let lost = true;
  const retry = controller(routeTransport(api, async (req,r) => { if (req.url.endsWith("/complete") && lost) { lost = false; throw new Error("TEST lost completion response"); } return r; }));
  await retry.load(id); await retry.complete(); expect(retry.state.needsReconcile).toBe(true);
  await retry.reconcile(); await retry.complete(); expect(retry.state.record?.id).toBe(id); expect(retry.state.record?.completed_at).toBe("2026-10-22T01:00:00Z"); expect(db.completeEffects).toBe(1);
});
it("uses B's verified authority for reads and rejects anonymous mutation before body or SDK effects", async () => {
  db.owner = "B";
  const history = new HistoryController(routeTransport(api), async () => true); await history.load(id);
  expect(history.state.status).toBe("error"); expect(history.state.records).toEqual([]);
  // Positive draft exists for A; B's exact-ID logger read must still be empty.
  expect((await (await routes.GET(new Request(`http://localhost/api/workouts?id=${id}`))).json()).workouts).toEqual([]);
  expect(db.filters).toContainEqual(["user_id","B"]);
  const before = structuredClone(db.row);
  const response = await routes.PUT(new Request("http://localhost/api/workouts", { method: "PUT", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ id, expected_revision: 0, sets: testRecord().exercise_set_logs }) }));
  expect(response.status).toBe(404); expect(db.row).toEqual(before);
  db.owner = null; db.calls = [];
  const request = new Request("http://localhost/api/workouts", { method: "PUT", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{" });
  const json = vi.spyOn(request,"json"); expect((await routes.PUT(request)).status).toBe(401); expect(json).not.toHaveBeenCalled(); expect(db.calls).toEqual([]);
});

it("reports a real service-mapped SDK failure without erasing input or claiming a commit, then retries after readback", async () => {
  const c = controller(); await c.load(id); edit(c); const local = structuredClone(c.state.drafts); db.fail = true;
  await c.save(); expect(c.state.error).toContain("could not be confirmed"); expect(c.state.error).not.toContain("private");
  expect(c.state.drafts).toEqual(local); expect(c.state.needsReconcile).toBe(true); expect((db.row as ReturnType<typeof testRecord>).revision).toBe(0);
  await c.reconcile(); await c.save(); expect(c.state.record?.revision).toBe(2); expect(c.state.needsReconcile).toBe(false); expect(c.state.drafts).toEqual(local);
});
