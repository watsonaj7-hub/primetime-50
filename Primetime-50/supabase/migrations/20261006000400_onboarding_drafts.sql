create table public.onboarding_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  draft_json jsonb not null check (jsonb_typeof(draft_json) = 'object' and octet_length(draft_json::text) <= 16384),
  updated_at timestamptz not null default now()
);
alter table public.onboarding_drafts enable row level security;
revoke all on public.onboarding_drafts from anon, authenticated;
grant select,insert,update,delete on public.onboarding_drafts to authenticated;
create policy owner_draft on public.onboarding_drafts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger draft_updated_at before update on public.onboarding_drafts for each row execute function public.set_updated_at();

create function public.clear_completed_draft()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.onboarding_drafts where user_id = new.user_id;
  return new;
end $$;
revoke all on function public.clear_completed_draft() from public;
create trigger clear_profile_draft after insert or update on public.profiles for each row when (new.onboarding_completed_at is not null) execute function public.clear_completed_draft();
