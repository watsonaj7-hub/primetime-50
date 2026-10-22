-- Additive #6 personal recording contract. NULL record_mode marks untouched legacy data.
-- No reviewed content is present: this migration cannot create a reviewed prescription.
alter table public.workout_logs
  add column record_mode text,
  add column record_timezone text,
  add column prescription_snapshot jsonb,
  add column completed_at timestamptz,
  add column revision integer not null default 0,
  add constraint recording_contract check (record_mode is null or (
    record_mode = 'personal' and record_timezone is not null and
    prescription_snapshot = '{"source":"user_recorded","version":1,"prescription":null,"weight_unit":"kg"}'::jsonb and
    prescription_snapshot is not null and workout_day_id is null and revision >= 0 and
    completed = (completed_at is not null)));
alter table public.exercise_set_logs
  add column exercise_key uuid,
  add column exercise_name text,
  add constraint recording_set_fields check (exercise_key is null or (
    exercise_name is not null and length(btrim(exercise_name)) between 1 and 200 and
    workout_exercise_id is null and (weight is null or weight <= 10000)));
create unique index recording_set_slot on public.exercise_set_logs(workout_log_id,exercise_key,set_number) where exercise_key is not null;

-- Preserve legacy owner writes. Managed records are writable ONLY through the bounded RPCs.
-- SELECT retains the existing owner_select policy, including completed records. No admin exception.
drop policy owner_write on public.workout_logs;
create policy owner_write on public.workout_logs for all to authenticated
  using (user_id = (select auth.uid()) and record_mode is null)
  with check (user_id = (select auth.uid()) and record_mode is null);
drop policy owner_write on public.exercise_set_logs;
create policy owner_write on public.exercise_set_logs for all to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.workout_logs l where l.id = workout_log_id and l.user_id = (select auth.uid()) and l.record_mode is null))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.workout_logs l where l.id = workout_log_id and l.user_id = (select auth.uid()) and l.record_mode is null));

-- Immutability is also an SQL invariant, independent of service validation.
create function public.protect_workout_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.record_mode is not null then
    if old.completed or new.id is distinct from old.id or new.user_id is distinct from old.user_id or
       new.record_mode is distinct from old.record_mode or new.record_timezone is distinct from old.record_timezone or
       new.prescription_snapshot is distinct from old.prescription_snapshot or new.workout_day_id is distinct from old.workout_day_id or
       new.performed_at is distinct from old.performed_at or new.completed_at is distinct from old.completed_at and not (not old.completed and new.completed) then
      raise exception using errcode = '55000', message = 'Workout record is immutable';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.protect_workout_record() from public, anon, authenticated;
create trigger protect_workout_record before update on public.workout_logs for each row execute function public.protect_workout_record();

-- Internal validator: reject unknown keys and non-object inputs (including SQL/JSON null).
create function public.workout_payload_keys(payload jsonb, allowed text[]) returns void
language plpgsql set search_path = '' as $$
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid workout payload';
  end if;
  if exists (select 1 from jsonb_object_keys(payload) k where not k = any(allowed)) then
    raise exception using errcode = '22023', message = 'Unknown workout fields';
  end if;
end $$;
revoke all on function public.workout_payload_keys(jsonb,text[]) from public, anon, authenticated;

create function public.start_workout_record(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); rid uuid; zone text; result public.workout_logs;
begin
  if uid is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  perform public.workout_payload_keys(payload, array['id','mode','timezone']);
  if jsonb_typeof(payload->'id') is distinct from 'string' or jsonb_typeof(payload->'mode') is distinct from 'string' or
     jsonb_typeof(payload->'timezone') is distinct from 'string' then
    raise exception using errcode = '22023', message = 'Invalid start fields';
  end if;
  rid := (payload->>'id')::uuid; zone := payload->>'timezone';
  if payload->>'mode' <> 'personal' then
    raise exception using errcode = '55000', message = 'Reviewed content unavailable';
  end if;
  if length(zone) not between 1 and 100 or not exists (select 1 from pg_catalog.pg_timezone_names where name = zone) then
    raise exception using errcode = '22023', message = 'Invalid timezone';
  end if;
  -- Unique ID serialises concurrent starts. A conflicting foreign ID never becomes owned.
  insert into public.workout_logs(id,user_id,record_mode,record_timezone,prescription_snapshot)
    values (rid,uid,'personal',zone,'{"source":"user_recorded","version":1,"prescription":null,"weight_unit":"kg"}'::jsonb)
    on conflict (id) do nothing;
  select * into result from public.workout_logs where id = rid and user_id = uid and record_mode = 'personal' for update;
  if not found then raise exception using errcode = 'P0002', message = 'Workout not found'; end if;
  if result.record_timezone <> zone then raise exception using errcode = '40001', message = 'Start identity conflict'; end if;
  return to_jsonb(result);
end $$;
revoke all on function public.start_workout_record(jsonb) from public, anon;
grant execute on function public.start_workout_record(jsonb) to authenticated;

create function public.save_workout_record(payload jsonb) returns jsonb
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
  select * into result from public.workout_logs where id = rid and user_id = uid and record_mode = 'personal' for update;
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
      insert into public.exercise_set_logs(id,user_id,workout_log_id,exercise_key,exercise_name,set_number,reps,weight,rpe)
        values(sid,uid,rid,ekey,ename,sn,nr,nw,ne);
    end if;
  end loop;
  -- Omitted sets are never deleted. Any failure rolls back the entire batch, including revision.
  update public.workout_logs set revision = revision + 1 where id = rid returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.save_workout_record(jsonb) from public, anon;
grant execute on function public.save_workout_record(jsonb) to authenticated;

create function public.complete_workout_record(payload jsonb) returns jsonb
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
  select * into result from public.workout_logs where id = rid and user_id = uid and record_mode = 'personal' for update;
  if not found then raise exception using errcode = 'P0002', message = 'Workout not found'; end if;
  -- A replay returns the original row without touching timestamps or revision.
  if result.completed then return to_jsonb(result); end if;
  if result.revision <> expected then raise exception using errcode = '40001', message = 'Workout changed'; end if;
  if not exists (select 1 from public.exercise_set_logs where workout_log_id = rid and user_id = uid) or
     exists (select 1 from public.exercise_set_logs where workout_log_id = rid and user_id = uid and
       (exercise_key is null or reps is null or weight is null or rpe is null)) then
    raise exception using errcode = '55000', message = 'Save complete set values first';
  end if;
  update public.workout_logs set completed = true, completed_at = clock_timestamp(), revision = revision + 1 where id = rid returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.complete_workout_record(jsonb) from public, anon;
grant execute on function public.complete_workout_record(jsonb) to authenticated;
