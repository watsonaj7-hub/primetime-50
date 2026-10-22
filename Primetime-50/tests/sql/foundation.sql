-- Real migration/function/RLS qualification using synthetic SQL identities only.
-- Password login, email, cookies, REST, browser and deployed configuration are NOT tested here.
insert into auth.users(id,raw_user_meta_data) values
('00000000-0000-4000-8000-000000000001','{"role":"admin"}'),
('00000000-0000-4000-8000-000000000002','{}');
select fixture.ok('metadata cannot bootstrap admin', (select role = 'user' from public.profiles where user_id='00000000-0000-4000-8000-000000000001'));
select fixture.ok('new profile is honestly incomplete', (select display_name is null and onboarding_completed_at is null from public.profiles where user_id='00000000-0000-4000-8000-000000000001'));

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select fixture.ok('profile RLS shows one own row', (select count(*) = 1 from public.profiles));
select fixture.ok('ordinary client is not admin', public.is_admin() = false);
select fixture.denied('profile role escalation denied', $$update public.profiles set role='admin'$$, '42501');
select fixture.denied('cross-user health insert denied', $$insert into public.health_profiles(user_id,status) values('00000000-0000-4000-8000-000000000002','none_reported')$$, '42501');
select fixture.denied('cross-user draft insert denied', $$insert into public.onboarding_drafts(user_id,draft_json) values('00000000-0000-4000-8000-000000000002','{}')$$, '42501');
insert into public.onboarding_drafts(user_id,draft_json) values('00000000-0000-4000-8000-000000000001','{"step":2}');
select fixture.ok('private draft saved', (select draft_json = '{"step":2}'::jsonb from public.onboarding_drafts));
select public.save_foundation_profile('{
  "display_name":"SQL fixture A","date_of_birth":"1965-04-12","sex":"not_specified","unit_system":"metric",
  "height_cm":175,"weight_kg":82,"waist_cm":null,"fitness_level":"consistent","primary_goal":"strength","secondary_goal":"mobility",
  "training_days_per_week":3,"preferred_session_minutes":45,"training_location":"home","health_status":"none_reported",
  "health_restrictions":[],"health_notes":"","equipment":["dumbbells","bodyweight"]
}');
select fixture.ok('real profile RPC saves selected profile values', (select display_name='SQL fixture A' and height_cm=175 and weight_kg=82 and unit_system='metric' and training_days_per_week=3 and preferred_session_minutes=45 and onboarding_completed_at is not null from public.profiles));
select fixture.ok('real profile RPC saves exact health values', (select count(*)=1 and bool_and(status='none_reported' and restrictions='{}'::text[] and notes='') from public.health_profiles));
select fixture.ok('real profile RPC saves equipment', (select array_agg(equipment_type order by equipment_type)=array['bodyweight','dumbbells'] from public.user_equipment));
select fixture.ok('real profile RPC clears draft atomically', (select count(*)=0 from public.onboarding_drafts));
select fixture.denied('invalid profile field refused', $$select public.save_foundation_profile('{"role":"admin"}')$$, '22023');
select fixture.denied('numeric profile boundary enforced', $$update public.profiles set height_cm=10$$, '23514');
-- Preserve complete committed rows, including timestamps, across a late RPC failure.
create temp table completed_before as select to_jsonb(p) as profile from public.profiles p;
create temp table completed_health_before as select to_jsonb(h) as health from public.health_profiles h;
-- Completion is terminal for drafts; rejection is correct product behaviour.
select fixture.denied('completed account rejects draft recreation', $$insert into public.onboarding_drafts(user_id,draft_json) values('00000000-0000-4000-8000-000000000001','{"step":3}')$$, '55000');
select fixture.denied('late equipment error rolls back RPC', $cmd$select public.save_foundation_profile('{
  "display_name":"MUST NOT SAVE","date_of_birth":"1965-04-12","sex":"not_specified","unit_system":"metric",
  "height_cm":175,"weight_kg":82,"waist_cm":null,"fitness_level":"consistent","primary_goal":"strength","secondary_goal":"mobility",
  "training_days_per_week":3,"preferred_session_minutes":45,"training_location":"home","health_status":"none_reported",
  "health_restrictions":[],"health_notes":"","equipment":["INVALID"]
}')$cmd$, '23514');
select fixture.ok('failed RPC preserves committed profile', (select to_jsonb(p)=b.profile from public.profiles p cross join completed_before b));
select fixture.ok('failed completed-profile RPC does not recreate draft', (select count(*)=0 from public.onboarding_drafts));
select fixture.ok('failed RPC preserves equipment', (select array_agg(equipment_type order by equipment_type)=array['bodyweight','dumbbells'] from public.user_equipment));

select fixture.ok('failed RPC preserves exact health row', (select to_jsonb(h)=b.health from public.health_profiles h cross join completed_health_before b));

-- Separate incomplete fixture preserves the original rollback-with-draft obligation.
reset role;
insert into auth.users(id,raw_user_meta_data) values('00000000-0000-4000-8000-000000000090','{}');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000090',false);
insert into public.onboarding_drafts(user_id,draft_json) values('00000000-0000-4000-8000-000000000090','{"step":3,"display_name":"Incomplete synthetic actor"}');
insert into public.user_equipment(user_id,equipment_type) values(auth.uid(),'chair');
create temp table incomplete_before as select to_jsonb(p) as profile from public.profiles p;
create temp table incomplete_draft_before as select to_jsonb(d) as draft from public.onboarding_drafts d;
select fixture.ok('incomplete actor starts with exact draft and equipment', (select draft_json='{"step":3,"display_name":"Incomplete synthetic actor"}'::jsonb from public.onboarding_drafts) and (select array_agg(equipment_type)=array['chair'] from public.user_equipment));
select fixture.denied('incomplete-profile late equipment error rolls back RPC', $cmd$select public.save_foundation_profile('{
  "display_name":"MUST NOT SAVE","date_of_birth":"1965-04-12","sex":"not_specified","unit_system":"metric",
  "height_cm":175,"weight_kg":82,"waist_cm":null,"fitness_level":"consistent","primary_goal":"strength","secondary_goal":"mobility",
  "training_days_per_week":3,"preferred_session_minutes":45,"training_location":"home","health_status":"none_reported",
  "health_restrictions":[],"health_notes":"","equipment":["INVALID"]
}')$cmd$, '23514');
select fixture.ok('incomplete failed RPC preserves incomplete profile', (select p.onboarding_completed_at is null and p.display_name is null and to_jsonb(p)=b.profile from public.profiles p cross join incomplete_before b));
select fixture.ok('incomplete failed RPC preserves original draft', (select to_jsonb(d)=b.draft from public.onboarding_drafts d cross join incomplete_draft_before b));
select fixture.ok('incomplete failed RPC preserves original equipment', (select array_agg(equipment_type)=array['chair'] from public.user_equipment));
select fixture.ok('incomplete failed RPC leaves no health row', (select count(*)=0 from public.health_profiles));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);

-- Legacy direct-write fixtures: record_mode NULL. These do NOT prove managed recording.
insert into public.workout_plans(id,user_id,plan_name,duration_weeks,goal,plan_json) values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','Synthetic SQL fixture, not approved exercise content',4,'strength','{}');
insert into public.workout_days(id,user_id,workout_plan_id,workout_type) values('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','fixture');
insert into public.workout_exercises(id,user_id,workout_day_id,exercise_name,position,sets) values('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012','Synthetic fixture',1,2);
insert into public.workout_logs(id,user_id,workout_day_id) values('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012');
insert into public.exercise_set_logs(user_id,workout_log_id,workout_exercise_id,set_number,reps,weight,rpe) values
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000013',1,8,10,6),
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000013',2,7,12,7);
select fixture.ok('distinct sets persist separately', (select count(*)=2 and min(reps)=7 and max(reps)=8 and min(weight)=10 and max(weight)=12 from public.exercise_set_logs));
select fixture.denied('set number lower bound', $$insert into public.exercise_set_logs(user_id,workout_log_id,set_number) values(auth.uid(),'00000000-0000-4000-8000-000000000014',0)$$, '23514');
select fixture.denied('set reps upper bound', $$update public.exercise_set_logs set reps=101$$, '23514');
select fixture.denied('set negative weight', $$update public.exercise_set_logs set weight=-1$$, '23514');
select fixture.denied('set NaN weight', $$update public.exercise_set_logs set weight='NaN'::numeric$$, '23514');
select fixture.denied('set infinite weight', $$update public.exercise_set_logs set weight='Infinity'::numeric$$, '23514');
select fixture.denied('set RPE upper bound', $$update public.exercise_set_logs set rpe=11$$, '23514');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
select fixture.ok('B cannot read A profile', (select count(*)=0 from public.profiles where user_id='00000000-0000-4000-8000-000000000001'));
select fixture.ok('B cannot read A health', (select count(*)=0 from public.health_profiles));
select fixture.ok('B cannot read A equipment', (select count(*)=0 from public.user_equipment));
select fixture.ok('B cannot read incomplete actor draft', (select count(*)=0 from public.onboarding_drafts));
select fixture.ok('B cannot read A workout', (select count(*)=0 from public.workout_logs));
select fixture.ok('B cannot read A sets', (select count(*)=0 from public.exercise_set_logs));
with changed as (update public.profiles set display_name='STOLEN' where user_id='00000000-0000-4000-8000-000000000001' returning *) select fixture.ok('B cannot update A profile', (select count(*)=0 from changed));
with changed as (delete from public.exercise_set_logs returning *) select fixture.ok('B cannot delete A sets', (select count(*)=0 from changed));
select fixture.denied('B cannot forge plan parent', $$insert into public.workout_days(user_id,workout_plan_id,workout_type) values(auth.uid(),'00000000-0000-4000-8000-000000000011','fixture')$$, '23503');
select fixture.denied('B cannot forge day parent', $$insert into public.workout_logs(user_id,workout_day_id) values(auth.uid(),'00000000-0000-4000-8000-000000000012')$$, '23503');
-- The set-write policy cannot see A's log, so RLS 42501 precedes FK evaluation.
select fixture.denied('B cannot forge log parent', $$insert into public.exercise_set_logs(user_id,workout_log_id,set_number) values(auth.uid(),'00000000-0000-4000-8000-000000000014',1)$$, '42501');
-- Reachable FK control: B's own legacy log satisfies set-write RLS; A's exercise
-- still violates set_exercise_owner and must produce exactly 23503.
insert into public.workout_logs(id,user_id) values('00000000-0000-4000-8000-000000000024',auth.uid());
select fixture.denied('B cannot forge exercise parent', $$insert into public.exercise_set_logs(user_id,workout_log_id,workout_exercise_id,set_number) values(auth.uid(),'00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000013',1)$$, '23503');
reset role;
-- Trusted SQL-only control bypasses RLS to isolate the set_log_owner FK itself.
-- This is not ordinary-client authorization evidence; the client denial above is 42501.
select fixture.denied('trusted control retains set log ownership FK', $$insert into public.exercise_set_logs(user_id,workout_log_id,set_number) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000014',1)$$, '23503');
set role anon;
select set_config('request.jwt.claim.sub','',false);
select fixture.denied('anonymous profile read denied', $$select * from public.profiles$$, '42501');
select fixture.denied('anonymous draft read denied', $$select * from public.onboarding_drafts$$, '42501');
select fixture.denied('anonymous workout read denied', $$select * from public.workout_logs$$, '42501');
select fixture.denied('anonymous profile RPC denied', $$select public.save_foundation_profile('{}')$$, '42501');
reset role;
-- Final owner observation verifies that the negative tests did not corrupt or remove A's records.
select fixture.ok('A stored profile survives negative tests', (select display_name='SQL fixture A' from public.profiles where user_id='00000000-0000-4000-8000-000000000001'));
select fixture.ok('A distinct sets survive negative tests', (select count(*)=2 from public.exercise_set_logs where user_id='00000000-0000-4000-8000-000000000001'));

-- Minimum managed personal-record control: real bounded RPCs, no prescription approval.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select fixture.ok('personal record starts with honest provenance', (public.start_workout_record('{"id":"00000000-0000-4000-8000-000000000060","mode":"personal","timezone":"Australia/Melbourne"}')->'prescription_snapshot') = '{"source":"user_recorded","version":1,"prescription":null,"weight_unit":"kg"}'::jsonb);
select fixture.ok('two distinct sets saved via real RPC', (public.save_workout_record('{"id":"00000000-0000-4000-8000-000000000060","expected_revision":0,"sets":[{"id":"00000000-0000-4000-8000-000000000062","exercise_key":"00000000-0000-4000-8000-000000000064","exercise_name":"Synthetic no prescription","set_number":1,"reps":8,"weight":12.5,"rpe":7},{"id":"00000000-0000-4000-8000-000000000063","exercise_key":"00000000-0000-4000-8000-000000000064","exercise_name":"Synthetic no prescription","set_number":2,"reps":6,"weight":15,"rpe":8}] }')->>'revision')::int=1);
select fixture.ok('distinct saved values are retained', (select count(*)=2 and sum(reps)=14 and sum(weight)=27.5 and sum(rpe)=15 from public.exercise_set_logs where workout_log_id='00000000-0000-4000-8000-000000000060'));
with mutated as (update public.workout_logs set completed=true where id='00000000-0000-4000-8000-000000000060' returning *) select fixture.ok('owner cannot directly complete managed record', (select count(*)=0 from mutated));
with mutated as (delete from public.exercise_set_logs where workout_log_id='00000000-0000-4000-8000-000000000060' returning *) select fixture.ok('owner cannot directly delete managed sets', (select count(*)=0 from mutated));
select fixture.denied('owner cannot directly add managed set', $$insert into public.exercise_set_logs(user_id,workout_log_id,set_number) values(auth.uid(),'00000000-0000-4000-8000-000000000060',3)$$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
select fixture.ok('B sees no A managed record', (select count(*)=0 from public.workout_logs where id='00000000-0000-4000-8000-000000000060'));
select fixture.ok('B sees no A managed sets', (select count(*)=0 from public.exercise_set_logs where workout_log_id='00000000-0000-4000-8000-000000000060'));
select fixture.denied('B cannot save A id', $$select public.save_workout_record('{"id":"00000000-0000-4000-8000-000000000060","expected_revision":3,"sets":[]}')$$,'P0002');
select fixture.denied('B cannot complete A id', $$select public.complete_workout_record('{"id":"00000000-0000-4000-8000-000000000060","expected_revision":3}')$$,'P0002');
reset role;
set role anon;
select set_config('request.jwt.claim.sub','',false);
select fixture.denied('anonymous managed start denied', $$select public.start_workout_record('{}')$$,'42501');
select fixture.denied('anonymous managed save denied', $$select public.save_workout_record('{}')$$,'42501');
select fixture.denied('anonymous managed completion denied', $$select public.complete_workout_record('{}')$$,'42501');
reset role;
