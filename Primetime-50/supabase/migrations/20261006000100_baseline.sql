create extension if not exists "pgcrypto";

create type user_role as enum ('user', 'admin');
create type subscription_tier as enum ('free', 'pro', 'premium');
create type subscription_status as enum ('active', 'trialing', 'past_due', 'canceled', 'incomplete');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role user_role not null default 'user',
  display_name text,
  date_of_birth date,
  sex text,
  unit_system text not null default 'imperial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.onboarding_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  age int,
  sex text,
  height_cm numeric,
  weight_kg numeric,
  waist_cm numeric,
  fitness_level text,
  training_experience text,
  injury_history text,
  medical_considerations text,
  mobility_limitations text,
  available_equipment text[],
  training_location text,
  weekly_training_days int,
  fat_loss_goal text,
  muscle_gain_goal text,
  nutrition_preferences text[],
  sleep_level int,
  stress_level int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  tier subscription_tier not null default 'free',
  status subscription_status,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  exercise_name text not null,
  category text not null,
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  equipment text[] not null default '{}',
  difficulty text not null,
  joint_impact_level text not null,
  contraindications text,
  setup_instructions text,
  execution_cues text,
  common_mistakes text,
  regression text,
  progression text,
  video_url text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_name text not null,
  duration_weeks int not null,
  goal text not null,
  plan_json jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references public.workout_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_date date,
  day_name text,
  workout_type text not null,
  focus text,
  estimated_duration_minutes int,
  warmup jsonb not null default '[]',
  cooldown jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  exercise_id uuid references public.exercises(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  position int not null,
  sets int,
  reps text,
  target_rpe numeric,
  rest_seconds int,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_day_id uuid references public.workout_days(id) on delete set null,
  performed_at timestamptz not null default now(),
  duration_minutes int,
  perceived_effort numeric,
  pain_notes text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercise_set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs(id) on delete cascade,
  workout_exercise_id uuid references public.workout_exercises(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  set_number int not null,
  reps int,
  weight numeric,
  rpe numeric,
  rest_seconds int,
  created_at timestamptz not null default now()
);

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calories int not null,
  protein_g int not null,
  carbs_g int,
  fat_g int,
  water_ml int,
  preference text,
  starts_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  calories int not null,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_item_id uuid references public.food_items(id) on delete set null,
  meal_name text not null,
  logged_on date not null default current_date,
  calories int,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null default current_date,
  weight_kg numeric,
  waist_cm numeric,
  body_fat_percent numeric,
  lean_mass_kg numeric,
  step_count int,
  sleep_minutes int,
  recovery_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  workout_completed boolean not null default false,
  steps_completed boolean not null default false,
  protein_target_hit boolean not null default false,
  water_target_hit boolean not null default false,
  mobility_completed boolean not null default false,
  sleep_target_hit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

create table public.progress_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  summary text not null,
  metrics jsonb not null default '{}',
  ai_recommendations jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.ai_coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  structured_json jsonb,
  created_at timestamptz not null default now()
);

create table public.safety_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  severity text not null,
  description text not null,
  reviewed boolean not null default false,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_user_id_idx on public.profiles(user_id);
create index onboarding_user_id_idx on public.onboarding_responses(user_id);
create index subscriptions_user_id_idx on public.subscriptions(user_id);
create index workout_plans_user_id_idx on public.workout_plans(user_id);
create index workout_days_user_date_idx on public.workout_days(user_id, scheduled_date);
create index workout_logs_user_date_idx on public.workout_logs(user_id, performed_at);
create index meal_logs_user_date_idx on public.meal_logs(user_id, logged_on);
create index body_metrics_user_date_idx on public.body_metrics(user_id, measured_on);
create index habit_logs_user_date_idx on public.habit_logs(user_id, logged_on);
create index progress_reports_user_week_idx on public.progress_reports(user_id, week_start);
create index ai_messages_user_date_idx on public.ai_coach_messages(user_id, created_at);
create index safety_flags_user_reviewed_idx on public.safety_flags(user_id, reviewed);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger onboarding_updated_at before update on public.onboarding_responses for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger exercises_updated_at before update on public.exercises for each row execute function public.set_updated_at();
create trigger workout_plans_updated_at before update on public.workout_plans for each row execute function public.set_updated_at();
create trigger workout_days_updated_at before update on public.workout_days for each row execute function public.set_updated_at();
create trigger workout_exercises_updated_at before update on public.workout_exercises for each row execute function public.set_updated_at();
create trigger workout_logs_updated_at before update on public.workout_logs for each row execute function public.set_updated_at();
create trigger nutrition_targets_updated_at before update on public.nutrition_targets for each row execute function public.set_updated_at();
create trigger meal_logs_updated_at before update on public.meal_logs for each row execute function public.set_updated_at();
create trigger body_metrics_updated_at before update on public.body_metrics for each row execute function public.set_updated_at();
create trigger habit_logs_updated_at before update on public.habit_logs for each row execute function public.set_updated_at();
create trigger safety_flags_updated_at before update on public.safety_flags for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.onboarding_responses enable row level security;
alter table public.subscriptions enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_days enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_logs enable row level security;
alter table public.exercise_set_logs enable row level security;
alter table public.nutrition_targets enable row level security;
alter table public.meal_logs enable row level security;
alter table public.food_items enable row level security;
alter table public.body_metrics enable row level security;
alter table public.habit_logs enable row level security;
alter table public.progress_reports enable row level security;
alter table public.ai_coach_messages enable row level security;
alter table public.safety_flags enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create policy "Users read own profiles" on public.profiles for select using (user_id = auth.uid() or public.is_admin());
create policy "Users update own profiles" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users insert own profiles" on public.profiles for insert with check (user_id = auth.uid());

create policy "Anyone can read exercises" on public.exercises for select using (true);
create policy "Admins manage exercises" on public.exercises for all using (public.is_admin()) with check (public.is_admin());
create policy "Anyone can read foods" on public.food_items for select using (true);
create policy "Admins manage foods" on public.food_items for all using (public.is_admin()) with check (public.is_admin());

create policy "Users manage own onboarding" on public.onboarding_responses for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy "Users read own subscriptions" on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
create policy "Admins manage subscriptions" on public.subscriptions for all using (public.is_admin()) with check (public.is_admin());
create policy "Users manage own workout plans" on public.workout_plans for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy "Users manage own workout days" on public.workout_days for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy "Users manage own workout exercises" on public.workout_exercises for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy "Users manage own workout logs" on public.workout_logs for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy "Users manage own set logs" on public.exercise_set_logs for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy "Users manage own nutrition targets" on public.nutrition_targets for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy "Users manage own meal logs" on public.meal_logs for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy "Users manage own body metrics" on public.body_metrics for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy "Users manage own habit logs" on public.habit_logs for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy "Users read own progress reports" on public.progress_reports for select using (user_id = auth.uid() or public.is_admin());
create policy "Users manage own AI messages" on public.ai_coach_messages for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy "Users create own safety flags" on public.safety_flags for insert with check (user_id = auth.uid());
create policy "Users read own safety flags" on public.safety_flags for select using (user_id = auth.uid() or public.is_admin());
create policy "Admins update safety flags" on public.safety_flags for update using (public.is_admin()) with check (public.is_admin());
