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
