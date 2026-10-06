-- Additive migration. Existing onboarding_responses remain a read-only legacy archive.
-- Do not run schema.sql again on an existing project; see docs/development.md.
alter table public.profiles
  add column height_cm numeric check (height_cm between 100 and 250),
  add column weight_kg numeric check (weight_kg between 25 and 350),
  add column waist_cm numeric check (waist_cm between 30 and 250),
  add column fitness_level text check (fitness_level in ('beginner','returning','consistent')),
  add column primary_goal text check (primary_goal in ('fat_loss','muscle_gain','strength','mobility','general_fitness')),
  add column secondary_goal text check (secondary_goal in ('fat_loss','muscle_gain','strength','mobility','general_fitness')),
  add column training_days_per_week integer check (training_days_per_week between 1 and 7),
  add column preferred_session_minutes integer check (preferred_session_minutes between 10 and 120),
  add column training_location text check (training_location in ('home','gym','both')),
  add column onboarding_completed_at timestamptz,
  add constraint different_goals check (primary_goal is distinct from secondary_goal or secondary_goal is null),
  add constraint profile_unit_system check (unit_system in ('metric','imperial')),
  add constraint profile_name_length check (display_name is null or length(trim(display_name)) between 1 and 100),
  add constraint profile_adult check (date_of_birth is null or date_of_birth between '1900-01-01'::date and (current_date - interval '18 years')::date),
  add constraint profile_sex check (sex is null or sex in ('female','male','not_specified'));

create table public.health_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('none_reported','limitations_reported','not_reviewed')),
  restrictions text[] not null default '{}',
  notes text not null default '' check (length(notes) <= 2000),
  updated_at timestamptz not null default now(),
  constraint known_restrictions check (restrictions <@ array['knee_pain','shoulder_pain','back_pain','balance_risk','wrist_pain','hip_pain','achilles_pain','grip_injury','abdominal_strain','pain_lying_flat','medical_clearance']::text[]),
  constraint no_hidden_limitations check (status <> 'none_reported' or (cardinality(restrictions) = 0 and notes = '')),
  constraint reported_limitations check (status <> 'limitations_reported' or cardinality(restrictions) > 0 or length(trim(notes)) > 0)
);
create table public.user_equipment (
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment_type text not null check (equipment_type in ('bodyweight','chair','wall','mat','dumbbells','barbell','bench','resistance_bands','cable_machine','machines','kettlebell','treadmill','bike','pool','step','rail','box','sled')),
  primary key (user_id, equipment_type)
);
create trigger health_updated_at before update on public.health_profiles for each row execute function public.set_updated_at();
alter table public.health_profiles enable row level security;
alter table public.user_equipment enable row level security;

