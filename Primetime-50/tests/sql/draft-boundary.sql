-- Synthetic actors, actual production migrations/RPC/table triggers.
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
insert into public.onboarding_drafts(user_id,draft_json) values(auth.uid(),'{"step":1}');
update public.onboarding_drafts set draft_json='{"step":2}' where user_id=auth.uid();
select fixture.ok('incomplete drafts remain writable',(select draft_json='{"step":2}'::jsonb from public.onboarding_drafts));
select fixture.denied('failed completion rolls back its draft deletion',
 $$select public.save_foundation_profile(fixture.profile() || '{"equipment":["invalid"]}'::jsonb)$$,'23514');
select fixture.ok('rollback restores incomplete profile',(select onboarding_completed_at is null from public.profiles where user_id=auth.uid()));
select fixture.ok('rollback retains exact draft',(select draft_json='{"step":2}'::jsonb from public.onboarding_drafts));
select public.save_foundation_profile(fixture.profile());
select fixture.ok('completion clears draft',(select count(*)=0 from public.onboarding_drafts));
select fixture.denied('late owned upsert denied',
 $$insert into public.onboarding_drafts(user_id,draft_json) values(auth.uid(),'{"step":3}') on conflict(user_id) do update set draft_json=excluded.draft_json$$,'55000');
select fixture.denied('duplicate direct insert denied',
 $$insert into public.onboarding_drafts(user_id,draft_json) values(auth.uid(),'{"step":3}')$$,'55000');
select fixture.denied('completed state cannot be reopened',
 $$update public.profiles set onboarding_completed_at=null where user_id=auth.uid()$$,'55000');
select public.save_foundation_profile(fixture.profile() || '{"display_name":"Edited complete profile"}'::jsonb);
select fixture.ok('completed profile edits still work',(select display_name='Edited complete profile' and onboarding_completed_at is not null from public.profiles where user_id=auth.uid()));
select fixture.ok('completed edits leave no draft',(select count(*)=0 from public.onboarding_drafts));
select fixture.denied('cross-owner draft write still denied',
 $$insert into public.onboarding_drafts(user_id,draft_json) values('00000000-0000-4000-8000-000000000002','{}')$$,'42501');
reset role;
-- Owner and BYPASSRLS service role cannot bypass normal table triggers.
select fixture.denied('table owner late insert denied',
 $$insert into public.onboarding_drafts(user_id,draft_json) values('00000000-0000-4000-8000-000000000001','{}')$$,'55000');
set role service_role;
select fixture.denied('service role late insert denied',
 $$insert into public.onboarding_drafts(user_id,draft_json) values('00000000-0000-4000-8000-000000000001','{}')$$,'55000');
select fixture.denied('service role cannot reopen completion',
 $$update public.profiles set onboarding_completed_at=null where user_id='00000000-0000-4000-8000-000000000001'$$,'55000');
-- An incomplete actor's draft cannot be moved to a completed actor, even by a
-- role that bypasses ownership RLS. This exercises the direct UPDATE seam.
insert into public.onboarding_drafts(user_id,draft_json) values('00000000-0000-4000-8000-000000000002','{"step":1}');
select fixture.denied('service role direct reassignment denied',
 $$update public.onboarding_drafts set user_id='00000000-0000-4000-8000-000000000001' where user_id='00000000-0000-4000-8000-000000000002'$$,'55000');
select fixture.ok('service role denial preserves cleared state',(select count(*)=0 from public.onboarding_drafts where user_id='00000000-0000-4000-8000-000000000001'));
select fixture.ok('service role denial preserves other draft',(select draft_json='{"step":1}'::jsonb from public.onboarding_drafts where user_id='00000000-0000-4000-8000-000000000002'));
reset role;
set role anon;
select fixture.denied('anonymous draft insert remains forbidden',
 $$insert into public.onboarding_drafts(user_id,draft_json) values('00000000-0000-4000-8000-000000000001','{}')$$,'42501');
reset role;
