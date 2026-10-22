// TEST DATA ONLY, disposable authorised local stack ONLY. Runtime NOTRUN until #16 -> #17.
// Real Auth/actions/SSR-cookie adapter/guards/routes/services/RPC/REST/RLS.
// Framework cookie jar + redirect adapters and in-process Request transport only;
// no browser cookie/HTTP/SMTP claim. Existing foundation-lifecycle covers registration.
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createClient as sdkClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { stackConfig, testAccount } from "../local-stack";
import { partialDraft, validProfile } from "../fixture";
import { routeTransport, deferred } from "../pilot/route-transport";
const context = vi.hoisted(() => ({ jar: new Map<string,string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [...context.jar].map(([name,value]) => ({ name,value })), set: (n: string,v: string) => { context.jar.set(n,v); } }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { login, logout } from "@/app/actions/auth";
import * as profile from "@/app/api/profile/route";
import * as draft from "@/app/api/profile/draft/route";
import * as workouts from "@/app/api/workouts/route";
import { POST as complete } from "@/app/api/workouts/complete/route";
import { requireUser } from "@/lib/auth/require-user";
import { WorkoutController } from "@/lib/client/workout";
import { HistoryController } from "@/lib/client/history";
import { initialState } from "@/lib/types/mutation";
const config = stackConfig(); // Do NOT execute without Austin's authorised setup.
const admin = sdkClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const accounts: Awaited<ReturnType<typeof testAccount>>[] = [];
const version = randomUUID(), exercise = randomUUID();
const origin = "http://localhost:3000";
const api = { ...workouts, complete };
const prescription = { title: "TEST DATA ONLY integrated fixture", session_minutes: 20, screening_rules: "TEST ONLY", referral_rules: "TEST ONLY", stop_rules: "TEST ONLY", progression_rules: "TEST ONLY", measurement: "TEST ONLY", exercises: [{ exercise_key: exercise, exercise_name: "TEST DATA ONLY movement", equipment: ["bodyweight"], exclusions: [], sets: 2, reps: "TEST ONLY", duration_seconds: null, load_guidance: "TEST ONLY", rpe_guidance: "TEST ONLY", rest_seconds: 0, cues: "TEST ONLY", stop_rules: "TEST ONLY" }] };
function request(path: string, body: unknown, method = "PUT") { return new Request(origin + path, { method, headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }); }
async function signIn(a: typeof accounts[number]) {
  context.jar.clear(); const form = new FormData(); form.set("email",a.email); form.set("password",a.password); form.set("next","/settings");
  await expect(login(initialState,form)).rejects.toThrow("redirect:/settings"); expect((await requireUser()).user.id).toBe(a.user.id);
}
beforeAll(() => { vi.stubEnv("NEXT_PUBLIC_APP_URL",origin); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL",config.API_URL); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY",config.ANON_KEY); });
afterAll(async () => {
  try {
    // Approved versions are immutable: revoke only this unique synthetic version.
    expect((await admin.from("reviewed_workout_versions").update({ status: "revoked" }).eq("id",version)).error).toBeNull();
    for (const a of accounts) expect((await admin.auth.admin.deleteUser(a.user.id)).error).toBeNull();
  } finally { context.jar.clear(); vi.unstubAllEnvs(); }
});
it("integrates new/returning accounts, reviewed selection, partial/lost/delayed writes, isolation and reopened history", async () => {
  // Administrative confirmation fixtures, never actual email delivery/consent.
  accounts.push(await testAccount(config,admin)); accounts.push(await testAccount(config,admin));
  const [a,b] = accounts;
  await signIn(a);
  expect(await (await profile.GET()).json()).toEqual({ profile: null });
  expect((await draft.PUT(request("/api/profile/draft",partialDraft))).status).toBe(200);
  await expect(logout(initialState)).rejects.toThrow("redirect:/login");
  await signIn(b);
  const hiddenDraft = await b.client.from("onboarding_drafts").select("*").eq("user_id",a.user.id);
  expect(hiddenDraft.error).toBeNull(); expect(hiddenDraft.data).toEqual([]);
  expect((await draft.PUT(request("/api/profile/draft",{ ...partialDraft, user_id: a.user.id }))).status).toBe(422);
  await signIn(a);
  expect(await (await draft.GET()).json()).toEqual({ draft: partialDraft });
  expect((await profile.PUT(request("/api/profile",validProfile))).status).toBe(200);
  expect(await (await draft.GET()).json()).toEqual({ draft: null });
  const edited = { ...validProfile, display_name: "TEST DATA ONLY returning settings edit" };
  expect((await profile.PUT(request("/api/profile",edited))).status).toBe(200);
  const savedProfile = (await (await profile.GET()).json()).profile;
  expect((await profile.PUT(request("/api/profile",{ ...edited, weight_kg: -1 }))).status).toBe(422);
  expect((await (await profile.GET()).json()).profile).toEqual(savedProfile);
  const selection = Object.fromEntries(Object.entries(edited).filter(([k]) => k !== "display_name")); selection.equipment = [...edited.equipment].sort();
  expect((await admin.from("reviewed_workout_versions").insert({ id: version, content_id: `TEST-DATA-ONLY-${version}`, content_version: "TEST_V1", rule_version: "TEST_R1", source_uri: "https://example.test/TEST-DATA-ONLY", reviewer_name: "TEST ONLY NOT A PROFESSIONAL", reviewer_role: "SOFTWARE_FIXTURE_ONLY", approved_at: new Date(Date.now()-1000).toISOString(), status: "approved", prescription, eligible_contexts: [selection] })).error).toBeNull();
  let fail = false, delay = false;
  const entered = deferred(), gate = deferred(); const ids: string[] = [];
  const transport = routeTransport(api, async (req,response) => {
    if (req.method === "PUT" && delay) { delay = false; entered.release(); await gate.promise; }
    if (req.method === "PUT" && fail) { fail = false; throw new Error("TEST DATA ONLY dropped committed acknowledgement"); }
    return response;
  });
  const c = new WorkoutController(transport, async () => (await requireUser()).user.id === a.user.id, intent => ids.push(intent.id));
  await c.load(); expect(c.state.availability?.workouts.some(w => w.catalogue_version_id === version)).toBe(true);
  await c.start(version,"Australia/Melbourne"); expect(c.state.error).toBe(""); const id = c.state.record!.id;
  expect(ids).toEqual([id]); expect(c.state.record!.exercise_set_logs).toHaveLength(2);
  c.state.drafts.forEach((s,i) => { c.edit(s.id,"reps",String(8-i)); c.edit(s.id,"weight",String(12.5+i)); c.edit(s.id,"rpe",String(7+i)); });
  c.edit(c.state.drafts[0].id,"reps","1.5"); await c.save(); expect(c.state.drafts[0].reps).toBe("1.5"); expect(c.state.record!.revision).toBe(0);
  c.edit(c.state.drafts[0].id,"reps","8"); const local = structuredClone(c.state.drafts);
  delay = true; fail = true; const pending = c.save(); await entered.promise; expect(c.state.busy).toBe(true); await c.save(); gate.release(); await pending;
  expect(c.state.needsReconcile).toBe(true); expect(c.state.drafts).toEqual(local);
  await c.reconcile(); expect(c.state.record!.revision).toBe(1); expect(c.state.drafts).toEqual(local); await c.save(); expect(c.state.record!.revision).toBe(2);
  const before = structuredClone(c.state.record!);
  expect((await workouts.PUT(request("/api/workouts",{ id, expected_revision: 2, sets: [{ ...before.exercise_set_logs[0], reps: 101 }] }))).status).toBe(422);
  // Real SQL rollback/stale-revision failures, with unchanged saved state.
  expect((await a.client.rpc("save_workout_record",{ payload: { id, expected_revision: 2, sets: [{ ...before.exercise_set_logs[0], weight: -1 }] } })).error).not.toBeNull();
  expect((await workouts.PUT(request("/api/workouts",{ id, expected_revision: 0, sets: before.exercise_set_logs }))).status).toBe(409);
  await c.reconcile(); expect(c.state.record).toEqual(before);
  // Both ordinary users traverse the same routes; no requireUser substitution.
  await signIn(b);
  expect(await (await profile.GET()).json()).toEqual({ profile: null }); expect(await (await draft.GET()).json()).toEqual({ draft: null });
  expect((await draft.PUT(request("/api/profile/draft",{ ...partialDraft, values: { ...partialDraft.values, display_name: "TEST DATA ONLY B draft" } }))).status).toBe(200);
  expect((await b.client.from("onboarding_drafts").select("*").eq("user_id",b.user.id)).data).toHaveLength(1);
  expect((await profile.PUT(request("/api/profile",{ ...edited, user_id: a.user.id }))).status).toBe(422);
  expect((await draft.PUT(request("/api/profile/draft",{ ...partialDraft, user_id: a.user.id }))).status).toBe(422);
  expect((await profile.PUT(request("/api/profile",{ ...validProfile, display_name: "TEST DATA ONLY B" }))).status).toBe(200);
  for (const table of ["profiles","health_profiles","user_equipment","onboarding_drafts","workout_logs","exercise_set_logs"]) {
    const read = await b.client.from(table).select("*").eq("user_id",a.user.id); expect(read.error).toBeNull(); expect(read.data).toEqual([]);
  }
  for (const view of ["", "&view=history"]) expect((await (await workouts.GET(new Request(`${origin}/api/workouts?id=${id}${view}`))).json()).workouts).toEqual([]);
  expect((await workouts.POST(request("/api/workouts",{ id, mode: "reviewed", timezone: "Australia/Melbourne", catalogue_version_id: version },"POST"))).status).toBe(404);
  expect((await workouts.PUT(request("/api/workouts",{ id, expected_revision: 2, sets: before.exercise_set_logs }))).status).toBe(404);
  expect((await complete(request("/api/workouts/complete",{ id, expected_revision: 2 },"POST"))).status).toBe(404);
  expect((await b.client.rpc("save_workout_record",{ payload: { id, expected_revision: 2, sets: before.exercise_set_logs } })).error).not.toBeNull();
  expect((await b.client.from("exercise_set_logs").insert({ user_id: b.user.id, workout_log_id: id, set_number: 1 })).error).not.toBeNull();
  await signIn(a); expect((await (await profile.GET()).json()).profile).toEqual(savedProfile);
  await c.reconcile(); expect(c.state.record).toEqual(before); await c.complete(); expect(c.state.error).toBe("");
  const completed = structuredClone(c.state.record!); expect(completed.completed).toBe(true);
  const repeats = await Promise.all([complete(request("/api/workouts/complete",{ id, expected_revision: 2 },"POST")),complete(request("/api/workouts/complete",{ id, expected_revision: 2 },"POST"))]);
  for (const r of repeats) { expect(r.status).toBe(200); expect((await r.json()).workout.completed_at).toBe(completed.completed_at); }
  await c.complete(); const history = new HistoryController(routeTransport(api), async () => (await requireUser()).user.id === a.user.id);
  await history.load(id); expect(history.state.records.filter(r => r.id === id)).toHaveLength(1); expect(history.state.selected?.exercise_set_logs).toEqual(completed.exercise_set_logs);
  await expect(logout(initialState)).rejects.toThrow("redirect:/login"); c.invalidate(); history.invalidate(); expect(c.state.drafts).toEqual([]); expect(history.state.records).toEqual([]);
  expect((await profile.GET()).status).toBe(401); expect((await draft.GET()).status).toBe(401);
  for (const view of ["history","reviewed-availability"]) expect((await workouts.GET(new Request(`${origin}/api/workouts?view=${view}`))).status).toBe(401);
  expect((await complete(request("/api/workouts/complete",{ id, expected_revision: 2 },"POST"))).status).toBe(401);
  await signIn(b); const bh = new HistoryController(routeTransport(api),async () => true); await bh.load(id); expect(bh.state.status).toBe("error"); expect(bh.state.records).toEqual([]);
  await signIn(a); c.activate(); await c.load(id); history.activate(); await history.load(id);
  expect(c.state.record).toEqual(completed); expect(history.state.selected?.exercise_set_logs).toEqual(completed.exercise_set_logs); expect((await (await profile.GET()).json()).profile).toEqual(savedProfile);
}, 60000);
