import { z } from "zod";
import { equipmentTypes, restrictions } from "@/lib/validation/profile";
const text = z.string().max(100);
export const draftSchema = z.object({
  step: z.number().int().min(0).max(3),
  values: z.object({
    display_name: text, date_of_birth: text, sex: text, unit_system: text,
    height_cm: text, weight_kg: text, waist_cm: text, fitness_level: text,
    primary_goal: text, secondary_goal: text, training_days_per_week: text,
    preferred_session_minutes: text, training_location: text,
    health_status: text, health_notes: z.string().max(2000)
  }).strict(),
  equipment: z.array(z.enum(equipmentTypes)).max(equipmentTypes.length),
  healthRestrictions: z.array(z.enum(restrictions)).max(restrictions.length)
}).strict();
export type OnboardingDraft = z.infer<typeof draftSchema>;
