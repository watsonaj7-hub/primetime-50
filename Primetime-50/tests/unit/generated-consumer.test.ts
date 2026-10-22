// Production controller -> route -> authenticated service -> raw storage decoding.
// Only account/SDK/database transports are doubled. No network or real approval.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const b = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), rpc: vi.fn(), admin: vi.fn(), sdk: vi.fn(), provider: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: b.auth }));
vi.mock("@supabase/supabase-js", () => ({ createClient: b.admin }));
vi.mock("openai", () => ({ default: b.sdk }));
import { GET, POST } from "@/app/api/ai/plan/route";
import { AppError } from "@/lib/http/errors";
import { decodeGeneratedRecord, decodeGeneratedRecords, resolveGeneratedSession } from "@/lib/ai/generated-records";
import { GeneratedController } from "@/lib/client/generated-workout";
import { savedGenerated, generatedRequestId, noProgression } from "../fixtures/generated-consumer";
import { trusted } from "../generated-fixture";
const generationContext = { ...trusted, rules:savedGenerated().provenance.rules, catalogue:[{id:savedGenerated().provenance.catalogue[0].catalogue_version_id,session_minutes:20}] };

let rows: { owner: string; record: ReturnType<typeof savedGenerated> }[];
let owner: string;
let query: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> };
let loss: boolean;
const requests: { url: string; init?: RequestInit }[] = [];
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const transport: typeof fetch = async (url, init) => {
  requests.push({ url: String(url), init });
  const request = new Request(`http://localhost${url}`, { ...init, headers: { origin: "http://localhost", "content-type": "application/json" } });
  const res = init?.method === "POST" ? await POST(request) : await GET(request);
  if (loss && init?.method === "POST") throw new Error("TEST response lost after commit");
  return res;
};
beforeEach(() => {
  vi.resetAllMocks(); requests.length = 0; loss = false; owner = "TEST-owner";
  rows = [{ owner, record: savedGenerated() }];
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "TEST public");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "TEST private"); vi.stubEnv("OPENAI_API_KEY", "TEST provider"); vi.stubEnv("PRIMEFIT_GENERATED_PROVIDER_ENABLED", "approved-live-v1");
  b.auth.mockImplementation(async () => ({ user: { id: owner }, supabase: { from: b.from, rpc: b.rpc } }));
  b.from.mockImplementation((table: string) => {
    const filters: [string, unknown][] = [];
    query = { select: vi.fn().mockReturnThis(), eq: vi.fn((k, v) => { filters.push([k, v]); return query; }), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => ({ error: null, data: table === "generated_workout_plans" ? rows.filter(r => filters.every(([k,v]) => k === "user_id" ? r.owner === v : k === "request_id" ? r.record.request_id === v : false)).map(r => structuredClone(r.record)) : [] })) };
    return query;
  });
  b.rpc.mockResolvedValue({ error: null, data: { state: "unavailable", workouts: [] } });
  b.admin.mockReturnValue({ rpc: b.rpc });
  b.sdk.mockImplementation(function () { return { chat: { completions: { create: b.provider } } }; });
  b.provider.mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(savedGenerated().selection) } }] });
});
afterEach(() => vi.unstubAllEnvs());
it("reads only owner rows with explicit fields, bounded deterministic order and no provider even when generation is disabled", async () => {
  rows.push({ owner: "foreign", record: { ...savedGenerated(), id: "61000000-0000-4000-8000-000000000099" } });
  vi.stubEnv("PRIMEFIT_GENERATED_PROVIDER_ENABLED", "");
  const res = await GET(new Request("http://localhost/api/ai/plan"));
  expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("no-store");
  const body = await res.json(); expect(body.plans).toHaveLength(1); expect(body.plans[0].id).toBe(savedGenerated().id);
  // Capture the plan query before the progression read creates its own builder.
  const planQuery = b.from.mock.results[0].value;
  expect(planQuery.select).toHaveBeenCalledWith("id,request_id,policy_version_id,created_at,selection,provenance");
  expect(planQuery.eq).toHaveBeenCalledWith("user_id", "TEST-owner");
  expect(planQuery.order.mock.calls).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
  expect(planQuery.limit).toHaveBeenCalledWith(20);
  expect(b.admin).not.toHaveBeenCalled(); expect(b.sdk).not.toHaveBeenCalled(); expect(b.provider).not.toHaveBeenCalled();
});
it("request reconciliation is an owner-scoped read, never a POST replay", async () => {
  owner = "foreign";
  const res = await GET(new Request(`http://localhost/api/ai/plan?request_id=${generatedRequestId}`));
  expect((await res.json()).plans).toEqual([]); expect(b.admin).not.toHaveBeenCalled();
  expect(b.from.mock.results[0].value.eq).toHaveBeenCalledWith("request_id", generatedRequestId);
});
it.each([401,503])("sets no-store on GET authentication/storage error %s", async status => {
  b.auth.mockRejectedValue(new AppError(status, "TEST boundary"));
  const res = await GET(new Request("http://localhost/api/ai/plan")); expect(res.status).toBe(status); expect(res.headers.get("cache-control")).toBe("no-store");
});
it("rejects malformed or caller-authority query fields without reading storage", async () => {
  for (const query of ["request_id=invalid", "user_id=foreign", `request_id=${generatedRequestId}&request_id=${generatedRequestId}`]) {
    const res = await GET(new Request(`http://localhost/api/ai/plan?${query}`)); expect(res.status).toBe(422); expect(res.headers.get("cache-control")).toBe("no-store");
  }
  expect(b.from).not.toHaveBeenCalled();
});
it("storage error and invalid saved provenance fail closed without exposing a partial plan", async () => {
  rows[0].record.selection.weeks[0].sessions[0].catalogue_version_id = "61000000-0000-4000-8000-000000000099";
  const res = await GET(new Request("http://localhost/api/ai/plan")); expect(res.status).toBe(503); expect(await res.text()).not.toContain("TEST reps");
  b.from.mockImplementation(() => { const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({data:null,error:{message:"TEST private"}}) }; return q; });
  expect((await GET(new Request("http://localhost/api/ai/plan"))).status).toBe(503);
});
it("decodes the exact stored shape and resolves each relative slot to its own frozen catalogue entry", () => {
  const value = decodeGeneratedRecord(savedGenerated());
  expect(value.selection.weeks[0].sessions[0].catalogue_version_id).toBe(value.provenance.catalogue[0].catalogue_version_id);
  expect(value.provenance.catalogue[0]).not.toHaveProperty("approval_status_at_start");
  expect(decodeGeneratedRecords([savedGenerated()])).toEqual([value]);
});
it.each([
  (r: ReturnType<typeof savedGenerated>) => { r.provenance.catalogue = []; },
  (r: ReturnType<typeof savedGenerated>) => { r.provenance.catalogue.push(structuredClone(r.provenance.catalogue[0])); },
  (r: ReturnType<typeof savedGenerated>) => { r.provenance.catalogue[0].catalogue_version_id = "61000000-0000-4000-8000-000000000099"; },
  (r: ReturnType<typeof savedGenerated>) => { r.selection.policy_version_id = "61000000-0000-4000-8000-000000000099"; },
  (r: ReturnType<typeof savedGenerated>) => { r.provenance.context_revision++; },
  (r: ReturnType<typeof savedGenerated>) => { r.provenance.rules.weeks[0].catalogue_ids = []; },
  (r: ReturnType<typeof savedGenerated>) => { r.selection.weeks[0].sessions[0].day = 8; },
  (r: ReturnType<typeof savedGenerated>) => { r.selection.weeks[0].sessions.push(structuredClone(r.selection.weeks[0].sessions[0])); },
  (r: ReturnType<typeof savedGenerated>) => { r.provenance.catalogue[0].prescription.exercises[0].duration_seconds = 10; },
  (r: ReturnType<typeof savedGenerated>) => { r.provenance.catalogue[0].prescription.exercises.push(structuredClone(r.provenance.catalogue[0].prescription.exercises[0])); },
  (r: ReturnType<typeof savedGenerated>) => { r.provenance.catalogue[0].prescription.title = " "; },
  (r: ReturnType<typeof savedGenerated>) => { r.provenance.approved_at = "2026-02-30T00:00:00Z"; },
  (r: ReturnType<typeof savedGenerated>) => { Object.assign(r.provenance.catalogue[0], { source: "reviewed_catalogue" }); },
  (r: ReturnType<typeof savedGenerated>) => { Object.assign(r, { user_id: "foreign" }); },
  (r: ReturnType<typeof savedGenerated>) => { Object.assign(r.selection.weeks[0].sessions[0], { prescription: "untrusted" }); },
  (r: ReturnType<typeof savedGenerated>) => { r.selection.weeks[0].sessions[0].catalogue_version_id = "javascript:alert(1)"; }
])("refuses malformed, inconsistent or hostile saved references case %#", mutate => {
  const raw = savedGenerated(); mutate(raw); expect(() => decodeGeneratedRecord(raw)).toThrow();
});
it("rejects duplicate saved identities and excessive result bounds", () => {
  expect(() => decodeGeneratedRecords([savedGenerated(), savedGenerated()])).toThrow();
  expect(() => decodeGeneratedRecords(Array.from({ length: 21 }, savedGenerated))).toThrow();
});
it("loads real GET through the consumer without invoking generation", async () => {
  const c = new GeneratedController(transport, async () => true); await c.load();
  expect(c.state.status).toBe("ready"); expect(c.state.plans).toHaveLength(1); expect(c.state.progression?.adaptation).toBe("unavailable");
  expect(requests.every(r => (r.init?.method ?? "GET") === "GET")).toBe(true);
  expect(b.admin).not.toHaveBeenCalled();
});
function generationAdmission(state: string) {
  b.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "reserve_generated_workout" ? { state, context: generationContext } : name === "finish_generated_workout" ? savedGenerated() : null }));
}
it.each([["referral_required", "review_required"], ["budget_exhausted", "limit"], ["in_progress", "in_progress"], ["disabled", "unavailable"], ["unsupported", "unavailable"]])("generation %s yields truthful %s with no provisional prescription", async (admission, outcome) => {
  rows = []; generationAdmission(admission); const c = new GeneratedController(transport, async () => true); await c.generate();
  expect(c.state.outcome).toBe(outcome); expect(c.state.plans).toEqual([]); expect(b.sdk).not.toHaveBeenCalled();
});
it.each(["provider", "save"])("%s failure renders no actionable output and retains original identity", async failure => {
  rows = []; generationAdmission("reserved");
  if (failure === "provider") b.provider.mockRejectedValue(new Error("TEST provider private"));
  else b.rpc.mockImplementation(async (name: string) => name === "reserve_generated_workout" ? { data: { state: "reserved", context: generationContext }, error: null } : { data: null, error: { message: "TEST private" } });
  const c = new GeneratedController(transport, async () => true); await c.generate();
  expect(c.state.plans).toEqual([]); expect(c.state.requestId).not.toBeNull(); expect(c.state.error).not.toContain("TEST private");
});
it("ambiguous generation retains one identity across duplicate clicks, reads and explicit original retry", async () => {
  rows = []; generationAdmission("reserved"); loss = true;
  const c = new GeneratedController(transport, async () => true); await Promise.all([c.generate(), c.generate()]);
  const id = c.state.requestId; expect(id).toBeTruthy(); expect(c.state.plans).toEqual([]);
  loss = false; await c.load(); await c.generate();
  const writes = requests.filter(r => r.init?.method === "POST"); expect(writes).toHaveLength(2);
  expect(writes.map(r => JSON.parse(String(r.init?.body)).request_id)).toEqual([id, id]);
});
it("reconciles a committed original request through GET without requiring the provider", async () => {
  rows = [];
  const c = new GeneratedController(async (url, init) => {
    if (init?.method === "POST") { const raw = savedGenerated(); raw.request_id = JSON.parse(String(init.body)).request_id; rows = [{ owner, record: raw }]; throw new Error("TEST lost"); }
    return transport(url,init);
  }, async () => true);
  await c.generate(); const id = c.state.requestId; vi.stubEnv("PRIMEFIT_GENERATED_PROVIDER_ENABLED", ""); await c.reconcile();
  expect(c.state.requestId).toBe(id); expect(c.state.plans[0].request_id).toBe(id); expect(c.state.reconciled).toBe(true);
  expect(b.admin).not.toHaveBeenCalled();
});
it.each(["invalidate", "dispose", "reactivate"] as const)("drops late saved output after %s, including an old response resolving during a new load", async action => {
  const pending: ((r: Response) => void)[] = [];
  const c = new GeneratedController(() => new Promise(r => pending.push(r)), async () => true);
  const old = c.load(); await vi.waitFor(() => expect(pending).toHaveLength(1));
  let current: Promise<void> | undefined;
  if (action === "reactivate") { c.dispose(); c.activate(); current = c.load(); await vi.waitFor(() => expect(pending).toHaveLength(2)); }
  else c[action]();
  pending[0](response({ plans: [savedGenerated()], progression: noProgression })); await old;
  expect(c.state.plans).toEqual([]);
  if (current) { pending[1](response({ plans: [], progression: noProgression })); await current; expect(c.state.status).toBe("ready"); }
});
it("verifies identity before sending any request and clears owned data on 401", async () => {
  const fetcher = vi.fn().mockResolvedValue(response({},401)); const c = new GeneratedController(fetcher,async () => false);
  await c.generate(); expect(fetcher).not.toHaveBeenCalled(); expect(c.state.status).toBe("signedOut");
  c.activate(); const d = new GeneratedController(fetcher,async () => true); await d.load(); expect(d.state.status).toBe("signedOut"); expect(d.state.plans).toEqual([]);
});
it("confirms a real production POST result only with the original request identity, then permits an explicit new intent", async()=>{
  rows=[];const remember=vi.fn();
  b.rpc.mockImplementation(async(name:string,payload:{request_id:string})=>{
    if(name==="reserve_generated_workout")return {data:{state:"reserved",context:generationContext},error:null};
    if(name==="finish_generated_workout"){const raw=savedGenerated();raw.request_id=payload.request_id;return {data:raw,error:null};}
    return {data:null,error:null};
  });
  const c=new GeneratedController(transport,async()=>true,remember);await c.generate();
  expect(c.state.error).toBe("");expect(c.state.reconciled).toBe(true);expect(c.state.plans[0].request_id).toBe(c.state.requestId);
  expect(b.provider).toHaveBeenCalledTimes(1);expect(remember).toHaveBeenLastCalledWith(c.state.requestId);
  c.newRequest();expect(c.state.requestId).toBeNull();expect(remember).toHaveBeenLastCalledWith(null);
});
it("keeps a remembered URL request across reload and errors, with no implicit new request",async()=>{
  const c=new GeneratedController(transport,async()=>true);await c.load(generatedRequestId);
  expect(c.state.requestId).toBe(generatedRequestId);c.newRequest();expect(c.state.requestId).toBe(generatedRequestId);
  generationAdmission("in_progress");await c.generate();
  expect(JSON.parse(String(requests.find(r=>r.init?.method==="POST")!.init!.body)).request_id).toBe(generatedRequestId);
});
it.each(["invalidate","dispose"] as const)("drops late POST output after %s and does not emit a stale follow-up read",async action=>{
  let resolve!: (r:Response)=>void;let original="";
  const fetcher=vi.fn(async(_url,init)=>{original=JSON.parse(String(init?.body)).request_id;return new Promise<Response>(r=>{resolve=r;});});
  const c=new GeneratedController(fetcher,async()=>true);const pending=c.generate();await vi.waitFor(()=>expect(resolve).toBeTypeOf("function"));c[action]();
  const raw=savedGenerated();raw.request_id=original;resolve(response({plan:raw}));await pending;
  expect(c.state.plans).toEqual([]);expect(c.state.requestId).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);
});
it("suppresses stale post-JSON completion after a newer account generation",async()=>{
 let release!: (v:unknown)=>void;
 const c=new GeneratedController(async()=>({ok:true,status:200,json:()=>new Promise(r=>{release=r;})}) as Response,async()=>true);
 const old=c.load();await vi.waitFor(()=>expect(release).toBeTypeOf("function"));c.invalidate();c.activate();
 release({plans:[savedGenerated()],progression:noProgression});await old;expect(c.state.plans).toEqual([]);expect(c.state.status).toBe("loading");
});
it("preserves exact frozen text, including significant whitespace",()=>{
 const original=savedGenerated();original.provenance.catalogue[0].prescription.exercises[0].cues="  TEST exact cue\n";
 expect(decodeGeneratedRecord(original).provenance.catalogue[0].prescription.exercises[0].cues).toBe("  TEST exact cue\n");
});
it("resolves the requested frozen catalogue rather than the first entry, and rejects missing or duplicate mappings",()=>{
 const raw=savedGenerated();const second=structuredClone(raw.provenance.catalogue[0]);second.catalogue_version_id="71000000-0000-4000-8000-000000000099";second.prescription.title="TEST exact second";
 raw.provenance.catalogue.push(second);raw.selection.weeks[0].sessions.push({day:4,catalogue_version_id:second.catalogue_version_id});raw.provenance.rules.weeks[0].catalogue_ids.push(second.catalogue_version_id);
 const plan=decodeGeneratedRecord(raw);expect(resolveGeneratedSession(plan,second.catalogue_version_id).prescription.title).toBe("TEST exact second");
 expect(()=>resolveGeneratedSession(plan,"71000000-0000-4000-8000-000000000088")).toThrow();
 plan.provenance.catalogue.push(second);expect(()=>resolveGeneratedSession(plan,second.catalogue_version_id)).toThrow();
});