-- No user-writable role fields; admin authority stays controlled by trusted SQL administration.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Remove broad admin exceptions from private user data. Deliberate support access requires
-- a separate, reviewed service, not a user client capable of querying everyone's health data.
do $$
declare t text; p record;
begin
  foreach t in array array['profiles','onboarding_responses','subscriptions','workout_plans','workout_days','workout_exercises','workout_logs','exercise_set_logs','nutrition_targets','meal_logs','body_metrics','habit_logs','progress_reports','ai_coach_messages','safety_flags','health_profiles','user_equipment'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy owner_select on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

grant insert (user_id,display_name,date_of_birth,sex,unit_system,height_cm,weight_kg,waist_cm,fitness_level,primary_goal,secondary_goal,training_days_per_week,preferred_session_minutes,training_location,onboarding_completed_at) on public.profiles to authenticated;
grant update (display_name,date_of_birth,sex,unit_system,height_cm,weight_kg,waist_cm,fitness_level,primary_goal,secondary_goal,training_days_per_week,preferred_session_minutes,training_location,onboarding_completed_at) on public.profiles to authenticated;
create policy owner_insert on public.profiles for insert to authenticated with check (user_id = (select auth.uid()) and role = 'user');
create policy owner_update on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant insert,update,delete on public.health_profiles, public.user_equipment to authenticated;
create policy owner_write on public.health_profiles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy owner_write on public.user_equipment for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Future core mutations remain available with ownership checks. Subscription, reports,
-- safety flags and legacy onboarding are server-controlled or read-only to clients.
do $$
declare t text;
begin
  foreach t in array array['workout_plans','workout_days','workout_exercises','workout_logs','exercise_set_logs','nutrition_targets','meal_logs','body_metrics','habit_logs','ai_coach_messages'] loop
    execute format('grant insert,update,delete on public.%I to authenticated', t);
    execute format('create policy owner_write on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Bootstrap profiles independently of client-controlled auth metadata.
create or replace function public.bootstrap_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id,role) values (new.id,'user') on conflict (user_id) do nothing;
  return new;
end $$;
revoke all on function public.bootstrap_profile() from public;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.bootstrap_profile();
insert into public.profiles (user_id,role) select id,'user' from auth.users on conflict (user_id) do nothing;

-- Atomic, repeatable save. Security INVOKER preserves RLS and column privileges.
create or replace function public.save_foundation_profile(payload jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); equipment text[]; restriction_values text[];
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(payload) <> 'object' or
     (payload - array['display_name','date_of_birth','sex','unit_system','height_cm','weight_kg','waist_cm','fitness_level','primary_goal','secondary_goal','training_days_per_week','preferred_session_minutes','training_location','health_status','health_restrictions','health_notes','equipment']) <> '{}'::jsonb or
     not (payload ?& array['display_name','date_of_birth','sex','unit_system','height_cm','weight_kg','waist_cm','fitness_level','primary_goal','secondary_goal','training_days_per_week','preferred_session_minutes','training_location','health_status','health_restrictions','health_notes','equipment']) then
    raise exception 'Invalid profile fields' using errcode = '22023';
  end if;
  if payload->>'display_name' is null or length(trim(payload->>'display_name')) not between 1 and 100 or
     payload->>'date_of_birth' is null or payload->>'sex' is null or payload->>'unit_system' is null or
     payload->>'height_cm' is null or payload->>'weight_kg' is null or payload->>'fitness_level' is null or
     payload->>'primary_goal' is null or payload->>'training_days_per_week' is null or
     payload->>'preferred_session_minutes' is null or payload->>'training_location' is null or
     jsonb_typeof(payload->'equipment') <> 'array' or jsonb_typeof(payload->'health_restrictions') <> 'array' then
    raise exception 'Incomplete profile' using errcode = '22023';
  end if;
  select array_agg(value) into equipment from jsonb_array_elements_text(payload->'equipment');
  select coalesce(array_agg(value), '{}') into restriction_values from jsonb_array_elements_text(payload->'health_restrictions');
  if cardinality(equipment) is null or cardinality(equipment) not between 1 and 18 or
     cardinality(restriction_values) > 11 or
     cardinality(equipment) <> (select count(distinct v) from unnest(equipment) v) or
     cardinality(restriction_values) <> (select count(distinct v) from unnest(restriction_values) v) then
    raise exception 'Invalid selections' using errcode = '22023';
  end if;
  insert into public.profiles (user_id,display_name,date_of_birth,sex,unit_system,height_cm,weight_kg,waist_cm,fitness_level,primary_goal,secondary_goal,training_days_per_week,preferred_session_minutes,training_location,onboarding_completed_at)
  values (uid,trim(payload->>'display_name'),(payload->>'date_of_birth')::date,payload->>'sex',payload->>'unit_system',(payload->>'height_cm')::numeric,(payload->>'weight_kg')::numeric,(payload->>'waist_cm')::numeric,payload->>'fitness_level',payload->>'primary_goal',payload->>'secondary_goal',(payload->>'training_days_per_week')::int,(payload->>'preferred_session_minutes')::int,payload->>'training_location',now())
  on conflict (user_id) do update set display_name=excluded.display_name,date_of_birth=excluded.date_of_birth,sex=excluded.sex,unit_system=excluded.unit_system,height_cm=excluded.height_cm,weight_kg=excluded.weight_kg,waist_cm=excluded.waist_cm,fitness_level=excluded.fitness_level,primary_goal=excluded.primary_goal,secondary_goal=excluded.secondary_goal,training_days_per_week=excluded.training_days_per_week,preferred_session_minutes=excluded.preferred_session_minutes,training_location=excluded.training_location,onboarding_completed_at=coalesce(profiles.onboarding_completed_at,excluded.onboarding_completed_at);
  insert into public.health_profiles(user_id,status,restrictions,notes)
  values(uid,payload->>'health_status',restriction_values,trim(payload->>'health_notes'))
  on conflict(user_id) do update set status=excluded.status,restrictions=excluded.restrictions,notes=excluded.notes;
  delete from public.user_equipment where user_id=uid;
  insert into public.user_equipment(user_id,equipment_type) select uid, unnest(equipment);
end $$;
revoke all on function public.save_foundation_profile(jsonb) from public, anon;
grant execute on function public.save_foundation_profile(jsonb) to authenticated;
