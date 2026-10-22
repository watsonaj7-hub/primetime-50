-- SYNTHETIC SQL TEST DATA ONLY. None of these identities/content/rules is real approval.
insert into auth.users(id) values ('62000000-0000-4000-8000-000000000001'),('62000000-0000-4000-8000-000000000002'),('62000000-0000-4000-8000-000000000003');
create function fixture.prescription() returns jsonb language sql immutable as $$
 select '{"title":"SYNTHETIC TEST ONLY, NOT EXERCISE ADVICE","session_minutes":1,"screening_rules":"SYNTHETIC exact-context fixture only","referral_rules":"SYNTHETIC no clearance","stop_rules":"SYNTHETIC no exercise use","progression_rules":"SYNTHETIC none","measurement":"SYNTHETIC test comparison only","exercises":[{"exercise_key":"62000000-0000-4000-8000-000000000010","exercise_name":"SYNTHETIC test activity","equipment":["bodyweight"],"exclusions":[],"sets":2,"reps":"TEST ONLY","duration_seconds":null,"load_guidance":"TEST ONLY","rpe_guidance":"TEST ONLY","rest_seconds":0,"cues":"TEST ONLY","stop_rules":"TEST ONLY"}]}'::jsonb
$$;
create function fixture.add_version(vid uuid, ver text, state text default 'approved') returns void language sql as $$
 insert into public.reviewed_workout_versions(id,content_id,content_version,rule_version,source_uri,reviewer_name,reviewer_role,approved_at,status,prescription,eligible_contexts)
 values(vid,'SYNTHETIC_TEST_ONLY',ver,'SYNTHETIC_RULE_V1','https://example.test/not-real-approval','SYNTHETIC_NOT_A_REVIEWER','SOFTWARE_FIXTURE_ONLY',now()-interval '1 day',state,case when ver='future-v2' then jsonb_set(fixture.prescription(),'{title}','"DIFFERENT SYNTHETIC FUTURE CONTENT"'::jsonb) else fixture.prescription() end,jsonb_build_array(public.read_reviewed_context('62000000-0000-4000-8000-000000000001')))
$$;
revoke all on function fixture.add_version(uuid,text,text) from public,anon,authenticated;
create function fixture.sets(rid uuid) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('id',id,'exercise_key',exercise_key,'exercise_name',exercise_name,'set_number',set_number,'reps',1,'weight',0,'rpe',1) order by set_number)
 from public.exercise_set_logs where workout_log_id=rid
