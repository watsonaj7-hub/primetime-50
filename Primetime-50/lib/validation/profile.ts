import { z } from "zod";

export const goals = ["fat_loss", "muscle_gain", "strength", "mobility", "general_fitness"] as const;
export const equipmentTypes = ["bodyweight", "chair", "wall", "mat", "dumbbells", "barbell", "bench", "resistance_bands", "cable_machine", "machines", "kettlebell", "treadmill", "bike", "pool", "step", "rail", "box", "sled"] as const;
export const restrictions = ["knee_pain", "shoulder_pain", "back_pain", "balance_risk", "wrist_pain", "hip_pain", "achilles_pain", "grip_injury", "abdominal_strain", "pain_lying_flat", "medical_clearance"] as const;

const optionalText = z.string().trim().max(2000);
const birthDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.").refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 18);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "1900-01-01" && date <= cutoff;
}, "Enter a valid birth date for an adult aged 18 or older.");

export const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Enter your name.").max(100),
  date_of_birth: birthDate,
  sex: z.enum(["female", "male", "not_specified"]),
  unit_system: z.enum(["metric", "imperial"]),
  height_cm: z.number().finite().min(100).max(250),
  weight_kg: z.number().finite().min(25).max(350),
  waist_cm: z.number().finite().min(30).max(250).nullable(),
  fitness_level: z.enum(["beginner", "returning", "consistent"]),
  primary_goal: z.enum(goals),
  secondary_goal: z.enum(goals).nullable(),
  training_days_per_week: z.number().int().min(1).max(7),
  preferred_session_minutes: z.number().int().min(10).max(120),
  training_location: z.enum(["home", "gym", "both"]),
  health_status: z.enum(["none_reported", "limitations_reported", "not_reviewed"]),
  health_restrictions: z.array(z.enum(restrictions)).max(restrictions.length).refine(v => new Set(v).size === v.length, "Remove duplicate restrictions."),
  health_notes: optionalText,
  equipment: z.array(z.enum(equipmentTypes)).min(1, "Select available equipment, including bodyweight if appropriate.").max(equipmentTypes.length).refine(v => new Set(v).size === v.length, "Remove duplicate equipment."),
}).strict().superRefine((data, ctx) => {
  if (data.secondary_goal === data.primary_goal) ctx.addIssue({ code: "custom", path: ["secondary_goal"], message: "Choose a different secondary goal." });
  if (data.health_status === "none_reported" && (data.health_restrictions.length || data.health_notes)) ctx.addIssue({ code: "custom", path: ["health_status"], message: "Choose limitations reported when entering restrictions or health notes." });
  if (data.health_status === "limitations_reported" && !data.health_restrictions.length && !data.health_notes) ctx.addIssue({ code: "custom", path: ["health_restrictions"], message: "Add a restriction or describe your limitations." });
});

export type FoundationProfile = z.infer<typeof profileSchema>;
export type SavedProfile = FoundationProfile & { updated_at: string; onboarding_completed_at: string | null };
export const workoutInputSchema = z.object({
  sets: z.number().int().min(1).max(20),
  reps: z.number().int().min(0).max(100),
  weight_kg: z.number().finite().min(0),
  rpe: z.number().finite().min(1).max(10)
}).strict();
