-- Disposable SQL fixture only. Synthetic auth.uid() is not Supabase Auth/REST acceptance.
insert into auth.users(id) values('11000000-0000-4000-8000-000000000001'),('11000000-0000-4000-8000-000000000002');
create function fixture.nutrition_entry(kind text default 'meal') returns jsonb language sql as $$
select jsonb_build_object('id','11000000-0000-4000-8000-000000000011','kind',kind,'logged_on','2026-10-23','timezone','Australia/Melbourne','revision',0,
 'description',case when kind='meal' then 'TEST ONLY meal' else null end,'protein_tenths',case when kind='meal' then 123 else null end,'water_ml',case when kind='water' then 250 else null end)
$$;
create function fixture.nutrition_create() returns jsonb language sql as $$
select jsonb_build_object('action','create','mutation_id','11000000-0000-4000-8000-000000000021','entry',fixture.nutrition_entry())
$$;
create function fixture.nutrition_day(day text default '2026-10-23') returns jsonb language sql as $$select jsonb_build_object('day',day,'timezone','Australia/Melbourne')$$;
grant execute on all functions in schema fixture to authenticated,anon;
set role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
select fixture.ok('empty day has exact zero totals',public.read_nutrition_day(fixture.nutrition_day())->'totals'='{"protein_tenths":0,"water_ml":0}'::jsonb);
select fixture.ok('create returns original identity',public.mutate_nutrition_record(fixture.nutrition_create())->>'id'='11000000-0000-4000-8000-000000000011');
select fixture.ok('retry receipt is identical',public.mutate_nutrition_record(fixture.nutrition_create())=public.mutate_nutrition_record(fixture.nutrition_create()));
select fixture.ok('retry does not double protein',public.read_nutrition_day(fixture.nutrition_day())->'totals'->>'protein_tenths'='123');
select fixture.ok('RLS owner can read one entry',(select count(*)=1 from public.nutrition_entries));
select fixture.denied('same key different payload refuses', $$select public.mutate_nutrition_record(jsonb_set(fixture.nutrition_create(),'{entry,protein_tenths}','999'))$$,'P1101');
select fixture.denied('new key cannot reuse record identity', $$select public.mutate_nutrition_record(jsonb_set(fixture.nutrition_create(),'{mutation_id}','"11000000-0000-4000-8000-000000000022"'))$$,'P1101');
select fixture.denied('forged top owner refuses', $$select public.mutate_nutrition_record(fixture.nutrition_create()||'{"user_id":"11000000-0000-4000-8000-000000000002","mutation_id":"11000000-0000-4000-8000-000000000023"}')$$,'22023');
select fixture.denied('forged entry owner refuses', $$select public.mutate_nutrition_record(jsonb_set(fixture.nutrition_create()||'{"mutation_id":"11000000-0000-4000-8000-000000000024"}','{entry,user_id}','"11000000-0000-4000-8000-000000000002"'))$$,'22023');
select fixture.denied('fractional protein refuses before integer cast', $$select public.mutate_nutrition_record(jsonb_set(fixture.nutrition_create()||'{"mutation_id":"11000000-0000-4000-8000-000000000025"}','{entry,protein_tenths}','12.3'))$$,'22023');
select fixture.denied('string protein refuses', $$select public.mutate_nutrition_record(jsonb_set(fixture.nutrition_create()||'{"mutation_id":"11000000-0000-4000-8000-000000000026"}','{entry,protein_tenths}','"123"'))$$,'22023');
select fixture.denied('invalid calendar date refuses', $$select public.read_nutrition_day(fixture.nutrition_day('2026-02-30'))$$,'22008');
select fixture.denied('invalid timezone refuses', $$select public.read_nutrition_day('{"day":"2026-10-23","timezone":"invented"}')$$,'22023');
select fixture.denied('direct insert denied', $$insert into public.nutrition_entries(id,user_id,kind,logged_on,timezone,water_ml) values(gen_random_uuid(),auth.uid(),'water','2026-10-23','UTC',250)$$,'42501');
select fixture.denied('direct update denied', $$update public.nutrition_entries set water_ml=123$$,'42501');
select fixture.denied('direct delete denied', $$delete from public.nutrition_entries$$,'42501');
select fixture.denied('receipt table private', $$select * from public.nutrition_mutation_receipts$$,'42501');
select fixture.denied('internal validator private', $$select public.nutrition_validate_day(fixture.nutrition_day())$$,'42501');
-- Move meal to a different calendar day; original create receipt must not undo it.
select public.mutate_nutrition_record(jsonb_build_object('action','update','mutation_id','11000000-0000-4000-8000-000000000031','entry',fixture.nutrition_entry()||'{"logged_on":"2026-10-22","protein_tenths":201}'));
select fixture.ok('edit removes original day total',public.read_nutrition_day(fixture.nutrition_day())->'totals'->>'protein_tenths'='0');
select fixture.ok('edit adds exact destination total',public.read_nutrition_day(fixture.nutrition_day('2026-10-22'))->'totals'->>'protein_tenths'='201');
select fixture.ok('edit increments revision exactly once',(select revision=1 from public.nutrition_entries));
select public.mutate_nutrition_record(fixture.nutrition_create());
select fixture.ok('old create retry never undoes later edit',(select logged_on='2026-10-22' and protein_tenths=201 and revision=1 from public.nutrition_entries));
select fixture.denied('stale edit refuses', $$select public.mutate_nutrition_record(jsonb_build_object('action','update','mutation_id','11000000-0000-4000-8000-000000000032','entry',fixture.nutrition_entry()))$$,'P1101');
select fixture.denied('kind cannot change', $$select public.mutate_nutrition_record(jsonb_build_object('action','update','mutation_id','11000000-0000-4000-8000-000000000033','entry',fixture.nutrition_entry('water')||'{"revision":1}'))$$,'22023');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',false);
select fixture.ok('B RLS sees no A rows',(select count(*)=0 from public.nutrition_entries));
select fixture.ok('B daily RPC sees no A entries',jsonb_array_length(public.read_nutrition_day(fixture.nutrition_day('2026-10-22'))->'entries')=0);
select fixture.denied('B cannot update A', $$select public.mutate_nutrition_record(jsonb_build_object('action','update','mutation_id','11000000-0000-4000-8000-000000000041','entry',fixture.nutrition_entry()||'{"revision":1}'))$$,'P0002');
select fixture.denied('B cannot delete A', $$select public.mutate_nutrition_record('{"action":"delete","mutation_id":"11000000-0000-4000-8000-000000000042","id":"11000000-0000-4000-8000-000000000011","expected_revision":1}')$$,'P0002');
select fixture.denied('B cannot create over A ID', $$select public.mutate_nutrition_record(fixture.nutrition_create())$$,'P1101');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
select public.mutate_nutrition_record('{"action":"delete","mutation_id":"11000000-0000-4000-8000-000000000051","id":"11000000-0000-4000-8000-000000000011","expected_revision":1}');
select fixture.ok('delete removes correct day total',public.read_nutrition_day(fixture.nutrition_day('2026-10-22'))->'totals'->>'protein_tenths'='0');
select public.mutate_nutrition_record('{"action":"delete","mutation_id":"11000000-0000-4000-8000-000000000051","id":"11000000-0000-4000-8000-000000000011","expected_revision":1}');
select public.mutate_nutrition_record(fixture.nutrition_create());
select fixture.ok('delete retry and old create never resurrect record',(select count(*)=0 from public.nutrition_entries));
-- Water success and validated refusal paths.
select public.mutate_nutrition_record(jsonb_build_object('action','create','mutation_id','11000000-0000-4000-8000-000000000061','entry',fixture.nutrition_entry('water')||'{"id":"11000000-0000-4000-8000-000000000012"}'));
select fixture.ok('water is separate exact whole mL total',public.read_nutrition_day(fixture.nutrition_day())->'totals'='{"protein_tenths":0,"water_ml":250}'::jsonb);
select fixture.denied('negative water refuses', $$select public.mutate_nutrition_record(jsonb_build_object('action','create','mutation_id','11000000-0000-4000-8000-000000000062','entry',fixture.nutrition_entry('water')||'{"id":"11000000-0000-4000-8000-000000000013","water_ml":-1}'))$$,'23514');
select fixture.ok('failed create leaves no row',(select count(*)=1 from public.nutrition_entries));
select fixture.ok('different zone day never borrows totals',public.read_nutrition_day('{"day":"2026-10-23","timezone":"UTC"}')->'totals'='{"protein_tenths":0,"water_ml":0}'::jsonb);
set role anon;
select set_config('request.jwt.claim.sub','',false);
select fixture.denied('anon cannot read records', $$select * from public.nutrition_entries$$,'42501');
select fixture.denied('anon cannot read day RPC', $$select public.read_nutrition_day(fixture.nutrition_day())$$,'42501');
select fixture.denied('anon cannot mutate RPC', $$select public.mutate_nutrition_record(fixture.nutrition_create())$$,'42501');
reset role;
select fixture.ok('cluster has no TCP listener',current_setting('listen_addresses')='' and inet_server_addr() is null);
select count(*) as nutrition_assertions from fixture.results;
