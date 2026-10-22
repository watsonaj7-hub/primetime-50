-- #11 target-free user records. Legacy meal_logs and nutrition_targets remain untouched.
-- A unified owned entry supports water (absent from the baseline) and exact integer protein.
create table public.nutrition_entries (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('meal','water')),
 logged_on date not null check (logged_on between date '1900-01-01' and date '2100-12-31'),
 timezone text not null check (length(timezone) between 1 and 100),
 description text,
 protein_tenths integer,
 water_ml integer,
 revision integer not null default 0 check (revision between 0 and 2147483646),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint nutrition_record_values check (
  (kind='meal' and description is not null and length(btrim(description)) between 1 and 300 and
   protein_tenths is not null and protein_tenths between 0 and 100000 and water_ml is null) or
  (kind='water' and description is null and protein_tenths is null and water_ml is not null and water_ml between 1 and 100000))
);
create index nutrition_owner_day on public.nutrition_entries(user_id,logged_on,timezone,id);
alter table public.nutrition_entries enable row level security;
revoke all on public.nutrition_entries from public,anon,authenticated;
grant select on public.nutrition_entries to authenticated;
create policy nutrition_owner_read on public.nutrition_entries for select to authenticated using (user_id=(select auth.uid()));
-- No direct writer grant/policy. The definer is necessary for atomic receipt + data writes.
-- All reads/writes below bind auth.uid() explicitly; no admin or metadata ownership exception.
create table public.nutrition_mutation_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 mutation_id uuid not null,
 request jsonb not null,
 result jsonb not null,
 primary key(user_id,mutation_id)
);
alter table public.nutrition_mutation_receipts enable row level security;
revoke all on public.nutrition_mutation_receipts from public,anon,authenticated;

create function public.nutrition_validate_day(payload jsonb) returns void
language plpgsql set search_path='' as $$
declare day_text text; zone text;
begin
 if jsonb_typeof(payload) is distinct from 'object' or
    jsonb_typeof(payload->'day') is distinct from 'string' or
    jsonb_typeof(payload->'timezone') is distinct from 'string' or
    (select count(*) from jsonb_object_keys(payload))<>2 then
  raise exception using errcode='22023',message='Invalid day fields';
 end if;
 day_text:=payload->>'day'; zone:=payload->>'timezone';
 if day_text !~ '^\d{4}-\d{2}-\d{2}$' or day_text::date not between date '1900-01-01' and date '2100-12-31' or
    to_char(day_text::date,'YYYY-MM-DD')<>day_text or length(zone) not between 1 and 100 or
    not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then
  raise exception using errcode='22023',message='Invalid day or timezone';
 end if;
end $$;
revoke all on function public.nutrition_validate_day(jsonb) from public,anon,authenticated;

create function public.read_nutrition_day(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception using errcode='42501',message='Authentication required'; end if;
 perform public.nutrition_validate_day(payload);
 -- One statement snapshot, no PostgREST row-limit truncation of the day's entries/totals.
 select jsonb_build_object('day',payload->>'day','timezone',payload->>'timezone',
  'entries',coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'logged_on',e.logged_on,'timezone',e.timezone,
   'description',e.description,'protein_tenths',e.protein_tenths,'water_ml',e.water_ml,'revision',e.revision) order by e.created_at,e.id),'[]'::jsonb),
  'totals',jsonb_build_object('protein_tenths',coalesce(sum(e.protein_tenths),0),'water_ml',coalesce(sum(e.water_ml),0))) into result
 from public.nutrition_entries e where e.user_id=uid and e.logged_on=(payload->>'day')::date and e.timezone=payload->>'timezone';
 return result;
end $$;
revoke all on function public.read_nutrition_day(jsonb) from public,anon,authenticated;
grant execute on function public.read_nutrition_day(jsonb) to authenticated;

create function public.mutate_nutrition_record(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); mid uuid; rid uuid; operation text; e jsonb; expected integer;
 prior public.nutrition_mutation_receipts; saved public.nutrition_entries; result jsonb;