import { generatedFlowFixture } from "../fixtures/pilot-flow";
import { WorkoutController } from "@/lib/client/workout";
import { HistoryController } from "@/lib/client/history";
import { validProfile } from "../fixture";
it("composes the generated catalogue transition with explicit reviewed start, distinct retained entries, completion and history",async()=>{
 const f=generatedFlowFixture();await f.transport("/api/profile",{method:"POST",body:JSON.stringify(validProfile)});
 const g=new GeneratedController(f.transport,f.verify);await g.load();
 const plan=g.state.plans[0];const catalogue=plan.selection.weeks[0].sessions[0].catalogue_version_id;
 const w=new WorkoutController(f.transport,f.verify,()=>{});await w.load(undefined,undefined,catalogue);
 expect(w.state.record).toBeNull();expect(w.state.hintUnavailable).toBe(false);
 await w.start(catalogue,"UTC");const id=w.state.record!.id;
 w.state.drafts.forEach((s,i)=>{w.edit(s.id,"reps",String(8+i));w.edit(s.id,"weight",String(10+i));w.edit(s.id,"rpe",String(6+i));});
 w.edit(w.state.drafts[0].id,"reps","bad");await w.save();expect(w.state.drafts[0].reps).toBe("bad");expect(w.state.error).not.toBe("");
 w.edit(w.state.drafts[0].id,"reps","8");await w.save();await w.complete();await w.complete();
 const h=new HistoryController(f.transport,f.verify);await h.load(id);expect(h.state.selected?.id).toBe(id);
 expect(h.state.selected?.exercise_set_logs.map(s=>s.reps)).toEqual([8,9]);expect(g.state.plans[0]).toEqual(plan);
 expect(w.state.record).not.toHaveProperty("generated_plan_id");
});
it("a revoked generated catalogue hint cannot start a replacement through the production logger",async()=>{
 const f=generatedFlowFixture();await f.transport("/api/profile",{method:"POST",body:JSON.stringify(validProfile)});f.revoke();
 const w=new WorkoutController(f.transport,f.verify,()=>{});await w.load(undefined,undefined,savedGenerated().provenance.catalogue[0].catalogue_version_id);
 expect(w.state.hintUnavailable).toBe(true);await w.start(savedGenerated().provenance.catalogue[0].catalogue_version_id,"UTC");
 expect(w.state.record).toBeNull();expect(w.hasStartIntent()).toBe(false);
});

it.each(["load","reconcile"] as const)("announces pending %s immediately, keeps the historical caveat and never presents a provisional plan",async operation=>{
 let release!: (response:Response)=>void;let delay=false;
 const c=new GeneratedController(async()=>delay?new Promise<Response>(r=>{release=r;}):response({plans:[savedGenerated()],progression:noProgression}),async()=>true);
 await c.load(generatedRequestId);const confirmed=structuredClone(c.state.plans);
 expect(c.state.message).toContain("checked");delay=true;
 const pending=c[operation]();
 expect(c.state.busy).toBe(true);expect(c.state.message).toContain(operation==="load"?"Loading saved generated plans":"Checking original generation request");
 expect(c.state.message).toContain("Saved approval is historical");expect(c.state.message).not.toContain("checked.");expect(c.state.plans).toEqual(confirmed);
 await vi.waitFor(()=>expect(release).toBeTypeOf("function"));release(response({plans:[savedGenerated()],progression:noProgression}));await pending;
 expect(c.state.busy).toBe(false);expect(c.state.error).toBe("");expect(c.state.plans).toEqual(confirmed);
});
