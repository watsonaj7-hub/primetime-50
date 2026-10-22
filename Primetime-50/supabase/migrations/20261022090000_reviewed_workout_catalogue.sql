-- Neutral admission software ONLY. Intentionally no catalogue/approval seed data.
-- Trusted operators must separately review the exact content, rules and eligible contexts.
create table public.reviewed_workout_versions (
  id uuid primary key default gen_random_uuid(),
  content_id text not null check (length(btrim(content_id)) between 1 and 200),
  content_version text not null check (length(btrim(content_version)) between 1 and 100),
  rule_version text not null check (length(btrim(rule_version)) between 1 and 100),
  source_uri text not null check (length(btrim(source_uri)) between 1 and 2000),
  reviewer_name text, reviewer_role text, approved_at timestamptz,
  status text not null default 'pending' check (status in ('pending','approved','revoked')),
  prescription jsonb, eligible_contexts jsonb,
  unique(content_id,content_version)
);
alter table public.reviewed_workout_versions enable row level security;
revoke all on public.reviewed_workout_versions from public, anon, authenticated;
-- No authenticated read/write/admin policy. Only bounded authenticated RPCs expose eligible content.

create function public.reviewed_text(v jsonb, max_length integer default 2000) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v)='string' and length(btrim(v #>> '{}')) between 1 and max_length, false)
$$;
create function public.reviewed_context_valid(c jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; a jsonb;
begin
  if c is null or jsonb_typeof(c)<>'object' then return false; end if;
  perform public.workout_payload_keys(c,array['date_of_birth','sex','unit_system','height_cm','weight_kg','waist_cm','fitness_level','primary_goal','secondary_goal','training_days_per_week','preferred_session_minutes','training_location','health_status','health_restrictions','health_notes','equipment']);
  if (select count(*) from jsonb_object_keys(c))<>16 then return false; end if;
  foreach k in array array['date_of_birth','sex','unit_system','fitness_level','primary_goal','training_location','health_status'] loop
    if not public.reviewed_text(c->k) then return false; end if;
  end loop;
  if (c->>'date_of_birth')::date < date '1900-01-01' or c->>'date_of_birth' <> to_char((c->>'date_of_birth')::date,'YYYY-MM-DD') then return false; end if;
  if c->>'sex' not in ('female','male','not_specified') or c->>'unit_system' not in ('metric','imperial') or
     c->>'fitness_level' not in ('beginner','returning','consistent') or
     c->>'primary_goal' not in ('fat_loss','muscle_gain','strength','mobility','general_fitness') or
     c->>'training_location' not in ('home','gym','both') or
     c->>'health_status' not in ('none_reported','limitations_reported') or c->'health_notes' <> '""'::jsonb then return false; end if;
  if c->'secondary_goal' <> 'null'::jsonb and (jsonb_typeof(c->'secondary_goal')<>'string' or c->>'secondary_goal' not in ('fat_loss','muscle_gain','strength','mobility','general_fitness') or c->>'secondary_goal'=c->>'primary_goal') then return false; end if;
  foreach k in array array['height_cm','weight_kg','training_days_per_week','preferred_session_minutes'] loop
    if jsonb_typeof(c->k) is distinct from 'number' then return false; end if;
  end loop;
  if (c->>'height_cm')::numeric not between 100 and 250 or (c->>'weight_kg')::numeric not between 25 and 350 or
     (c->>'training_days_per_week')::numeric not between 1 and 7 or (c->>'training_days_per_week')::numeric <> trunc((c->>'training_days_per_week')::numeric) or
     (c->>'preferred_session_minutes')::numeric not between 10 and 120 or (c->>'preferred_session_minutes')::numeric <> trunc((c->>'preferred_session_minutes')::numeric) then return false; end if;
  if c->'waist_cm' <> 'null'::jsonb and (jsonb_typeof(c->'waist_cm')<>'number' or (c->>'waist_cm')::numeric not between 30 and 250) then return false; end if;
  foreach k in array array['health_restrictions','equipment'] loop
    a:=c->k;
    if jsonb_typeof(a) is distinct from 'array' then return false; end if;
    if exists(select 1 from jsonb_array_elements(a) x where jsonb_typeof(x)<>'string') then return false; end if;
    if (select count(*)<>count(distinct x) from jsonb_array_elements(a) x) then return false; end if;
    if a <> coalesce((select jsonb_agg(x order by x) from jsonb_array_elements(a) x),'[]'::jsonb) then return false; end if;
  end loop;
  if jsonb_array_length(c->'equipment')=0 or exists(select 1 from jsonb_array_elements_text(c->'equipment') x where x not in ('bodyweight','chair','wall','mat','dumbbells','barbell','bench','resistance_bands','cable_machine','machines','kettlebell','treadmill','bike','pool','step','rail','box','sled')) then return false; end if;
  if exists(select 1 from jsonb_array_elements_text(c->'health_restrictions') x where x not in ('knee_pain','shoulder_pain','back_pain','balance_risk','wrist_pain','hip_pain','achilles_pain','grip_injury','abdominal_strain','pain_lying_flat')) then return false; end if;
  if (c->>'health_status'='none_reported') <> (jsonb_array_length(c->'health_restrictions')=0) then return false; end if;
  return true;
exception when others then return false;
end $$;

-- Exact object equality is intentional: JSONB containment would incorrectly match
-- a current equipment/restriction subset of an approved context.
create function public.reviewed_context_matches(contexts jsonb, c jsonb) returns boolean
language sql immutable set search_path = '' as $$
 select exists(select 1 from jsonb_array_elements(case when jsonb_typeof(contexts)='array' then contexts else '[]'::jsonb end) candidate where candidate=c)
$$;
create function public.reviewed_definition_valid(p jsonb, contexts jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare e jsonb; c jsonb; k text; total_sets integer:=0;
begin
  if p is null or jsonb_typeof(p)<>'object' or jsonb_typeof(contexts) is distinct from 'array' then return false; end if;
  if jsonb_array_length(contexts) not between 1 and 100 then return false; end if;
  perform public.workout_payload_keys(p,array['title','session_minutes','screening_rules','referral_rules','stop_rules','progression_rules','measurement','exercises']);
  if (select count(*) from jsonb_object_keys(p))<>8 then return false; end if;
  foreach k in array array['title','screening_rules','referral_rules','stop_rules','progression_rules','measurement'] loop
    if not public.reviewed_text(p->k) then return false; end if;
  end loop;
  if jsonb_typeof(p->'session_minutes') is distinct from 'number' or (p->>'session_minutes')::numeric not between 1 and 120 or (p->>'session_minutes')::numeric <> trunc((p->>'session_minutes')::numeric) or jsonb_typeof(p->'exercises') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p->'exercises') not between 1 and 100 then return false; end if;
  if (select count(*)<>count(distinct x->>'exercise_key') from jsonb_array_elements(p->'exercises') x) then return false; end if;
  for c in select value from jsonb_array_elements(contexts) loop
    if not public.reviewed_context_valid(c) or (p->>'session_minutes')::numeric > (c->>'preferred_session_minutes')::numeric then return false; end if;
  end loop;
  for e in select value from jsonb_array_elements(p->'exercises') loop
    perform public.workout_payload_keys(e,array['exercise_key','exercise_name','equipment','exclusions','sets','reps','duration_seconds','load_guidance','rpe_guidance','rest_seconds','cues','stop_rules']);
    if (select count(*) from jsonb_object_keys(e))<>12 then return false; end if;
    foreach k in array array['exercise_key','exercise_name','load_guidance','rpe_guidance','cues','stop_rules'] loop
      if not public.reviewed_text(e->k) then return false; end if;
    end loop;
    if e->>'exercise_key' <> ((e->>'exercise_key')::uuid)::text or e->>'exercise_name' <> btrim(e->>'exercise_name') or octet_length(e->>'exercise_name')>200 then return false; end if;
    if length(e->>'exercise_name')>200 or jsonb_typeof(e->'sets') is distinct from 'number' or (e->>'sets')::numeric not between 1 and 20 or (e->>'sets')::numeric <> trunc((e->>'sets')::numeric) then return false; end if;
    total_sets:=total_sets+(e->>'sets')::integer;
    if (e->'reps'='null'::jsonb) = (e->'duration_seconds'='null'::jsonb) then return false; end if;
    if e->'reps'<>'null'::jsonb and not public.reviewed_text(e->'reps') then return false; end if;
    foreach k in array array['duration_seconds','rest_seconds'] loop
      if k='duration_seconds' and e->k='null'::jsonb then continue; end if;
      if jsonb_typeof(e->k) is distinct from 'number' or (e->>k)::numeric not between (case when k='rest_seconds' then 0 else 1 end) and 2147483647 or (e->>k)::numeric<>trunc((e->>k)::numeric) then return false; end if;
    end loop;
    foreach k in array array['equipment','exclusions'] loop
      if jsonb_typeof(e->k) is distinct from 'array' or exists(select 1 from jsonb_array_elements(e->k) x where jsonb_typeof(x)<>'string') then return false; end if;
    end loop;
    if exists(select 1 from jsonb_array_elements_text(e->'exclusions') x where x not in ('knee_pain','shoulder_pain','back_pain','balance_risk','wrist_pain','hip_pain','achilles_pain','grip_injury','abdominal_strain','pain_lying_flat','medical_clearance')) then return false; end if;
    for c in select value from jsonb_array_elements(contexts) loop
      if not ((c->'equipment') @> (e->'equipment')) or exists(select 1 from jsonb_array_elements(e->'exclusions') x where (c->'health_restrictions') @> jsonb_build_array(x)) then return false; end if;
    end loop;
  end loop;
  return total_sets<=100;
exception when others then return false;
end $$;
create function public.reviewed_version_ready(v public.reviewed_workout_versions) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((v).status='approved' and length(btrim((v).reviewer_name)) between 1 and 200 and length(btrim((v).reviewer_role)) between 1 and 200 and (v).approved_at is not null and (v).approved_at<=statement_timestamp() and public.reviewed_definition_valid((v).prescription,(v).eligible_contexts),false)
$$;
alter table public.reviewed_workout_versions add constraint approved_definition check (status<>'approved' or coalesce(length(btrim(reviewer_name)) between 1 and 200 and length(btrim(reviewer_role)) between 1 and 200 and approved_at is not null and public.reviewed_definition_valid(prescription,eligible_contexts),false));
create function public.protect_reviewed_version() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='DELETE' then raise exception using errcode='55000', message='Version history cannot be deleted'; end if;
  if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') or (old.status='revoked' and new.status<>'revoked') or (old.status='approved' and new.status='pending') then
    raise exception using errcode='55000', message='Create a new immutable content version';
  end if;
  return new;
end $$;
create trigger immutable_reviewed_version before update or delete on public.reviewed_workout_versions for each row execute function public.protect_reviewed_version();
create trigger reviewed_catalogue_gate before insert or update or delete on public.reviewed_workout_versions for each statement execute function public.serialize_foundation_write();

-- Extend the existing BEFORE-statement context gate to every eligibility input.
-- Touching the profile also provides an MVCC fence: old REPEATABLE READ snapshots
-- must fail when SELECT FOR UPDATE encounters the updated profile tuple.
alter table public.profiles add column reviewed_context_revision bigint not null default 0;
create function public.bump_reviewed_context_revision() returns trigger language plpgsql set search_path = '' as $$
begin new.reviewed_context_revision:=old.reviewed_context_revision+1; return new; end $$;
create trigger reviewed_context_revision before update on public.profiles for each row execute function public.bump_reviewed_context_revision();
create function public.touch_reviewed_context() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op<>'INSERT' then update public.profiles set updated_at=updated_at where user_id=old.user_id; end if;
  if tg_op<>'DELETE' and (tg_op='INSERT' or new.user_id is distinct from old.user_id) then update public.profiles set updated_at=updated_at where user_id=new.user_id; end if;
  return null;
end $$;
create trigger reviewed_context_gate before insert or update or delete on public.health_profiles for each statement execute function public.serialize_foundation_write();
create trigger reviewed_context_gate before insert or update or delete on public.user_equipment for each statement execute function public.serialize_foundation_write();
create trigger reviewed_context_touch after insert or update or delete on public.health_profiles for each row execute function public.touch_reviewed_context();
create trigger reviewed_context_touch after insert or update or delete on public.user_equipment for each row execute function public.touch_reviewed_context();

create function public.read_reviewed_context(uid uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; h public.health_profiles; eq jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(1735289203,3);
  select * into p from public.profiles where user_id=uid for update;
  if not found or p.onboarding_completed_at is null then return null; end if;
  select * into h from public.health_profiles where user_id=uid;
  if not found then return null; end if;
  select coalesce(jsonb_agg(equipment_type order by equipment_type),'[]'::jsonb) into eq from public.user_equipment where user_id=uid;
  return jsonb_build_object('date_of_birth',p.date_of_birth,'sex',p.sex,'unit_system',p.unit_system,'height_cm',p.height_cm,'weight_kg',p.weight_kg,'waist_cm',p.waist_cm,'fitness_level',p.fitness_level,'primary_goal',p.primary_goal,'secondary_goal',p.secondary_goal,'training_days_per_week',p.training_days_per_week,'preferred_session_minutes',p.preferred_session_minutes,'training_location',p.training_location,'health_status',h.status,'health_restrictions',(select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from unnest(h.restrictions) x),'health_notes',h.notes,'equipment',eq);
end $$;
create function public.reviewed_version_snapshot(v public.reviewed_workout_versions, c jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('source','reviewed_catalogue','approval_status_at_start','approved','contract_version',1,'catalogue_version_id',(v).id,'content_id',(v).content_id,'content_version',(v).content_version,'rule_version',(v).rule_version,'source_uri',(v).source_uri,'reviewer_name',(v).reviewer_name,'reviewer_role',(v).reviewer_role,'approved_at',(v).approved_at,'weight_unit','kg','prescription',(v).prescription,'selection_context',c)
$$;
create function public.reviewed_workout_availability() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); c jsonb; v public.reviewed_workout_versions; available jsonb:='[]'::jsonb;
begin
  if uid is null then raise exception using errcode='42501',message='Authentication required'; end if;
  c:=public.read_reviewed_context(uid);
  if (c->'health_restrictions') @> '["medical_clearance"]'::jsonb then return jsonb_build_object('state','referral_required','workouts','[]'::jsonb); end if;
  if not public.reviewed_context_valid(c) then return jsonb_build_object('state','unsupported','workouts','[]'::jsonb); end if;
  -- Lock before rechecking status, including under stale repeatable-read snapshots.
  for v in select * from public.reviewed_workout_versions order by content_id,content_version,id for share loop
    if public.reviewed_version_ready(v) and public.reviewed_context_matches(v.eligible_contexts,c) then
      available:=available || jsonb_build_array(jsonb_build_object('catalogue_version_id',v.id,'prescription_snapshot',public.reviewed_version_snapshot(v,c)));
    end if;
  end loop;
  return jsonb_build_object('state',case when jsonb_array_length(available)>0 then 'available' else 'unavailable' end,'workouts',available);
end $$;

alter table public.workout_logs add column catalogue_version_id uuid references public.reviewed_workout_versions(id) on delete restrict;
alter table public.workout_logs drop constraint recording_contract;
alter table public.workout_logs add constraint recording_contract check ((record_mode is null and catalogue_version_id is null) or coalesce(
  record_timezone is not null and workout_day_id is null and revision>=0 and completed=(completed_at is not null) and (
    (record_mode='personal' and catalogue_version_id is null and prescription_snapshot='{"source":"user_recorded","version":1,"prescription":null,"weight_unit":"kg"}'::jsonb) or
    (record_mode='reviewed' and catalogue_version_id is not null and jsonb_typeof(prescription_snapshot)='object' and prescription_snapshot->>'source'='reviewed_catalogue' and prescription_snapshot->>'catalogue_version_id'=catalogue_version_id::text)
  ),false));
create function public.guard_reviewed_record() returns trigger language plpgsql set search_path = '' as $$
declare v public.reviewed_workout_versions; c jsonb;
begin
  if tg_op='UPDATE' then
    if new.catalogue_version_id is distinct from old.catalogue_version_id or (old.record_mode is null and new.record_mode is not null) then raise exception using errcode='55000',message='Immutable version reference'; end if;
  elsif new.record_mode='reviewed' then
    -- Also protect trusted direct SQL inserts; ordinary users have no managed INSERT policy.
    c:=public.read_reviewed_context(new.user_id);
    select * into v from public.reviewed_workout_versions where id=new.catalogue_version_id for share;
    if auth.uid() is distinct from new.user_id or not found or not public.reviewed_version_ready(v) or not public.reviewed_context_valid(c) or not(public.reviewed_context_matches(v.eligible_contexts,c)) or new.prescription_snapshot is distinct from public.reviewed_version_snapshot(v,c) then
      raise exception using errcode='P5501',message='Reviewed workout unavailable';
    end if;
  end if;
  return new;
end $$;
create trigger guard_reviewed_record before insert or update on public.workout_logs for each row execute function public.guard_reviewed_record();

-- Keep the exact personal start behaviour behind an internal-only helper.
alter function public.start_workout_record(jsonb) rename to start_personal_workout_record;
revoke all on function public.start_personal_workout_record(jsonb) from public, anon, authenticated;
create function public.start_workout_record(payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); rid uuid; vid uuid; zone text; c jsonb; v public.reviewed_workout_versions; result public.workout_logs; e jsonb; n integer;
begin
  if uid is null then raise exception using errcode='42501',message='Authentication required'; end if;
  perform public.workout_payload_keys(payload,array['id','mode','timezone','catalogue_version_id']);
  if payload->>'mode'='personal' then
    if payload ? 'catalogue_version_id' then raise exception using errcode='22023',message='Personal version reference forbidden'; end if;
    return public.start_personal_workout_record(payload);
  end if;
  if payload->>'mode'='reviewed' and not(payload ? 'catalogue_version_id') then raise exception using errcode='55000',message='Reviewed content unavailable'; end if;
  if jsonb_typeof(payload->'id') is distinct from 'string' or payload->>'mode' is distinct from 'reviewed' or jsonb_typeof(payload->'timezone') is distinct from 'string' or jsonb_typeof(payload->'catalogue_version_id') is distinct from 'string' then raise exception using errcode='22023',message='Invalid reviewed start'; end if;
  rid:=(payload->>'id')::uuid; vid:=(payload->>'catalogue_version_id')::uuid; zone:=payload->>'timezone';
  if length(zone) not between 1 and 100 or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception using errcode='22023',message='Invalid timezone'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1735289203,3);
  if exists(select 1 from public.workout_logs where id=rid and user_id<>uid) then raise exception using errcode='P0002',message='Workout not found'; end if;
  c:=public.read_reviewed_context(uid);
  select * into v from public.reviewed_workout_versions where id=vid for share;
  if not found or not public.reviewed_version_ready(v) or not public.reviewed_context_valid(c) or not(public.reviewed_context_matches(v.eligible_contexts,c)) then raise exception using errcode='P5501',message='Reviewed workout unavailable'; end if;
  -- Even a replay requires CURRENT approval and matching current context. History has its own read path.
  select * into result from public.workout_logs where id=rid for update;
  if found then
    if result.user_id<>uid then raise exception using errcode='P0002',message='Workout not found'; end if;
    if result.record_mode is distinct from 'reviewed' or result.catalogue_version_id is distinct from vid or result.record_timezone is distinct from zone then raise exception using errcode='P5502',message='Start identity conflict'; end if;
    return to_jsonb(result);
  end if;
  insert into public.workout_logs(id,user_id,record_mode,record_timezone,catalogue_version_id,prescription_snapshot)
    values(rid,uid,'reviewed',zone,vid,public.reviewed_version_snapshot(v,c)) returning * into result;
  for e in select value from jsonb_array_elements(v.prescription->'exercises') loop
    for n in 1..(e->>'sets')::integer loop
      insert into public.exercise_set_logs(user_id,workout_log_id,exercise_key,exercise_name,set_number)
        values(uid,rid,(e->>'exercise_key')::uuid,e->>'exercise_name',n);
    end loop;
  end loop;
  return to_jsonb(result);
end $$;
grant execute on function public.start_workout_record(jsonb), public.reviewed_workout_availability() to authenticated;
revoke all on function public.start_workout_record(jsonb), public.reviewed_workout_availability() from public, anon;

-- Preserve personal/legacy semantics while enabling the same owned reviewed lifecycle.
create or replace function public.save_workout_record(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); rid uuid; expected integer; result public.workout_logs; item jsonb;
  sid uuid; ekey uuid; ename text; sn integer; nr integer; nw numeric; ne numeric; existing public.exercise_set_logs;
begin
  if uid is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  perform public.workout_payload_keys(payload, array['id','expected_revision','sets']);
  if jsonb_typeof(payload->'id') is distinct from 'string' or jsonb_typeof(payload->'expected_revision') is distinct from 'number' or
     (payload->>'expected_revision')::numeric not between 0 and 2147483646 or
     (payload->>'expected_revision')::numeric <> trunc((payload->>'expected_revision')::numeric) then
    raise exception using errcode = '22023', message = 'Invalid identity/revision';
  end if;
  rid := (payload->>'id')::uuid; expected := (payload->>'expected_revision')::integer;
  -- Authorise and lock before examining set values or performing any writes.
  select * into result from public.workout_logs where id = rid and user_id = uid and record_mode in ('personal','reviewed') for update;
  if not found then raise exception using errcode = 'P0002', message = 'Workout not found'; end if;
  if result.completed or result.revision <> expected then raise exception using errcode = '40001', message = 'Workout changed'; end if;
  if jsonb_typeof(payload->'sets') is distinct from 'array' then raise exception using errcode = '22023', message = 'Invalid sets'; end if;
  if jsonb_array_length(payload->'sets') not between 1 and 100 then raise exception using errcode = '22023', message = 'Invalid set count'; end if;
  if (select count(*) <> count(distinct x->>'id') or count(*) <> count(distinct ((x->>'exercise_key') || ':' || (x->>'set_number'))) from jsonb_array_elements(payload->'sets') x) then
    raise exception using errcode = '22023', message = 'Duplicate set identity';
  end if;
  for item in select value from jsonb_array_elements(payload->'sets') loop
    perform public.workout_payload_keys(item, array['id','exercise_key','exercise_name','set_number','reps','weight','rpe']);
    if not (item ?& array['id','exercise_key','exercise_name','set_number','reps','weight','rpe']) or
       jsonb_typeof(item->'id') <> 'string' or jsonb_typeof(item->'exercise_key') <> 'string' or
       jsonb_typeof(item->'exercise_name') <> 'string' or jsonb_typeof(item->'set_number') <> 'number' or
       jsonb_typeof(item->'reps') not in ('number','null') or jsonb_typeof(item->'weight') not in ('number','null') or
       jsonb_typeof(item->'rpe') not in ('number','null') then
      raise exception using errcode = '22023', message = 'Invalid set fields';
    end if;
    if (item->>'set_number')::numeric <> trunc((item->>'set_number')::numeric) or
       (item->>'reps')::numeric <> trunc((item->>'reps')::numeric) then
      raise exception using errcode = '22023', message = 'Whole set number/reps required';
    end if;
    sid := (item->>'id')::uuid; ekey := (item->>'exercise_key')::uuid;
    ename := btrim(item->>'exercise_name'); sn := (item->>'set_number')::integer;
    nr := (item->>'reps')::integer; nw := (item->>'weight')::numeric; ne := (item->>'rpe')::numeric;
    if length(ename) not between 1 and 200 or sn not between 1 and 20 or nr not between 0 and 100 or
       nw not between 0 and 10000 or ne not between 1 and 10 then
      raise exception using errcode = '22023', message = 'Invalid set range';
    end if;
    select * into existing from public.exercise_set_logs where id = sid;
    if found then
      if existing.user_id <> uid or existing.workout_log_id <> rid or existing.exercise_key is distinct from ekey or
         existing.exercise_name is distinct from ename or existing.set_number <> sn then
        raise exception using errcode = 'P0002', message = 'Set not found';
      end if;
      update public.exercise_set_logs set reps = nr, weight = nw, rpe = ne where id = sid;
    else
      if result.record_mode='reviewed' then raise exception using errcode='22023',message='Use the original prescribed set identity'; end if;
      insert into public.exercise_set_logs(id,user_id,workout_log_id,exercise_key,exercise_name,set_number,reps,weight,rpe)
        values(sid,uid,rid,ekey,ename,sn,nr,nw,ne);
    end if;
  end loop;
  -- Reviewed starts precreate every prescribed set; no new slots/renames may be added.
  -- Omitted sets are never deleted. Any failure rolls back the entire batch, including revision.
  update public.workout_logs set revision = revision + 1 where id = rid returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.save_workout_record(jsonb) from public, anon;
grant execute on function public.save_workout_record(jsonb) to authenticated;

create or replace function public.complete_workout_record(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); rid uuid; expected integer; result public.workout_logs;
begin
  if uid is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  perform public.workout_payload_keys(payload, array['id','expected_revision']);
  if jsonb_typeof(payload->'id') is distinct from 'string' or jsonb_typeof(payload->'expected_revision') is distinct from 'number' or
     (payload->>'expected_revision')::numeric not between 0 and 2147483646 or
     (payload->>'expected_revision')::numeric <> trunc((payload->>'expected_revision')::numeric) then
    raise exception using errcode = '22023', message = 'Invalid identity/revision';
  end if;
  rid := (payload->>'id')::uuid; expected := (payload->>'expected_revision')::integer;
  select * into result from public.workout_logs where id = rid and user_id = uid and record_mode in ('personal','reviewed') for update;
  if not found then raise exception using errcode = 'P0002', message = 'Workout not found'; end if;
  -- A replay returns the original row without touching timestamps or revision.
  if result.completed then return to_jsonb(result); end if;
  if result.revision <> expected then raise exception using errcode = '40001', message = 'Workout changed'; end if;
  if not exists (select 1 from public.exercise_set_logs where workout_log_id = rid and user_id = uid) or
     exists (select 1 from public.exercise_set_logs where workout_log_id = rid and user_id = uid and
       (exercise_key is null or reps is null or weight is null or rpe is null)) then
    raise exception using errcode = '55000', message = 'Save complete set values first';
  end if;
  if result.record_mode='reviewed' and (
    (select count(*) from public.exercise_set_logs where workout_log_id=rid and user_id=uid) <>
    (select sum((e->>'sets')::integer) from jsonb_array_elements(result.prescription_snapshot->'prescription'->'exercises') e)
  ) then raise exception using errcode='55000',message='Original prescribed sets are incomplete'; end if;
  update public.workout_logs set completed = true, completed_at = clock_timestamp(), revision = revision + 1 where id = rid returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.complete_workout_record(jsonb) from public, anon;
grant execute on function public.complete_workout_record(jsonb) to authenticated;

do $$
declare signature text;
begin
  foreach signature in array array[
    'reviewed_text(jsonb,integer)','reviewed_context_valid(jsonb)','reviewed_context_matches(jsonb,jsonb)','reviewed_definition_valid(jsonb,jsonb)',
    'reviewed_version_ready(public.reviewed_workout_versions)','protect_reviewed_version()',
    'bump_reviewed_context_revision()','touch_reviewed_context()','read_reviewed_context(uuid)',
    'reviewed_version_snapshot(public.reviewed_workout_versions,jsonb)','guard_reviewed_record()'
  ] loop execute 'revoke all on function public.' || signature || ' from public, anon, authenticated'; end loop;
end $$;
