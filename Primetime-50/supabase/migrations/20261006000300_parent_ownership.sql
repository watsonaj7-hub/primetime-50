-- Composite foreign keys prevent a user linking their row to another user's parent.
-- Existing inconsistent data causes migration failure and must be reviewed, never silently deleted.
alter table public.workout_plans add constraint plan_owner_id unique (user_id,id);
alter table public.workout_days add constraint day_owner_id unique (user_id,id);
alter table public.workout_exercises add constraint exercise_owner_id unique (user_id,id);
alter table public.workout_logs add constraint log_owner_id unique (user_id,id);
alter table public.workout_days add constraint day_plan_owner foreign key (user_id,workout_plan_id) references public.workout_plans(user_id,id) on delete cascade;
alter table public.workout_exercises add constraint exercise_day_owner foreign key (user_id,workout_day_id) references public.workout_days(user_id,id) on delete cascade;
alter table public.workout_logs add constraint log_day_owner foreign key (user_id,workout_day_id) references public.workout_days(user_id,id) on delete set null (workout_day_id);
alter table public.exercise_set_logs add constraint set_log_owner foreign key (user_id,workout_log_id) references public.workout_logs(user_id,id) on delete cascade;
alter table public.exercise_set_logs add constraint set_exercise_owner foreign key (user_id,workout_exercise_id) references public.workout_exercises(user_id,id) on delete set null (workout_exercise_id);
alter table public.workout_exercises add constraint prescribed_sets_range check (sets is null or sets between 1 and 20);
alter table public.exercise_set_logs add constraint set_number_range check (set_number between 1 and 20), add constraint set_reps_range check (reps is null or reps between 0 and 100), add constraint set_weight_range check (weight is null or (weight >= 0 and weight <> 'NaN'::numeric and weight <> 'Infinity'::numeric)), add constraint set_rpe_range check (rpe is null or rpe between 1 and 10);
