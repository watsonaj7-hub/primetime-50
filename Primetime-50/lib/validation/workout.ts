import { z } from "zod";
export const workoutId = z.string().uuid();
const revision = z.number().int().min(0).max(2147483646);
const timezone = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Choose a recognised timezone.");
export const startWorkoutSchema = z.object({ id: workoutId, mode: z.enum(["personal", "reviewed"]), timezone, catalogue_version_id: workoutId.optional() }).strict().refine(value => value.mode === "reviewed" || value.catalogue_version_id === undefined, { message: "Personal records cannot reference a reviewed catalogue." });
export const recordedSetSchema = z.object({
  id: workoutId, exercise_key: workoutId, exercise_name: z.string().trim().min(1).max(200),
  set_number: z.number().int().min(1).max(20),
  reps: z.number().int().min(0).max(100).nullable(),
  weight: z.number().finite().min(0).max(10000).nullable(), // Always kg; not the profile display unit.
  rpe: z.number().finite().min(1).max(10).nullable()
}).strict();
export const saveWorkoutSchema = z.object({ id: workoutId, expected_revision: revision, sets: z.array(recordedSetSchema).min(1).max(100) }).strict().superRefine(({ sets }, ctx) => {
  if (new Set(sets.map(s => s.id)).size !== sets.length || new Set(sets.map(s => `${s.exercise_key}:${s.set_number}`)).size !== sets.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sets"], message: "Each set needs a distinct ID and exercise/set slot." });
});
export const completeWorkoutSchema = z.object({ id: workoutId, expected_revision: revision }).strict();
