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
select fixture.ok('real profile RPC saves all profile values', (select display_name='SQL fixture A' and height_cm=175 and weight_kg=82 and unit_system='metric' and training_days_per_week=3 and preferred_session_minutes=45 and onboarding_completed_at is not null from public.profiles));
select fixture.ok('real profile RPC saves equipment', (select array_agg(equipment_type order by equipment_type)=array['bodyweight','dumbbells'] from public.user_equipment));
select fixture.ok('real profile RPC clears draft atomically', (select count(*)=0 from public.onboarding_drafts));
select fixture.denied('invalid profile field refused', $$select public.save_foundation_profile('{"role":"admin"}')$$, '22023');
select fixture.denied('numeric profile boundary enforced', $$update public.profiles set height_cm=10$$, '23514');
-- This fails after the profile update inside the real RPC. All earlier writes must roll back.
insert into public.onboarding_drafts(user_id,draft_json) values('00000000-0000-4000-8000-000000000001','{"step":3}');
select fixture.denied('late equipment error rolls back RPC', $cmd$select public.save_foundation_profile('{
  "display_name":"MUST NOT SAVE","date_of_birth":"1965-04-12","sex":"not_specified","unit_system":"metric",
  "height_cm":175,"weight_kg":82,"waist_cm":null,"fitness_level":"consistent","primary_goal":"strength","secondary_goal":"mobility",
  "training_days_per_week":3,"preferred_session_minutes":45,"training_location":"home","health_status":"none_reported",
  "health_restrictions":[],"health_notes":"","equipment":["INVALID"]
}')$cmd$, '23514');
select fixture.ok('failed RPC preserves committed profile', (select display_name='SQL fixture A' from public.profiles));
select fixture.ok('failed RPC preserves draft', (select draft_json='{"step":3}'::jsonb from public.onboarding_drafts));
select fixture.ok('failed RPC preserves equipment', (select count(*)=2 from public.user_equipment));

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
select fixture.ok('B cannot read A draft', (select count(*)=0 from public.onboarding_drafts));
select fixture.ok('B cannot read A workout', (select count(*)=0 from public.workout_logs));
select fixture.ok('B cannot read A sets', (select count(*)=0 from public.exercise_set_logs));
with changed as (update public.profiles set display_name='STOLEN' where user_id='00000000-0000-4000-8000-000000000001' returning *) select fixture.ok('B cannot update A profile', (select count(*)=0 from changed));
with changed as (delete from public.exercise_set_logs returning *) select fixture.ok('B cannot delete A sets', (select count(*)=0 from changed));
select fixture.denied('B cannot forge plan parent', $$insert into public.workout_days(user_id,workout_plan_id,workout_type) values(auth.uid(),'00000000-0000-4000-8000-000000000011','fixture')$$, '23503');
select fixture.denied('B cannot forge day parent', $$insert into public.workout_logs(user_id,workout_day_id) values(auth.uid(),'00000000-0000-4000-8000-000000000012')$$, '23503');
select fixture.denied('B cannot forge log parent', $$insert into public.exercise_set_logs(user_id,workout_log_id,set_number) values(auth.uid(),'00000000-0000-4000-8000-000000000014',1)$$, '23503');
-- Same-owner new log with another user's prescribed exercise must also be rejected.
insert into public.workout_logs(id,user_id) values('00000000-0000-4000-8000-000000000024',auth.uid());
select fixture.denied('B cannot forge exercise parent', $$insert into public.exercise_set_logs(user_id,workout_log_id,workout_exercise_id,set_number) values(auth.uid(),'00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000013',1)$$, '23503');
reset role;
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
