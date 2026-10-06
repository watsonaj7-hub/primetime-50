import { type FoundationProfile } from "@/lib/validation/profile";
export const validProfile: FoundationProfile = {
  display_name: "Test member", date_of_birth: "1965-04-12", sex: "not_specified", unit_system: "metric",
  height_cm: 175, weight_kg: 82, waist_cm: null, fitness_level: "beginner", primary_goal: "strength", secondary_goal: "mobility",
  training_days_per_week: 3, preferred_session_minutes: 45, training_location: "home", health_status: "none_reported", health_restrictions: [], health_notes: "", equipment: ["dumbbells", "bodyweight"]
};
