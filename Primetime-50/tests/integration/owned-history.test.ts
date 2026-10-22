// AUTHORED, NOT RUN by source8. Requires Austin #16 then #17's authorised local stack.
// Real Auth/PostgREST and production routes; only framework request identity binding is substituted.
// This does not exercise browser cookie/middleware navigation.
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { stackConfig, testAccount } from "../local-stack";
import { decodeHistory, strengthEvidence } from "@/lib/history/records";
const context=vi.hoisted(()=>({current:null as null|{supabase:SupabaseClient;user:{id:string}}}));
vi.mock("@/lib/auth/require-user",()=>({requireUser:async()=>{if(!context.current)throw new Error("Missing test identity");return context.current;}}));
import { GET,POST,PUT } from "@/app/api/workouts/route";
import { POST as complete } from "@/app/api/workouts/complete/route";
const config=stackConfig();
const admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let a:Awaited<ReturnType<typeof testAccount>>,b:Awaited<ReturnType<typeof testAccount>>;
const ids=[randomUUID(),randomUUID()];const saved=new Map<string,unknown>();
function req(method:string,body:unknown){return new Request("http://localhost/api/workouts",{method,headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify(body)});}
async function history(id?:string){const response=await GET(new Request(`http://localhost/api/workouts?view=history${id?`&id=${id}`:""}`));expect(response.status).toBe(200);return decodeHistory(await response.json());}
beforeAll(async()=>{a=await testAccount(config,admin);b=await testAccount(config,admin);context.current={supabase:a.client,user:a.user};});
afterAll(async()=>{for(const account of [a,b])if(account){await account.client.auth.signOut();await admin.auth.admin.deleteUser(account.user.id);}});
it("returns original completed personal records once after renewed auth and excludes another owner",async()=>{
 for(const id of ids){
  expect((await POST(req("POST",{id,mode:"personal",timezone:"Australia/Melbourne"}))).status).toBe(200);
  const set={id:randomUUID(),exercise_key:randomUUID(),exercise_name:"TEST DATA ONLY observed activity",set_number:1,reps:8,weight:12.5,rpe:7};
  expect((await PUT(req("PUT",{id,expected_revision:0,sets:[set]}))).status).toBe(200);
  expect((await complete(req("POST",{id,expected_revision:1}))).status).toBe(200);
  saved.set(id,(await history(id))[0]);
 }
 await a.client.auth.signOut();expect((await a.client.auth.signInWithPassword({email:a.email,password:a.password})).error).toBeNull();
 const records=await history();expect(records).toHaveLength(2);expect(new Set(records.map(r=>r.id)).size).toBe(2);
 for(const id of ids)expect((await history(id))[0]).toEqual(saved.get(id));
 expect(strengthEvidence(records)).toEqual([]); // Personal sets never become an approved protocol.
 context.current={supabase:b.client,user:b.user};expect(await history()).toEqual([]);for(const id of ids)expect(await history(id)).toEqual([]);
 context.current={supabase:a.client,user:a.user};for(const id of ids)expect((await history(id))[0]).toEqual(saved.get(id));
});
