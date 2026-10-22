-- Test-only SQL interface required by the real migrations. This is not GoTrue or PostgREST.
-- These roles and auth objects exist only in the new, disposable, no-TCP cluster.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema fixture;
create table fixture.results (name text primary key);
create function fixture.ok(name text, condition boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if condition is distinct from true then raise exception 'FAIL: %', name; end if;
  insert into fixture.results values (name);
end $$;
create function fixture.denied(name text, command text, expected_state text) returns void
language plpgsql security invoker set search_path = '' as $$
declare actual text;
begin
  begin
    execute command;
  exception when others then
    get stacked diagnostics actual = returned_sqlstate;
  end;
  if actual is distinct from expected_state then
    raise exception 'FAIL: %, expected SQLSTATE %, got %', name, expected_state, coalesce(actual, 'SUCCESS');
  end if;
  perform fixture.ok(name, true);
end $$;
grant usage on schema fixture to anon, authenticated;
grant execute on function fixture.ok(text,boolean), fixture.denied(text,text,text) to anon, authenticated;

-- SQL-only privileged-role fixture; this is not a provider service identity.
create role service_role nologin noinherit bypassrls;
grant usage on schema public,auth,fixture to service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema auth,fixture,public to service_role;
create function fixture.profile() returns jsonb language sql immutable as $$
select '{"display_name":"SQL fixture A","date_of_birth":"1965-04-12","sex":"not_specified","unit_system":"metric","height_cm":175,"weight_kg":82,"waist_cm":null,"fitness_level":"consistent","primary_goal":"strength","secondary_goal":"mobility","training_days_per_week":3,"preferred_session_minutes":45,"training_location":"home","health_status":"none_reported","health_restrictions":[],"health_notes":"","equipment":["dumbbells","bodyweight"]}'::jsonb;
$$;
grant execute on function fixture.profile() to authenticated,service_role;