$$;
set role authenticated;
select set_config('request.jwt.claim.sub','62000000-0000-4000-8000-000000000003',false);
select fixture.ok('unknown incomplete profile is unsupported',(public.reviewed_workout_availability()->>'state')='unsupported');
select set_config('request.jwt.claim.sub','62000000-0000-4000-8000-000000000001',false);
select public.save_foundation_profile(fixture.profile());
select fixture.ok('empty production catalogue has no recommendation', public.reviewed_workout_availability()='{"state":"unavailable","workouts":[]}'::jsonb);
select fixture.denied('ordinary user cannot read protected catalogue',$$select * from public.reviewed_workout_versions$$,'42501');
select fixture.denied('ordinary user cannot insert approval',$$insert into public.reviewed_workout_versions(content_id,content_version,rule_version,source_uri) values('fake','fake','fake','fake')$$,'42501');
select fixture.denied('ordinary user cannot update approval',$$update public.reviewed_workout_versions set status='approved'$$,'42501');
select fixture.denied('ordinary user cannot delete catalogue',$$delete from public.reviewed_workout_versions$$,'42501');
select fixture.denied('context helper is not public RPC',$$select public.read_reviewed_context(auth.uid())$$,'42501');
select fixture.denied('internal personal start cannot bypass admission',$$select public.start_personal_workout_record('{}')$$,'42501');
reset role;
insert into public.reviewed_workout_versions(id,content_id,content_version,rule_version,source_uri) values('62000000-0000-4000-8000-000000000020','UNSIGNED_FIXTURE','pending','pending','https://example.test/unsigned');
select fixture.denied('unsigned cannot become approved',$$update public.reviewed_workout_versions set status='approved' where content_id='UNSIGNED_FIXTURE'$$,'23514');
-- Regression: compatible JSONB operands must reach true, rather than an operator
-- error being hidden by the validator's fail-closed exception handler.
select fixture.ok('compatible equipment definition is valid',public.reviewed_definition_valid(fixture.prescription(),jsonb_build_array(public.read_reviewed_context('62000000-0000-4000-8000-000000000001'))));
select fixture.ok('nonoverlapping exclusions remain valid',public.reviewed_definition_valid(jsonb_set(fixture.prescription(),'{exercises,0,exclusions}','["shoulder_pain"]'),jsonb_build_array(public.read_reviewed_context('62000000-0000-4000-8000-000000000001') || '{"health_status":"limitations_reported","health_restrictions":["knee_pain"]}'::jsonb)));
select fixture.ok('overlapping exclusions invalidate definition',not public.reviewed_definition_valid(jsonb_set(fixture.prescription(),'{exercises,0,exclusions}','["knee_pain"]'),jsonb_build_array(public.read_reviewed_context('62000000-0000-4000-8000-000000000001') || '{"health_status":"limitations_reported","health_restrictions":["knee_pain"]}'::jsonb)));
select fixture.add_version('62000000-0000-4000-8000-000000000021','valid-v1');
select fixture.ok('valid structural fixture is ready', (select public.reviewed_version_ready(v) from public.reviewed_workout_versions v where id='62000000-0000-4000-8000-000000000021'));
select fixture.denied('approved JSON null prescription rejected',$$insert into public.reviewed_workout_versions(content_id,content_version,rule_version,source_uri,reviewer_name,reviewer_role,approved_at,status,prescription,eligible_contexts) select 'bad','null','r','s','TEST','TEST',now(),'approved','null'::jsonb,eligible_contexts from public.reviewed_workout_versions where content_version='valid-v1'$$,'23514');
select fixture.denied('approved malformed rules rejected',$$insert into public.reviewed_workout_versions(content_id,content_version,rule_version,source_uri,reviewer_name,reviewer_role,approved_at,status,prescription,eligible_contexts) select 'bad','unknown','r','s','TEST','TEST',now(),'approved',prescription,eligible_contexts || '[null]'::jsonb from public.reviewed_workout_versions where content_version='valid-v1'$$,'23514');
select fixture.denied('signed incompatible equipment rejected',$$insert into public.reviewed_workout_versions(content_id,content_version,rule_version,source_uri,reviewer_name,reviewer_role,approved_at,status,prescription,eligible_contexts) select 'bad','equipment','r','s','TEST','TEST',now(),'approved',jsonb_set(prescription,'{exercises,0,equipment}','["barbell"]'),eligible_contexts from public.reviewed_workout_versions where content_version='valid-v1'$$,'23514');
select fixture.denied('signed overlapping exclusion rejected',$$insert into public.reviewed_workout_versions(content_id,content_version,rule_version,source_uri,reviewer_name,reviewer_role,approved_at,status,prescription,eligible_contexts) select 'bad','exclusion','r','s','TEST','TEST',now(),'approved',jsonb_set(prescription,'{exercises,0,exclusions}','["knee_pain"]'),jsonb_build_array((eligible_contexts->0) || '{"health_status":"limitations_reported","health_restrictions":["knee_pain"]}'::jsonb) from public.reviewed_workout_versions where content_version='valid-v1'$$,'23514');
select fixture.denied('signed incompatible duration rejected',$$insert into public.reviewed_workout_versions(content_id,content_version,rule_version,source_uri,reviewer_name,reviewer_role,approved_at,status,prescription,eligible_contexts) select 'bad','duration','r','s','TEST','TEST',now(),'approved',jsonb_set(prescription,'{session_minutes}','120'),eligible_contexts from public.reviewed_workout_versions where content_version='valid-v1'$$,'23514');
select fixture.denied('catalogue data cannot be rewritten',$$update public.reviewed_workout_versions set source_uri='changed' where content_version='valid-v1'$$,'55000');
select fixture.denied('catalogue cannot be deleted',$$delete from public.reviewed_workout_versions where content_version='valid-v1'$$,'55000');
set role authenticated;
select fixture.ok('approved exact persisted context is available',(public.reviewed_workout_availability()->>'state')='available' and jsonb_array_length(public.reviewed_workout_availability()->'workouts')=1);
select fixture.denied('caller snapshot cannot be admitted',$$select public.start_workout_record('{"id":"62000000-0000-4000-8000-000000000030","mode":"reviewed","timezone":"UTC","catalogue_version_id":"62000000-0000-4000-8000-000000000021","snapshot":{}}')$$,'22023');
select fixture.denied('caller owner cannot be admitted',$$select public.start_workout_record('{"id":"62000000-0000-4000-8000-000000000030","mode":"reviewed","timezone":"UTC","catalogue_version_id":"62000000-0000-4000-8000-000000000021","user_id":"62000000-0000-4000-8000-000000000002"}')$$,'22023');
select fixture.denied('unsigned exact version unavailable',$$select public.start_workout_record('{"id":"62000000-0000-4000-8000-000000000030","mode":"reviewed","timezone":"UTC","catalogue_version_id":"62000000-0000-4000-8000-000000000020"}')$$,'P5501');
select fixture.ok('reviewed start copies trusted immutable identity',(public.start_workout_record('{"id":"62000000-0000-4000-8000-000000000030","mode":"reviewed","timezone":"UTC","catalogue_version_id":"62000000-0000-4000-8000-000000000021"}')->'prescription_snapshot'->>'content_version')='valid-v1');
select fixture.ok('all prescribed sets seeded once',(select count(*)=2 and count(reps)=0 from public.exercise_set_logs where workout_log_id='62000000-0000-4000-8000-000000000030'));
select fixture.ok('reviewed start replay stable',public.start_workout_record('{"id":"62000000-0000-4000-8000-000000000030","mode":"reviewed","timezone":"UTC","catalogue_version_id":"62000000-0000-4000-8000-000000000021"}')=public.start_workout_record('{"id":"62000000-0000-4000-8000-000000000030","mode":"reviewed","timezone":"UTC","catalogue_version_id":"62000000-0000-4000-8000-000000000021"}'));
select fixture.denied('cannot complete unfilled prescribed sets',$$select public.complete_workout_record('{"id":"62000000-0000-4000-8000-000000000030","expected_revision":0}')$$,'55000');
select fixture.denied('managed reviewed direct set insert denied',$$insert into public.exercise_set_logs(user_id,workout_log_id,set_number) values(auth.uid(),'62000000-0000-4000-8000-000000000030',3)$$,'42501');
select fixture.denied('new unprescribed set rejected',$$select public.save_workout_record(jsonb_build_object('id','62000000-0000-4000-8000-000000000030','expected_revision',0,'sets',jsonb_build_array(jsonb_build_object('id','62000000-0000-4000-8000-000000000031','exercise_key','62000000-0000-4000-8000-000000000010','exercise_name','SYNTHETIC test activity','set_number',3,'reps',1,'weight',0,'rpe',1))))$$,'22023');
select fixture.denied('late invalid reviewed save rolls back',$$select public.save_workout_record(jsonb_build_object('id','62000000-0000-4000-8000-000000000030','expected_revision',0,'sets',jsonb_set(fixture.sets('62000000-0000-4000-8000-000000000030'),'{1,reps}','101')))$$,'22023');
select fixture.ok('invalid batch kept original draft state',(select revision=0 and not completed and completed_at is null from public.workout_logs where id='62000000-0000-4000-8000-000000000030') and (select count(reps)=0 from public.exercise_set_logs where workout_log_id='62000000-0000-4000-8000-000000000030'));
select fixture.ok('reviewed records save through owned RPC',(public.save_workout_record(jsonb_build_object('id','62000000-0000-4000-8000-000000000030','expected_revision',0,'sets',fixture.sets('62000000-0000-4000-8000-000000000030')))->>'revision')::integer=1);
select fixture.ok('reviewed snapshot exact fields retained',(select prescription_snapshot->'prescription'=fixture.prescription() and prescription_snapshot->>'reviewer_name'='SYNTHETIC_NOT_A_REVIEWER' and prescription_snapshot->>'rule_version'='SYNTHETIC_RULE_V1' from public.workout_logs where id='62000000-0000-4000-8000-000000000030'));
select set_config('request.jwt.claim.sub','62000000-0000-4000-8000-000000000002',false);
select public.save_foundation_profile(fixture.profile() || '{"primary_goal":"mobility","secondary_goal":"strength"}'::jsonb);
select fixture.ok('B own incompatible persisted goals are unavailable',public.reviewed_workout_availability()='{"state":"unavailable","workouts":[]}'::jsonb);
select fixture.ok('B cannot read A reviewed record',(select count(*)=0 from public.workout_logs where id='62000000-0000-4000-8000-000000000030'));
select fixture.ok('B cannot read A reviewed sets',(select count(*)=0 from public.exercise_set_logs where workout_log_id='62000000-0000-4000-8000-000000000030'));
select fixture.denied('B cannot replay A reviewed ID',$$select public.start_workout_record('{"id":"62000000-0000-4000-8000-000000000030","mode":"reviewed","timezone":"UTC","catalogue_version_id":"62000000-0000-4000-8000-000000000021"}')$$,'P0002');
select fixture.denied('B cannot save A reviewed record',$$select public.save_workout_record('{"id":"62000000-0000-4000-8000-000000000030","expected_revision":1,"sets":[]}')$$,'P0002');
select fixture.denied('B cannot complete A reviewed record',$$select public.complete_workout_record('{"id":"62000000-0000-4000-8000-000000000030","expected_revision":1}')$$,'P0002');
select set_config('request.jwt.claim.sub','62000000-0000-4000-8000-000000000001',false);
update public.health_profiles set status='not_reviewed' where user_id=auth.uid();
select fixture.ok('unknown screening produces no workout',public.reviewed_workout_availability()='{"state":"unsupported","workouts":[]}'::jsonb);
select fixture.denied('changed context denies start replay',$$select public.start_workout_record('{"id":"62000000-0000-4000-8000-000000000030","mode":"reviewed","timezone":"UTC","catalogue_version_id":"62000000-0000-4000-8000-000000000021"}')$$,'P5501');
update public.health_profiles set status='limitations_reported',restrictions=array['medical_clearance'] where user_id=auth.uid();
select fixture.ok('referral produces no automatic substitute',public.reviewed_workout_availability()='{"state":"referral_required","workouts":[]}'::jsonb);
select public.save_foundation_profile(fixture.profile());
delete from public.user_equipment where user_id=auth.uid() and equipment_type='bodyweight';
select fixture.ok('incompatible persisted equipment unavailable',(public.reviewed_workout_availability()->>'state')='unavailable');
select public.save_foundation_profile(fixture.profile());
update public.profiles set training_days_per_week=1 where user_id=auth.uid();
select fixture.ok('changed availability unavailable',(public.reviewed_workout_availability()->>'state')='unavailable');
select public.save_foundation_profile(fixture.profile());
reset role;
select fixture.add_version('62000000-0000-4000-8000-000000000022','future-v2');
select fixture.ok('new version has distinct prescription',(select prescription->>'title'='DIFFERENT SYNTHETIC FUTURE CONTENT' from public.reviewed_workout_versions where content_version='future-v2'));
select fixture.ok('new version does not rewrite history',(select prescription_snapshot->>'content_version'='valid-v1' from public.workout_logs where id='62000000-0000-4000-8000-000000000030'));
set role authenticated;
select fixture.denied('start replay cannot change reviewed version',$$select public.start_workout_record('{"id":"62000000-0000-4000-8000-000000000030","mode":"reviewed","timezone":"UTC","catalogue_version_id":"62000000-0000-4000-8000-000000000022"}')$$,'P5502');
reset role;
select fixture.denied('draft version reference immutable',$$update public.workout_logs set catalogue_version_id='62000000-0000-4000-8000-000000000022' where id='62000000-0000-4000-8000-000000000030'$$,'55000');
select fixture.denied('draft reviewed snapshot immutable',$$update public.workout_logs set prescription_snapshot='{}' where id='62000000-0000-4000-8000-000000000030'$$,'55000');
update public.reviewed_workout_versions set status='revoked' where id='62000000-0000-4000-8000-000000000021';
select fixture.denied('revocation cannot be reversed',$$update public.reviewed_workout_versions set status='approved' where id='62000000-0000-4000-8000-000000000021'$$,'55000');
set role authenticated;
select fixture.denied('revoked version rejects new start',$$select public.start_workout_record('{"id":"62000000-0000-4000-8000-000000000032","mode":"reviewed","timezone":"UTC","catalogue_version_id":"62000000-0000-4000-8000-000000000021"}')$$,'P5501');
select fixture.denied('revoked version rejects start replay',$$select public.start_workout_record('{"id":"62000000-0000-4000-8000-000000000030","mode":"reviewed","timezone":"UTC","catalogue_version_id":"62000000-0000-4000-8000-000000000021"}')$$,'P5501');
select fixture.ok('saved reviewed facts can complete after revocation',(public.complete_workout_record('{"id":"62000000-0000-4000-8000-000000000030","expected_revision":1}')->>'completed_at') is not null);
select fixture.ok('reviewed completion replay stable',public.complete_workout_record('{"id":"62000000-0000-4000-8000-000000000030","expected_revision":1}')=public.complete_workout_record('{"id":"62000000-0000-4000-8000-000000000030","expected_revision":2}'));
select fixture.ok('revocation preserved owned original history',(select prescription_snapshot->'prescription'=fixture.prescription() and prescription_snapshot->>'content_version'='valid-v1' from public.workout_logs where id='62000000-0000-4000-8000-000000000030'));
select fixture.denied('completed reviewed save refused',$$select public.save_workout_record('{"id":"62000000-0000-4000-8000-000000000030","expected_revision":2,"sets":[]}')$$,'40001');
reset role;
set role anon;
select fixture.denied('anonymous availability denied',$$select public.reviewed_workout_availability()$$,'42501');
select fixture.denied('anonymous reviewed start denied',$$select public.start_workout_record('{}')$$,'42501');
reset role;
