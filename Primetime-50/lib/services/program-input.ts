import { type FoundationProfile } from "@/lib/validation/profile";
import { type Exercise } from "@/lib/exercises";

const equipmentAliases: Record<string, FoundationProfile["equipment"][number]> = {
  none: "bodyweight", dumbbell: "dumbbells", dumbbells: "dumbbells", band: "resistance_bands", "mini band": "resistance_bands", "resistance band": "resistance_bands", cable: "cable_machine", machine: "machines", chair: "chair", wall: "wall", mat: "mat", bench: "bench", barbell: "barbell", treadmill: "treadmill", bike: "bike", pool: "pool", step: "step", rail: "rail", box: "box", sled: "sled"
};
const limitationPatterns: Record<FoundationProfile["health_restrictions"][number], RegExp> = {
  knee_pain: /knee/i, shoulder_pain: /shoulder/i, back_pain: /back|spine|twist/i,
  balance_risk: /balance|fall|pool/i, wrist_pain: /wrist/i, hip_pain: /hip/i,
  achilles_pain: /achilles|calf/i, grip_injury: /grip/i, abdominal_strain: /abdominal/i,
  pain_lying_flat: /lying flat|lying down/i, medical_clearance: /./
};

// Conservative catalog eligibility contract, not a medical assessment or program generator.
export function exerciseEligible(exercise: Exercise, profile: FoundationProfile) {
  if (profile.health_status === "not_reviewed" || profile.health_restrictions.includes("medical_clearance")) return false;
  // Unstructured notes need review; never silently treat them as cleared restrictions.
  if (profile.health_notes) return false;
  const equipment = equipmentAliases[exercise.equipment];
  if (!equipment || !profile.equipment.includes(equipment)) return false;
  return !profile.health_restrictions.some(restriction => limitationPatterns[restriction].test(exercise.contraindications));
}

export function buildProgramInput(profile: FoundationProfile) {
  return {
    primaryGoal: profile.primary_goal, secondaryGoal: profile.secondary_goal,
    fitnessLevel: profile.fitness_level, dateOfBirth: profile.date_of_birth,
    equipment: [...profile.equipment], restrictions: [...profile.health_restrictions],
    healthReviewed: profile.health_status !== "not_reviewed" && !profile.health_notes && !profile.health_restrictions.includes("medical_clearance"),
    maxSessionsPerWeek: profile.training_days_per_week,
    sessionMinutes: profile.preferred_session_minutes
  };
}
