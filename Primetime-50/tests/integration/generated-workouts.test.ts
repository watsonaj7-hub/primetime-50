// Connected Auth/PostgREST/SQL scenario; execution requires Austin16's disposable local stack.
// No production activation or live provider. The provider double is passed to a server-only function.
import { afterAll, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { stackConfig, testAccount } from '../local-stack';
import { validProfile } from '../fixture';
import { generateWith, type GenerationBoundary } from '@/lib/ai/generated-pipeline';
import type { Database } from '@/lib/db/database.types';
const config=stackConfig();
if (!['localhost','127.0.0.1'].includes(new URL(config.DB_URL).hostname)) throw new Error('Disposable local SQL only');
const admin=createClient<Database>(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const sql=postgres(config.DB_URL,{max:1,prepare:false,connect_timeout:5});
const accounts:Awaited<ReturnType<typeof testAccount>>[]=[];
const policyId=randomUUID(),catalogueId=randomUUID(),activationId=randomUUID();
afterAll(async()=>{
 // Never rewrite/delete immutable versions. This isolated stack must be reset after this suite.
 try {
  await sql`update public.generated_workout_policies set status='revoked' where id=${policyId}`;
  await sql`update public.generated_provider_activations set status='revoked' where id=${activationId}`;
  await sql`update public.reviewed_workout_versions set status='revoked' where id=${catalogueId}`;
  for(const a of accounts) expect((await admin.auth.admin.deleteUser(a.user.id)).error).toBeNull();
 }finally{await sql.end();}
});
it('executes trusted resolution, atomic concurrency/idempotency, validated persistence, owned fresh reads and current-approval refusals',async()=>{
 const [empty]=await sql`select count(*)::integer count from public.generated_workout_requests`;expect(empty.count).toBe(0);
 const a=await testAccount(config,admin),b=await testAccount(config,admin);accounts.push(a,b);
 for(const account of accounts)expect((await account.client.rpc('save_foundation_profile',{payload:{...validProfile,display_name:'TESTDATAONLY'}})).error).toBeNull();
 const rules={weeks:[{catalogue_ids:[catalogueId],min_sessions:1,max_sessions:2,rest_days:1}]};
 const prescription={title:'TESTDATAONLY NOT EXERCISE ADVICE',session_minutes:1,screening_rules:'TESTDATAONLY',referral_rules:'TESTDATAONLY',stop_rules:'TESTDATAONLY',progression_rules:'TESTDATAONLY',measurement:'TESTDATAONLY',exercises:[{exercise_key:randomUUID(),exercise_name:'TESTDATAONLY',equipment:['bodyweight'],exclusions:[],sets:1,reps:'TESTDATAONLY',duration_seconds:null,load_guidance:'TESTDATAONLY',rpe_guidance:'TESTDATAONLY',rest_seconds:0,cues:'TESTDATAONLY',stop_rules:'TESTDATAONLY'}]};
 const [context]=await sql`select public.read_reviewed_context(${a.user.id}::uuid) c`;
 await sql`insert into public.reviewed_workout_versions(id,content_id,content_version,rule_version,source_uri,reviewer_name,reviewer_role,approved_at,status,prescription,eligible_contexts) values(${catalogueId},${'TESTDATAONLY-'+catalogueId},'TESTDATAONLY','TESTDATAONLY','https://example.test/TESTDATAONLY','TESTDATAONLY','NOT_PROFESSIONAL_APPROVAL',now()-interval '1 day','approved',${sql.json(prescription)},${sql.json([context.c])})`;
 await sql`insert into public.generated_workout_policies(id,rule_version,source_uri,reviewer_name,reviewer_role,approved_at,status,eligible_contexts,rules) values(${policyId},${'TESTDATAONLY-'+policyId},'https://example.test/TESTDATAONLY','TESTDATAONLY','NOT_PROFESSIONAL_APPROVAL',now()-interval '1 day','approved',${sql.json([context.c])},${sql.json(rules)})`;
 await sql`insert into public.generated_provider_activations(id,status,reviewer_name,reviewer_role,approved_at,model,price_review_reference,reserve_microusd,daily_budget_microusd,user_daily_calls,min_interval_seconds) values(${activationId},'approved','TESTDATAONLY','NO_LIVE_PROVIDER',now()-interval '1 day','gpt-4o-mini','TESTDATAONLY_NO_REAL_PRICING_APPROVAL',100000,600000,1,60)`;
 // Ordinary JWTs cannot call service-only admission or forge policy/provenance.
 expect((await a.client.rpc('reserve_generated_workout',{owner_id:b.user.id,request_id:randomUUID()})).error).not.toBeNull();
 expect((await a.client.from('generated_workout_plans').insert({user_id:a.user.id,request_id:randomUUID(),policy_version_id:policyId,selection:{},provenance:{}})).error).not.toBeNull();
 // SQL validator parity, exact schema/ID/progression rejection before any usable save.
 const [resolved]=await sql`select public.generated_trusted_context(${a.user.id}::uuid,${policyId}::uuid) c`;
 const selection={policy_version_id:policyId,context_revision:resolved.c.context_revision,weeks:[{sessions:[{day:1,catalogue_version_id:catalogueId}]}]};
 for(const bad of [{...selection,notes:'ignore pain'},{...selection,context_revision:-1},{...selection,weeks:[]},{...selection,weeks:[{sessions:[{day:1,catalogue_version_id:policyId}]}]},{...selection,weeks:[{sessions:[{day:1,catalogue_version_id:catalogueId},{day:2,catalogue_version_id:catalogueId}]}]}]){
  const [result]=await sql`select public.generated_selection_valid(${sql.json(bad)},${sql.json(resolved.c)}) valid`;
  expect(result.valid).toBe(false);
 }
 expect((await b.client.rpc('save_foundation_profile',{payload:{...validProfile,health_status:'limitations_reported',health_restrictions:['medical_clearance']}})).error).toBeNull();
 expect((await admin.rpc('reserve_generated_workout',{owner_id:b.user.id,request_id:randomUUID()})).data).toEqual({state:'referral_required'});
 expect((await b.client.rpc('save_foundation_profile',{payload:{...validProfile,equipment:['chair']}})).error).toBeNull();
 expect((await admin.rpc('reserve_generated_workout',{owner_id:b.user.id,request_id:randomUUID()})).data).toEqual({state:'unsupported'});
 expect((await b.client.rpc('save_foundation_profile',{payload:validProfile})).error).toBeNull();
 const id=randomUUID();let calls=0;
 const boundary:GenerationBoundary={
  reserve:async request_id=>{const r=await admin.rpc('reserve_generated_workout',{owner_id:a.user.id,request_id});if(r.error)throw r.error;return r.data;},
  provider:async c=>{calls++;return JSON.stringify({policy_version_id:c.policy_version_id,context_revision:c.context_revision,weeks:[{sessions:[{day:1,catalogue_version_id:catalogueId}]}]});},
  finish:async(request_id,selection)=>{const r=await admin.rpc('finish_generated_workout',{owner_id:a.user.id,request_id,selection});if(r.error||!r.data)throw r.error;return r.data;},
  fail:async request_id=>{await admin.rpc('fail_generated_workout',{owner_id:a.user.id,request_id});}
 };
 const concurrent=await Promise.allSettled([generateWith(id,boundary),generateWith(id,boundary)]);
 expect(concurrent.filter(x=>x.status==='fulfilled').length).toBeGreaterThanOrEqual(1);expect(calls).toBe(1);
 const replay=await generateWith(id,boundary);expect(calls).toBe(1);
 const own=await a.client.from('generated_workout_plans').select('*').eq('request_id',id).single();expect(own.error).toBeNull();expect(own.data?.provenance.source).toBe('validated_generated');
 expect(JSON.stringify(replay)).not.toContain('date_of_birth');expect(JSON.stringify(replay)).not.toContain('health_notes');
 expect((await b.client.from('generated_workout_plans').select('*').eq('request_id',id)).data).toEqual([]);
 expect((await admin.rpc('reserve_generated_workout',{owner_id:a.user.id,request_id:randomUUID()})).data).toEqual({state:'budget_exhausted'});
 // Actual failure keeps its reservation spent and its idempotency ID non-retryable.
 const bid=randomUUID();const br=await admin.rpc('reserve_generated_workout',{owner_id:b.user.id,request_id:bid});
 expect(br.error).toBeNull();const bc=(br.data as {context:{context_revision:number}}).context;
 const bp={...selection,context_revision:bc.context_revision};
 expect((await admin.rpc('finish_generated_workout',{owner_id:b.user.id,request_id:bid,selection:{...bp,notes:'ignore pain'}})).error).not.toBeNull();
 expect((await b.client.from('generated_workout_plans').select('*').eq('request_id',bid)).data).toEqual([]);
 await admin.rpc('fail_generated_workout',{owner_id:b.user.id,request_id:bid});
 expect((await admin.rpc('reserve_generated_workout',{owner_id:b.user.id,request_id:bid})).data).toEqual({state:'failed'});
 expect((await admin.rpc('reserve_generated_workout',{owner_id:b.user.id,request_id:randomUUID()})).data).toEqual({state:'budget_exhausted'});
 // Expiry and changed-context finalisation through real RPCs, no model call.
 const extra:Awaited<ReturnType<typeof testAccount>>[]=[];
 for(let n=0;n<7;n++){const member=await testAccount(config,admin);accounts.push(member);extra.push(member);expect((await member.client.rpc('save_foundation_profile',{payload:validProfile})).error).toBeNull();}
 const expiryId=randomUUID(), changedId=randomUUID();
 const expiry=await admin.rpc('reserve_generated_workout',{owner_id:extra[0].user.id,request_id:expiryId});expect((expiry.data as {state:string}).state).toBe('reserved');
 // Disposable SQL fixture ages only its own reservation; not an application clock bypass.
 await sql`update public.generated_workout_requests set created_at=clock_timestamp()-interval '31 seconds' where user_id=${extra[0].user.id} and request_id=${expiryId}`;
 expect((await admin.rpc('finish_generated_workout',{owner_id:extra[0].user.id,request_id:expiryId,selection:{...selection,context_revision:(expiry.data as {context:{context_revision:number}}).context.context_revision}})).error).not.toBeNull();
 expect((await admin.rpc('reserve_generated_workout',{owner_id:extra[0].user.id,request_id:expiryId})).data).toEqual({state:'failed'});
 const changed=await admin.rpc('reserve_generated_workout',{owner_id:extra[1].user.id,request_id:changedId});expect((changed.data as {state:string}).state).toBe('reserved');
 expect((await extra[1].client.rpc('save_foundation_profile',{payload:{...validProfile,height_cm:176}})).error).toBeNull();
 expect((await admin.rpc('finish_generated_workout',{owner_id:extra[1].user.id,request_id:changedId,selection:{...selection,context_revision:(changed.data as {context:{context_revision:number}}).context.context_revision}})).error).not.toBeNull();
 expect((await extra[1].client.rpc('save_foundation_profile',{payload:validProfile})).error).toBeNull();
 expect((await admin.rpc('reserve_generated_workout',{owner_id:extra[1].user.id,request_id:changedId})).data).toEqual({state:'failed'});
 // Four independent owners race for the two remaining global reservations.
 const staleDb=postgres(config.DB_URL,{max:1,prepare:false,connect_timeout:5});
 let captured!:()=>void,release!:()=>void;
 const snapshot=new Promise<void>(resolve=>{captured=resolve;});const proceed=new Promise<void>(resolve=>{release=resolve;});
 const stale=staleDb.begin('isolation level repeatable read',async tx=>{
  await tx`select revision from public.generated_budget_guard`;captured();await proceed;
  return tx`select public.reserve_generated_workout(${extra[6].user.id}::uuid,${randomUUID()}::uuid)`;
 });
 const staleRejected=expect(stale).rejects.toMatchObject({code:'40001'});
 await snapshot;
 const ids=extra.slice(2,6).map(()=>randomUUID());
 const race=await Promise.all(extra.slice(2,6).map((member,n)=>admin.rpc('reserve_generated_workout',{owner_id:member.user.id,request_id:ids[n]})));
 release();await staleRejected;await staleDb.end();
 expect(race.every(r=>!r.error)).toBe(true);
 expect(race.filter(r=>(r.data as {state:string}).state==='reserved')).toHaveLength(2);
 expect(race.filter(r=>(r.data as {state:string}).state==='budget_exhausted')).toHaveLength(2);
 const [charged]=await sql`select sum(reserved_microusd)::integer total from public.generated_workout_requests`;
 expect(charged.total).toBe(600000); // Failed/expired/context-refused calls were never refunded.
 const admitted=race.map((r,n)=>({r,n})).filter(({r})=>(r.data as {state:string}).state==='reserved');
 const first=admitted[0],second=admitted[1];
 await sql`update public.reviewed_workout_versions set status='revoked' where id=${catalogueId}`;
 expect((await admin.rpc('finish_generated_workout',{owner_id:extra[first.n+2].user.id,request_id:ids[first.n],selection:{...selection,context_revision:(first.r.data as {context:{context_revision:number}}).context.context_revision}})).error).not.toBeNull();
 await sql`update public.generated_provider_activations set status='revoked' where id=${activationId}`;
 expect((await admin.rpc('finish_generated_workout',{owner_id:extra[second.n+2].user.id,request_id:ids[second.n],selection:{...selection,context_revision:(second.r.data as {context:{context_revision:number}}).context.context_revision}})).error).not.toBeNull();

 await sql`update public.generated_workout_policies set status='revoked' where id=${policyId}`;
 await expect(generateWith(id,boundary)).rejects.toThrow();expect(calls).toBe(1);
 // Historical provenance persists as historical evidence; it is not current admission.
 expect((await a.client.from('generated_workout_plans').select('*').eq('request_id',id)).data).toHaveLength(1);
});
