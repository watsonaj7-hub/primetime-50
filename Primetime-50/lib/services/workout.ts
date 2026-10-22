import "server-only";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/errors";
import { completeWorkoutSchema, saveWorkoutSchema, startWorkoutSchema, workoutId } from "@/lib/validation/workout";
import type { Json } from "@/lib/types";

function storageError(error: { code?: string }) {
  if (error.code === "P0002") return new AppError(404, "Workout not found.");
  if (["40001", "23505", "55000"].includes(error.code ?? "")) return new AppError(409, "Reload the saved workout before continuing. It may have changed or still have incomplete sets.");
  if (["22023", "22P02", "23514", "22003"].includes(error.code ?? "")) return new AppError(422, "Please check your workout entries.");
  return new AppError(503, "Your workout request could not be confirmed. Keep your entries and retry or reload the saved record.");
}
export async function startWorkout(input: unknown) {
  const { supabase } = await requireUser();
  const payload = startWorkoutSchema.parse(input);
  // #5 must supply a trusted, versioned reviewed-content resolver before enabling this seam.
  if (payload.mode === "reviewed") throw new AppError(409, "A reviewed workout is not available. No prescription has been created.");
  const { data, error } = await supabase.rpc("start_workout_record", { payload });
  if (error) throw storageError(error);
  return data;
}
export async function saveWorkout(input: unknown) {
  const { supabase } = await requireUser();
  const payload = saveWorkoutSchema.parse(input);
  const { data, error } = await supabase.rpc("save_workout_record", { payload });
  if (error) throw storageError(error);
  return data;
}
export async function completeWorkout(input: unknown) {
  const { supabase } = await requireUser();
  const payload = completeWorkoutSchema.parse(input);
  const { data, error } = await supabase.rpc("complete_workout_record", { payload });
  if (error) throw storageError(error);
  return data;
}
export async function readWorkouts(id?: string | null) {
  const { supabase, user } = await requireUser();
  // Nested sets use existing same-owner FK/RLS. The explicit owner filter is defence in depth.
  let query = supabase.from("workout_logs").select("id,performed_at,completed,completed_at,record_mode,record_timezone,prescription_snapshot,revision,exercise_set_logs!set_log_owner(id,exercise_key,exercise_name,set_number,reps,weight,rpe)")
    .eq("user_id", user.id).eq("record_mode", "personal");
  if (id != null) query = query.eq("id", workoutId.parse(id));
  const { data, error } = await query.order("performed_at", { ascending: false }).order("id", { ascending: false }).limit(100);
  if (error) throw storageError(error);
  // Explicit deterministic set ordering; FK join order is unspecified.
  return (data ?? []).map(row => ({ ...row, exercise_set_logs: [...row.exercise_set_logs].sort((a, b) => (a.exercise_key ?? "").localeCompare(b.exercise_key ?? "") || a.set_number - b.set_number || a.id.localeCompare(b.id)) })) as Json;
}