begin
 if uid is null then raise exception using errcode='42501',message='Authentication required'; end if;
 if payload is null or jsonb_typeof(payload) is distinct from 'object' or
    jsonb_typeof(payload->'mutation_id') is distinct from 'string' or
    jsonb_typeof(payload->'action') is distinct from 'string' then
  raise exception using errcode='22023',message='Invalid mutation';
 end if;
 mid:=(payload->>'mutation_id')::uuid; operation:=payload->>'action';
 if operation not in ('create','update','delete') then raise exception using errcode='22023',message='Invalid action'; end if;
 -- Serialize this owner's mutations, including same-key retries and concurrent revisions.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,11011));
 select * into prior from public.nutrition_mutation_receipts where user_id=uid and mutation_id=mid;
 if found then
  if prior.request<>payload then raise exception using errcode='P1101',message='Mutation identity conflict'; end if;
  return prior.result; -- Never replay side effects, even after later edits or deletion.
 end if;
 if operation='delete' then
  if (select count(*) from jsonb_object_keys(payload))<>4 or
     exists(select 1 from jsonb_object_keys(payload) k where k not in ('action','mutation_id','id','expected_revision')) or
     jsonb_typeof(payload->'id') is distinct from 'string' or
     jsonb_typeof(payload->'expected_revision') is distinct from 'number' or
     (payload->>'expected_revision')::numeric<>trunc((payload->>'expected_revision')::numeric) then
   raise exception using errcode='22023',message='Invalid deletion';
  end if;
  rid:=(payload->>'id')::uuid; expected:=(payload->>'expected_revision')::integer;
 else
  if (select count(*) from jsonb_object_keys(payload))<>3 or
     exists(select 1 from jsonb_object_keys(payload) k where k not in ('action','mutation_id','entry')) or
     jsonb_typeof(payload->'entry') is distinct from 'object' then raise exception using errcode='22023',message='Invalid entry'; end if;
  e:=payload->'entry';
  if (select count(*) from jsonb_object_keys(e))<>8 or
     exists(select 1 from jsonb_object_keys(e) k where k not in ('id','kind','logged_on','timezone','description','protein_tenths','water_ml','revision')) or
     jsonb_typeof(e->'id') is distinct from 'string' or jsonb_typeof(e->'kind') is distinct from 'string' or
     jsonb_typeof(e->'revision') is distinct from 'number' or (e->>'revision')::numeric<>trunc((e->>'revision')::numeric) then
   raise exception using errcode='22023',message='Invalid entry fields';
  end if;
  perform public.nutrition_validate_day(jsonb_build_object('day',e->'logged_on','timezone',e->'timezone'));
  if e->>'kind'='meal' then
   if jsonb_typeof(e->'description') is distinct from 'string' or jsonb_typeof(e->'protein_tenths') is distinct from 'number' or
      (e->>'protein_tenths')::numeric<>trunc((e->>'protein_tenths')::numeric) or e->'water_ml'<>'null'::jsonb or
      e->>'description'<>btrim(e->>'description') then raise exception using errcode='22023',message='Invalid meal'; end if;
  elsif e->>'kind'='water' then
   if e->'description'<>'null'::jsonb or e->'protein_tenths'<>'null'::jsonb or
      jsonb_typeof(e->'water_ml') is distinct from 'number' or (e->>'water_ml')::numeric<>trunc((e->>'water_ml')::numeric) then
    raise exception using errcode='22023',message='Invalid water'; end if;
  else raise exception using errcode='22023',message='Invalid entry kind'; end if;
  rid:=(e->>'id')::uuid; expected:=(e->>'revision')::integer;
 end if;
 if expected not between 0 and 2147483646 then raise exception using errcode='22023',message='Invalid revision'; end if;
 if operation='create' then
  if expected<>0 then raise exception using errcode='22023',message='Invalid initial revision'; end if;
  insert into public.nutrition_entries(id,user_id,kind,logged_on,timezone,description,protein_tenths,water_ml)
   values(rid,uid,e->>'kind',(e->>'logged_on')::date,e->>'timezone',e->>'description',(e->>'protein_tenths')::integer,(e->>'water_ml')::integer)
   on conflict(id) do nothing returning * into saved;
  if not found then raise exception using errcode='P1101',message='Entry identity conflict'; end if;
 else
  select * into saved from public.nutrition_entries where id=rid and user_id=uid for update;
  if not found then raise exception using errcode='P0002',message='Owned entry not found'; end if;
  if saved.revision<>expected or expected=2147483646 then raise exception using errcode='P1101',message='Entry revision conflict'; end if;
  if operation='delete' then
   delete from public.nutrition_entries where id=rid and user_id=uid;
  else
   if saved.kind<>e->>'kind' then raise exception using errcode='22023',message='Entry kind is immutable'; end if;
   update public.nutrition_entries set logged_on=(e->>'logged_on')::date,timezone=e->>'timezone',description=e->>'description',
    protein_tenths=(e->>'protein_tenths')::integer,water_ml=(e->>'water_ml')::integer,revision=revision+1,updated_at=now()
    where id=rid and user_id=uid returning * into saved;
  end if;
 end if;
 result:=jsonb_build_object('mutation_id',mid,'id',rid,'action',operation,'revision',saved.revision);
 insert into public.nutrition_mutation_receipts(user_id,mutation_id,request,result) values(uid,mid,payload,result);
 return result;
end $$;
revoke all on function public.mutate_nutrition_record(jsonb) from public,anon,authenticated;
grant execute on function public.mutate_nutrition_record(jsonb) to authenticated;
