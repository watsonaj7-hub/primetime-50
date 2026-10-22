-- Admission software only. NO approval, provider activation or catalogue seeds.
-- All generation writes are service-only; authenticated clients can only read their saved plans.
create table public.generated_workout_policies (
 id uuid primary key default gen_random_uuid(), rule_version text not null unique,
 status text not null default 'pending' check(status in ('pending','approved','revoked')),
 reviewer_name text, reviewer_role text, approved_at timestamptz,
 source_uri text not null, eligible_contexts jsonb not null, rules jsonb not null
);
create unique index one_generated_policy on public.generated_workout_policies ((true)) where status='approved';
create table public.generated_provider_activations (
 id uuid primary key default gen_random_uuid(), status text not null default 'pending' check(status in ('pending','approved','revoked')),
 reviewer_name text, reviewer_role text, approved_at timestamptz,
 model text not null check(model='gpt-4o-mini'),
 -- Full per-attempt envelope is reserved permanently, even after errors. Operators must
 -- approve this ceiling against current model pricing before any live activation.
 price_review_reference text not null check(length(btrim(price_review_reference)) between 1 and 2000),
 reserve_microusd integer not null check(reserve_microusd between 100000 and 1000000),
 daily_budget_microusd integer not null check(daily_budget_microusd between 100000 and 10000000),
 user_daily_calls integer not null check(user_daily_calls between 1 and 5),
 min_interval_seconds integer not null check(min_interval_seconds between 60 and 86400)
);
create unique index one_generated_activation on public.generated_provider_activations ((true)) where status='approved';
create table public.generated_workout_requests (
 user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
 policy_version_id uuid not null references public.generated_workout_policies(id),
 activation_id uuid not null references public.generated_provider_activations(id),
 context_revision bigint not null, context jsonb not null,
 reserved_microusd integer not null, created_at timestamptz not null default clock_timestamp(),
 state text not null default 'reserved' check(state in ('reserved','failed','complete')),
 primary key(user_id,request_id)
);
-- A written MVCC fence prevents stale REPEATABLE READ snapshots from overspending.
create table public.generated_budget_guard (id boolean primary key default true check(id), revision bigint not null default 0);
insert into public.generated_budget_guard(id) values(true);
create index generated_request_budget on public.generated_workout_requests(created_at);
create table public.generated_workout_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, request_id uuid not null,
 policy_version_id uuid not null references public.generated_workout_policies(id),
 created_at timestamptz not null default clock_timestamp(), selection jsonb not null, provenance jsonb not null,
 unique(user_id,request_id), foreign key(user_id,request_id) references public.generated_workout_requests(user_id,request_id) on delete cascade
);
create function public.generated_rules_valid(r jsonb, contexts jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare w jsonb; c jsonb; v jsonb;
begin
 if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(contexts) is distinct from 'array' then return false; end if;
 perform public.workout_payload_keys(r,array['weeks']);
 if jsonb_typeof(r->'weeks') is distinct from 'array' or jsonb_array_length(r->'weeks') not between 1 and 4 or jsonb_array_length(contexts) not between 1 and 100 then return false; end if;
 for c in select value from jsonb_array_elements(contexts) loop
  if not public.reviewed_context_valid(c) then return false; end if;
 end loop;
 for w in select value from jsonb_array_elements(r->'weeks') loop
  perform public.workout_payload_keys(w,array['catalogue_ids','min_sessions','max_sessions','rest_days']);
  if jsonb_typeof(w)<>'object' or (select count(*) from jsonb_object_keys(w))<>4 then return false; end if;
  for v in select w->x from unnest(array['min_sessions','max_sessions','rest_days']) x loop
   if jsonb_typeof(v) is distinct from 'number' or (v#>>'{}')::numeric <> trunc((v#>>'{}')::numeric) then return false; end if;
  end loop;
  if (w->>'min_sessions')::integer not between 1 and 7 or (w->>'max_sessions')::integer not between (w->>'min_sessions')::integer and 7 or (w->>'rest_days')::integer not between 0 and 6 then return false; end if;
  if jsonb_typeof(w->'catalogue_ids') is distinct from 'array' or jsonb_array_length(w->'catalogue_ids') not between 1 and 20 then return false; end if;
  if (select count(*)<>count(distinct x) from jsonb_array_elements(w->'catalogue_ids') x) then return false; end if;
  for v in select value from jsonb_array_elements(w->'catalogue_ids') loop
   if jsonb_typeof(v)<>'string' or (v#>>'{}') <> ((v#>>'{}')::uuid)::text then return false; end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end $$;
alter table public.generated_workout_policies add constraint generated_policy_definition check(public.generated_rules_valid(rules,eligible_contexts) and length(btrim(rule_version)) between 1 and 100 and length(btrim(source_uri)) between 1 and 2000);
alter table public.generated_workout_policies add constraint generated_policy_signoff check(status<>'approved' or coalesce(length(btrim(reviewer_name)) between 1 and 200 and length(btrim(reviewer_role)) between 1 and 200 and approved_at is not null,false));
alter table public.generated_provider_activations add constraint generated_provider_signoff check(status<>'approved' or coalesce(length(btrim(reviewer_name)) between 1 and 200 and length(btrim(reviewer_role)) between 1 and 200 and approved_at is not null,false));
create trigger immutable_generated_policy before update or delete on public.generated_workout_policies for each row execute function public.protect_reviewed_version();
create trigger immutable_generated_activation before update or delete on public.generated_provider_activations for each row execute function public.protect_reviewed_version();
create trigger generated_policy_gate before insert or update or delete on public.generated_workout_policies for each statement execute function public.serialize_foundation_write();
create trigger generated_activation_gate before insert or update or delete on public.generated_provider_activations for each statement execute function public.serialize_foundation_write();

create function public.generated_trusted_context(uid uuid, pid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; p public.generated_workout_policies; v public.reviewed_workout_versions; ids uuid[]; cat jsonb:='[]'::jsonb; revision bigint;
begin
 c:=public.read_reviewed_context(uid);
 if not public.reviewed_context_valid(c) then return null; end if;
 select * into p from public.generated_workout_policies where id=pid for share;
 if not found or p.status<>'approved' or p.approved_at>statement_timestamp() or not public.generated_rules_valid(p.rules,p.eligible_contexts) or not public.reviewed_context_matches(p.eligible_contexts,c) then return null; end if;
 select reviewed_context_revision into revision from public.profiles where user_id=uid;
 select array_agg(distinct id::uuid) into ids from jsonb_array_elements(p.rules->'weeks') w cross join lateral jsonb_array_elements_text(w->'catalogue_ids') id;
 if cardinality(ids)>20 then return null; end if;
 for v in select * from public.reviewed_workout_versions where id=any(ids) order by id for share loop
  if not public.reviewed_version_ready(v) or not public.reviewed_context_matches(v.eligible_contexts,c) then return null; end if;
  cat:=cat||jsonb_build_array(jsonb_build_object('id',v.id,'session_minutes',v.prescription->'session_minutes'));
 end loop;
 if jsonb_array_length(cat)<>cardinality(ids) then return null; end if;
 if exists(select 1 from jsonb_array_elements(p.rules->'weeks') w where (w->>'min_sessions')::integer>(c->>'training_days_per_week')::integer) then return null; end if;
 return jsonb_build_object('policy_version_id',p.id,'context_revision',revision,'max_sessions',c->'training_days_per_week','session_minutes',c->'preferred_session_minutes','rules',p.rules,'catalogue',cat);
end $$;
create function public.generated_selection_valid(s jsonb, c jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare w jsonb; r jsonb; e jsonb; n integer:=0; last_day integer; absolute_day integer; previous_rest integer:=0;
begin
 if c is null or s is null or jsonb_typeof(s)<>'object' then return false; end if;
 perform public.workout_payload_keys(s,array['policy_version_id','context_revision','weeks']);
 if (select count(*) from jsonb_object_keys(s))<>3 or s->'policy_version_id' is distinct from c->'policy_version_id' or s->'context_revision' is distinct from c->'context_revision' or jsonb_typeof(s->'weeks') is distinct from 'array' then return false; end if;
 if jsonb_array_length(s->'weeks')<>jsonb_array_length(c->'rules'->'weeks') then return false; end if;
 for w in select value from jsonb_array_elements(s->'weeks') loop
  r:=c->'rules'->'weeks'->n;
  perform public.workout_payload_keys(w,array['sessions']);
  if jsonb_typeof(w)<>'object' or jsonb_typeof(w->'sessions') is distinct from 'array' then return false; end if;
  if jsonb_array_length(w->'sessions') not between (r->>'min_sessions')::integer and least((r->>'max_sessions')::integer,(c->>'max_sessions')::integer) then return false; end if;
  for e in select value from jsonb_array_elements(w->'sessions') loop
   perform public.workout_payload_keys(e,array['day','catalogue_version_id']);
   if jsonb_typeof(e)<>'object' or (select count(*) from jsonb_object_keys(e))<>2 or jsonb_typeof(e->'day') is distinct from 'number' then return false; end if;
   if (e->>'day')::numeric not between 1 and 7 or (e->>'day')::numeric<>trunc((e->>'day')::numeric) or not ((r->'catalogue_ids') @> jsonb_build_array(e->'catalogue_version_id')) then return false; end if;
   absolute_day:=n*7+(e->>'day')::integer;
   if last_day is not null and absolute_day-last_day<=greatest(previous_rest,(r->>'rest_days')::integer) then return false; end if;
   last_day:=absolute_day; previous_rest:=(r->>'rest_days')::integer;
  end loop;
  n:=n+1;
 end loop;
 return true;
exception when others then return false;
end $$;

create function public.reserve_generated_workout(owner_id uuid, request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.generated_provider_activations; p public.generated_workout_policies; old public.generated_workout_requests; c jsonb; spent bigint; count_calls integer; last_call timestamptz; saved public.generated_workout_plans;
begin
 if owner_id is null or request_id is null then raise exception using errcode='22023',message='Identity required'; end if;
 -- Same global lock as context/catalogue writes. Includes both user and global budget decisions.
 perform pg_catalog.pg_advisory_xact_lock(1735289203,3);
 update public.generated_budget_guard set revision=revision+1 where id=true;
 select * into a from public.generated_provider_activations where status='approved' for share;
 if not found or a.approved_at>statement_timestamp() then return jsonb_build_object('state','disabled'); end if;
 select * into p from public.generated_workout_policies where status='approved' for share;
 if not found then return jsonb_build_object('state','disabled'); end if;
 c:=public.generated_trusted_context(owner_id,p.id);
 if c is null then
  if exists(select 1 from public.health_profiles where user_id=owner_id and (status='not_reviewed' or notes<>'' or restrictions @> array['medical_clearance']::text[])) then return jsonb_build_object('state','referral_required'); end if;
  return jsonb_build_object('state','unsupported');
 end if;
 select * into old from public.generated_workout_requests q where q.user_id=owner_id and q.request_id=reserve_generated_workout.request_id for update;
 if found then
  if old.context is distinct from c or old.activation_id<>a.id then return jsonb_build_object('state','failed'); end if;
  if old.state='complete' then
   select * into saved from public.generated_workout_plans x where x.user_id=owner_id and x.request_id=reserve_generated_workout.request_id;
   return jsonb_build_object('state','complete','plan',to_jsonb(saved)-'user_id');
  end if;
  return jsonb_build_object('state',case when old.state='reserved' and old.created_at>clock_timestamp()-interval '30 seconds' then 'in_progress' else 'failed' end);
 end if;
 select coalesce(sum(reserved_microusd),0) into spent from public.generated_workout_requests where created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
 select count(*),max(created_at) into count_calls,last_call from public.generated_workout_requests where user_id=owner_id and created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
 -- Rate interval is across UTC day rollover too.
 select max(created_at) into last_call from public.generated_workout_requests where user_id=owner_id;
 if spent+a.reserve_microusd>a.daily_budget_microusd or count_calls>=a.user_daily_calls or last_call>clock_timestamp()-make_interval(secs=>a.min_interval_seconds) then return jsonb_build_object('state','budget_exhausted'); end if;
 insert into public.generated_workout_requests(user_id,request_id,policy_version_id,activation_id,context_revision,context,reserved_microusd) values(owner_id,request_id,p.id,a.id,(c->>'context_revision')::bigint,c,a.reserve_microusd);
 return jsonb_build_object('state','reserved','context',c);
end $$;
create function public.finish_generated_workout(owner_id uuid, request_id uuid, selection jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.generated_workout_requests; c jsonb; v public.reviewed_workout_versions; p public.generated_workout_policies; a public.generated_provider_activations; saved public.generated_workout_plans; snapshots jsonb:='[]'::jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(1735289203,3);
 select * into q from public.generated_workout_requests x where x.user_id=owner_id and x.request_id=finish_generated_workout.request_id for update;
 if not found or q.state<>'reserved' or q.created_at<clock_timestamp()-interval '30 seconds' then raise exception using errcode='55000',message='Reservation unavailable'; end if;
 select * into a from public.generated_provider_activations where id=q.activation_id for share;
 if a.status<>'approved' or a.approved_at>statement_timestamp() then raise exception using errcode='55000',message='Provider approval unavailable'; end if;
 c:=public.generated_trusted_context(owner_id,q.policy_version_id);
 if c is null or c is distinct from q.context or not public.generated_selection_valid(selection,c) then raise exception using errcode='55000',message='Current approval/context/selection refused'; end if;
 select * into p from public.generated_workout_policies where id=q.policy_version_id;
 for v in select * from public.reviewed_workout_versions where id in (select distinct (e->>'catalogue_version_id')::uuid from jsonb_array_elements(selection->'weeks') w cross join lateral jsonb_array_elements(w->'sessions') e) order by id loop
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('catalogue_version_id',v.id,'content_id',v.content_id,'content_version',v.content_version,'rule_version',v.rule_version,'reviewer_name',v.reviewer_name,'reviewer_role',v.reviewer_role,'approved_at',v.approved_at,'source_uri',v.source_uri,'prescription',v.prescription));
 end loop;
 insert into public.generated_workout_plans(user_id,request_id,policy_version_id,selection,provenance) values(owner_id,request_id,p.id,selection,jsonb_build_object('source','validated_generated','contract_version',1,'context_revision',q.context_revision,'policy_version_id',p.id,'rule_version',p.rule_version,'reviewer_name',p.reviewer_name,'reviewer_role',p.reviewer_role,'approved_at',p.approved_at,'source_uri',p.source_uri,'rules',p.rules,'catalogue',snapshots,'activation_id',a.id,'model',a.model,'reserved_microusd',q.reserved_microusd)) returning * into saved;
 update public.generated_workout_requests x set state='complete' where x.user_id=owner_id and x.request_id=finish_generated_workout.request_id;
 return to_jsonb(saved)-'user_id';
end $$;
create function public.fail_generated_workout(owner_id uuid, request_id uuid) returns void
language sql security definer set search_path='' as $$
 update public.generated_workout_requests x set state='failed' where x.user_id=owner_id and x.request_id=fail_generated_workout.request_id and state='reserved'
$$;

alter table public.generated_budget_guard enable row level security;
revoke all on public.generated_budget_guard from public,anon,authenticated,service_role;
alter table public.generated_workout_policies enable row level security;
alter table public.generated_provider_activations enable row level security;
alter table public.generated_workout_requests enable row level security;
alter table public.generated_workout_plans enable row level security;
revoke all on public.generated_workout_policies, public.generated_provider_activations, public.generated_workout_requests, public.generated_workout_plans from public,anon,authenticated,service_role;
grant select on public.generated_workout_plans to authenticated;
create policy generated_plan_owner_read on public.generated_workout_plans for select to authenticated using(user_id=auth.uid());
revoke all on function public.generated_rules_valid(jsonb,jsonb),public.generated_trusted_context(uuid,uuid),public.generated_selection_valid(jsonb,jsonb),public.reserve_generated_workout(uuid,uuid),public.finish_generated_workout(uuid,uuid,jsonb),public.fail_generated_workout(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_generated_workout(uuid,uuid),public.finish_generated_workout(uuid,uuid,jsonb),public.fail_generated_workout(uuid,uuid) to service_role;
