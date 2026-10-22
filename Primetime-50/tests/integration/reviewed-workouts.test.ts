// Real isolated Auth/PostgREST/RPC path; only framework cookie identity binding is replaced.
// SYNTHETIC catalogue permissions are software fixtures, never actual approval or advice.
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { stackConfig, testAccount } from "../local-stack";
import { validProfile } from "../fixture";
const current = vi.hoisted(() => ({ value: null as null | { supabase: SupabaseClient; user: { id: string } } }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: async () => {
  if (!current.value) throw new Error("Fixture identity missing"); return current.value;
} }));
import { GET, POST, PUT } from "@/app/api/workouts/route";
import { POST as complete } from "@/app/api/workouts/complete/route";
const config=stackConfig();
const admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let a: Awaited<ReturnType<typeof testAccount>>, b: Awaited<ReturnType<typeof testAccount>>;
const version=randomUUID(),record=randomUUID(),key=randomUUID();
const prescription={ title:"SYNTHETIC NOT EXERCISE ADVICE", session_minutes:1, screening_rules:"SYNTHETIC",referral_rules:"SYNTHETIC",stop_rules:"SYNTHETIC",progression_rules:"SYNTHETIC",measurement:"SYNTHETIC",exercises:[{exercise_key:key,exercise_name:"SYNTHETIC activity",equipment:["bodyweight"],exclusions:[],sets:2,reps:"SYNTHETIC",duration_seconds:null,load_guidance:"SYNTHETIC",rpe_guidance:"SYNTHETIC",rest_seconds:0,cues:"SYNTHETIC",stop_rules:"SYNTHETIC"}] };
const context=Object.fromEntries(Object.entries(validProfile).filter(([k])=>k!=="display_name"));
context.equipment=[...validProfile.equipment].sort();
const start={id:record,mode:"reviewed",timezone:"UTC",catalogue_version_id:version};
function req(body:unknown,method="POST"){return new Request("http://localhost/api/workouts",{method,headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify(body)});}
async function read(){const r=await GET(new Request(`http://localhost/api/workouts?id=${record}`));expect(r.status).toBe(200);return (await r.json()).workouts[0];}
beforeAll(async()=>{
  a=await testAccount(config,admin); b=await testAccount(config,admin);current.value={supabase:a.client,user:a.user};
  expect((await a.client.rpc("save_foundation_profile",{payload:validProfile})).error).toBeNull();
});
afterAll(async()=>{
  // Catalogue versions intentionally cannot be deleted: revoke synthetic rows in this disposable stack.
  await admin.from("reviewed_workout_versions").update({status:"revoked"}).eq("id",version);
  for(const account of [a,b])if(account)expect((await admin.auth.admin.deleteUser(account.user.id)).error).toBeNull();
});
it("has an honest empty default and refuses direct catalogue approvals",async()=>{
  const r=await GET(new Request("http://localhost/api/workouts?view=reviewed-availability"));expect(await r.json()).toEqual({availability:{state:"unavailable",workouts:[]}});
  expect((await a.client.from("reviewed_workout_versions").select("*")).error?.code).toBe("42501");
  expect((await a.client.from("reviewed_workout_versions").insert({content_id:"forged"})).error?.code).toBe("42501");
  expect((await POST(req(start))).status).toBe(409);
});
it("selects only trusted exact-context content and atomically starts one reviewed snapshot",async()=>{
  expect((await admin.from("reviewed_workout_versions").insert({id:version,content_id:`SYNTHETIC-${version}`,content_version:"TEST_V1",rule_version:"TEST_R1",source_uri:"https://example.test/fixture",reviewer_name:"SYNTHETIC_NOT_A_REVIEWER",reviewer_role:"SOFTWARE_TEST_ONLY",approved_at:new Date(Date.now()-1000).toISOString(),status:"approved",prescription,eligible_contexts:[context]})).error).toBeNull();
  const available=await (await GET(new Request("http://localhost/api/workouts?view=reviewed-availability"))).json();expect(available.availability.state).toBe("available");
  const responses=await Promise.all([POST(req(start)),POST(req(start))]);for(const r of responses)expect(r.status).toBe(200);
  const saved=await read();expect(saved.record_mode).toBe("reviewed");expect(saved.prescription_snapshot).toMatchObject({content_version:"TEST_V1",rule_version:"TEST_R1",prescription,selection_context:context});expect(saved.exercise_set_logs).toHaveLength(2);
  await a.client.auth.signOut();expect((await a.client.auth.signInWithPassword({email:a.email,password:a.password})).error).toBeNull();expect(await read()).toEqual(saved);
});
it("denies changed persisted compatibility, caller approvals and cross-user access without losing history",async()=>{
  const before=await read();
  expect((await POST(req({...start,snapshot:{approved:true}}))).status).toBe(422);
  expect((await a.client.from("user_equipment").delete().eq("user_id",a.user.id).eq("equipment_type","bodyweight")).error).toBeNull();
  expect((await POST(req(start))).status).toBe(409);expect(await read()).toEqual(before);
  expect((await a.client.rpc("save_foundation_profile",{payload:validProfile})).error).toBeNull();
  current.value={supabase:b.client,user:b.user};expect((await (await GET(new Request(`http://localhost/api/workouts?id=${record}`))).json()).workouts).toEqual([]);expect((await POST(req(start))).status).toBe(404);
  current.value={supabase:a.client,user:a.user};expect(await read()).toEqual(before);
});
it("keeps immutable history through revocation and permits only the original owned set lifecycle",async()=>{
  const before=await read();
  expect((await complete(req({id:record,expected_revision:0}))).status).toBe(409);
  const sets=before.exercise_set_logs.map((s:Record<string,unknown>)=>({...s,reps:1,weight:0,rpe:1}));
  expect((await PUT(req({id:record,expected_revision:0,sets},"PUT"))).status).toBe(200);
  expect((await admin.from("reviewed_workout_versions").update({status:"revoked"}).eq("id",version)).error).toBeNull();
  expect((await POST(req(start))).status).toBe(409);
  const done=await complete(req({id:record,expected_revision:1}));expect(done.status).toBe(200);
  const replay=await complete(req({id:record,expected_revision:1}));expect(await replay.json()).toEqual(await done.json());
  expect((await read()).prescription_snapshot).toEqual(before.prescription_snapshot);
});
