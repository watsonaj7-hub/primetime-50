import "server-only";
import { requireUser } from "@/lib/auth/require-user";
import { profileSchema, type SavedProfile } from "@/lib/validation/profile";
import { AppError } from "@/lib/http/errors";

const fields = "display_name,date_of_birth,sex,unit_system,height_cm,weight_kg,waist_cm,fitness_level,primary_goal,secondary_goal,training_days_per_week,preferred_session_minutes,training_location,updated_at,onboarding_completed_at";

export async function readProfile(): Promise<SavedProfile | null> {
  const { supabase, user } = await requireUser();
  const [profile, health, equipment] = await Promise.all([
    supabase.from("profiles").select(fields).eq("user_id", user.id).maybeSingle(),
    supabase.from("health_profiles").select("status,restrictions,notes").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_equipment").select("equipment_type").eq("user_id", user.id)
  ]);
  if (profile.error || health.error || equipment.error) throw new AppError(503, "Your profile could not be loaded. Please try again.");
  if (!profile.data?.onboarding_completed_at) return null;
  const parsed = profileSchema.safeParse({
    ...Object.fromEntries(Object.entries(profile.data).filter(([key]) => !["updated_at", "onboarding_completed_at"].includes(key))),
    health_status: health.data?.status ?? "not_reviewed",
    health_restrictions: health.data?.restrictions ?? [],
    health_notes: health.data?.notes ?? "",
    equipment: equipment.data?.map(row => row.equipment_type) ?? []
  });
  if (!parsed.success) throw new AppError(503, "Your profile needs review. Please contact the site owner.");
  return { ...parsed.data, updated_at: profile.data.updated_at, onboarding_completed_at: profile.data.onboarding_completed_at };
}

export async function saveProfile(input: unknown) {
  // Authenticate before parsing or exposing details; the RPC derives ownership from auth.uid().
  const { supabase } = await requireUser();
  const profile = profileSchema.parse(input);
  const { error } = await supabase.rpc("save_foundation_profile", { payload: profile });
  if (error) throw new AppError(503, "Your changes were not saved. Please try again.");
  return profile;
}
