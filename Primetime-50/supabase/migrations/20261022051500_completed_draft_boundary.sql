-- Additive only: do not delete existing drafts or rewrite prior migrations.
-- Acquire one transaction gate BEFORE row locks on either table. A row-only
-- draft guard would invert profile->draft (completion) into draft->profile
-- (direct UPDATE/upsert). A single gate also covers privileged multi-user writes
-- without trusting auth.uid() to describe every row in the statement.
-- Tradeoff: profile/draft mutations serialize across users until transaction end.
create function public.serialize_foundation_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(1735289203, 3);
  return null;
end $$;
revoke all on function public.serialize_foundation_write() from public;

create trigger foundation_write_gate before insert or update or delete on public.profiles
for each statement execute function public.serialize_foundation_write();
create trigger foundation_write_gate before insert or update or delete on public.onboarding_drafts
for each statement execute function public.serialize_foundation_write();

create function public.reject_completed_draft()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare completed_at timestamptz;
begin
  -- The gate is already held. Lock/re-read the parent rather than trusting a
  -- stale snapshot: REPEATABLE READ/SERIALIZABLE must fail with 40001 if another
  -- transaction completed this profile since the writer's snapshot.
  select onboarding_completed_at into completed_at
    from public.profiles where user_id = new.user_id for update;
  if not found then
    raise exception 'An accessible profile is required' using errcode = '42501';
  end if;
  if completed_at is not null then
    raise exception 'Onboarding is already complete' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function public.reject_completed_draft() from public;
create trigger reject_completed_draft before insert or update on public.onboarding_drafts
for each row execute function public.reject_completed_draft();

-- Keep completion monotonic even for direct column writes. Completed profile
-- edits still use the existing RPC and retain their original completion time.
create function public.keep_onboarding_completed()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.onboarding_completed_at is not null and new.onboarding_completed_at is null then
    raise exception 'Onboarding is already complete' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function public.keep_onboarding_completed() from public;
create trigger keep_onboarding_completed before update on public.profiles
for each row execute function public.keep_onboarding_completed();
