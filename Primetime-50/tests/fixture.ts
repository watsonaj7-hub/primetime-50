import { type FoundationProfile } from "@/lib/validation/profile";
import { type OnboardingDraft } from "@/lib/validation/draft";
export const validProfile: FoundationProfile = {
  display_name: "Test member", date_of_birth: "1965-04-12", sex: "not_specified", unit_system: "metric",
  height_cm: 175, weight_kg: 82, waist_cm: null, fitness_level: "beginner", primary_goal: "strength", secondary_goal: "mobility",
  training_days_per_week: 3, preferred_session_minutes: 45, training_location: "home", health_status: "none_reported", health_restrictions: [], health_notes: "", equipment: ["dumbbells", "bodyweight"]
};
export const partialDraft: OnboardingDraft = {
  step: 1,
  values: {
    display_name: "Unfinished member", date_of_birth: "", sex: "not_specified", unit_system: "imperial",
    height_cm: "", weight_kg: "", waist_cm: "", fitness_level: "", primary_goal: "", secondary_goal: "",
    training_days_per_week: "", preferred_session_minutes: "", training_location: "",
    health_status: "not_reviewed", health_notes: ""
  },
  equipment: ["dumbbells"], healthRestrictions: []
};
