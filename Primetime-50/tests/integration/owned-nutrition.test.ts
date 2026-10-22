// AUTHORED NOTRUN: Austin #16 isolated Supabase, then #17 connected acceptance.
// Real production route + service + authenticated PostgREST RPC. Only framework identity
// binding is substituted. Does not prove browser cookies, navigation or keyboard/mobile.
import { beforeAll,afterAll,expect,it,vi } from "vitest";
import { createClient,type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { stackConfig,testAccount } from "../local-stack";
import { decodeDay } from "@/lib/nutrition/records";
const context=vi.hoisted(()=>({current:null as null|{supabase:SupabaseClient;user:{id:string}}}));
vi.mock("@/lib/auth/require-user",()=>({requireUser:async()=>{if(!context.current)throw new Error("Missing synthetic test identity");return context.current;}}));
import { GET,POST } from "@/app/api/nutrition/route";
const config=stackConfig(),admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let a:Awaited<ReturnType<typeof testAccount>>,b:Awaited<ReturnType<typeof testAccount>>;
const zone="Australia/Melbourne",day="2026-10-23",otherDay="2026-10-22";
function req(body:unknown){return new Request("http://localhost/api/nutrition",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify(body)});}
async function read(d=day){const r=await GET(new Request(`http://localhost/api/nutrition?day=${d}&timezone=${encodeURIComponent(zone)}`));expect(r.status).toBe(200);return decodeDay(await r.json(),d,zone);}
beforeAll(async()=>{a=await testAccount(config,admin);b=await testAccount(config,admin);context.current={supabase:a.client,user:a.user};});
afterAll(async()=>{for(const u of [a,b])if(u){await u.client.auth.signOut();await admin.auth.admin.deleteUser(u.user.id);}});
it("persists complete owned meal/water CRUD, durable retries, day moves and logout/login across real RPC boundaries",async()=>{
 const meal={id:randomUUID(),kind:"meal",description:"TEST ONLY meal",protein_tenths:123,water_ml:null,logged_on:day,timezone:zone,revision:0};
 const water={...meal,id:randomUUID(),kind:"water",description:null,protein_tenths:null,water_ml:250};
 const create={action:"create",mutation_id:randomUUID(),entry:meal};
 // Concurrent same-key delivery must resolve to one row and one identical durable receipt.
 const retries=await Promise.all([POST(req(create)),POST(req(create))]);expect(retries.map(r=>r.status)).toEqual([200,200]);expect(await retries[0].json()).toEqual(await retries[1].json());
 expect((await POST(req({action:"create",mutation_id:randomUUID(),entry:water}))).status).toBe(200);
 expect((await read()).totals).toEqual({protein_tenths:123,water_ml:250});
 expect((await POST(req({...create,entry:{...meal,protein_tenths:999}}))).status).toBe(409);
 const moved={...meal,logged_on:otherDay,protein_tenths:201};
 const update={action:"update",mutation_id:randomUUID(),entry:moved};expect((await POST(req(update))).status).toBe(200);expect((await POST(req(update))).status).toBe(200);
 expect((await POST(req({action:"update",mutation_id:randomUUID(),entry:meal}))).status).toBe(409);
 expect((await read()).totals).toEqual({protein_tenths:0,water_ml:250});expect((await read(otherDay)).totals).toEqual({protein_tenths:201,water_ml:0});
 const waterUpdate={action:"update",mutation_id:randomUUID(),entry:{...water,water_ml:375}};
 expect((await POST(req(waterUpdate))).status).toBe(200);expect((await read()).totals.water_ml).toBe(375);
 await a.client.auth.signOut();expect((await a.client.auth.signInWithPassword({email:a.email,password:a.password})).error).toBeNull();
 expect((await read(otherDay)).entries).toEqual([{...moved,revision:1}]);expect((await read()).entries).toEqual([{...water,water_ml:375,revision:1}]);
 context.current={supabase:b.client,user:b.user};expect((await read()).entries).toEqual([]);expect((await read(otherDay)).entries).toEqual([]);
 expect((await POST(req({action:"update",mutation_id:randomUUID(),entry:{...moved,revision:1}}))).status).toBe(404);
 expect((await POST(req({action:"delete",mutation_id:randomUUID(),id:meal.id,expected_revision:1}))).status).toBe(404);
 expect((await b.client.from("nutrition_entries").select("*").eq("id",meal.id)).data).toEqual([]);
 expect((await b.client.from("nutrition_entries").update({description:"forged"}).eq("id",meal.id)).error).not.toBeNull();
 context.current={supabase:a.client,user:a.user};
 const del={action:"delete",mutation_id:randomUUID(),id:meal.id,expected_revision:1};expect((await POST(req(del))).status).toBe(200);expect((await POST(req(del))).status).toBe(200);
 expect((await POST(req(create))).status).toBe(200);expect((await read(otherDay)).entries).toEqual([]); // replay cannot resurrect
 expect((await POST(req({action:"delete",mutation_id:randomUUID(),id:water.id,expected_revision:1}))).status).toBe(200);expect((await read()).entries).toEqual([]);
});
it("refuses invalid direct RPC contracts, direct writes, anonymous and cross-owner data reads",async()=>{
 context.current={supabase:a.client,user:a.user};
 const entry={id:randomUUID(),kind:"water",description:null,protein_tenths:null,water_ml:-1,logged_on:day,timezone:zone,revision:0};
 const invalid=await a.client.rpc("mutate_nutrition_record",{payload:{action:"create",mutation_id:randomUUID(),entry}});expect(invalid.error).not.toBeNull();
 expect((await POST(req({action:"create",mutation_id:randomUUID(),entry:{...entry,water_ml:250},user_id:b.user.id}))).status).toBe(422);
 const anon=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 expect((await anon.rpc("read_nutrition_day",{payload:{day,timezone:zone}})).error).not.toBeNull();
 expect((await anon.from("nutrition_entries").select("*")).error).not.toBeNull();
});
