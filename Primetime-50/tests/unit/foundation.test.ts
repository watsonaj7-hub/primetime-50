import { describe, expect, it } from "vitest";
import { profileSchema, workoutInputSchema } from "@/lib/validation/profile";
import { safeNext } from "@/lib/auth/redirect";
import { buildProgramInput, exerciseEligible } from "@/lib/services/program-input";
import { starterExercises } from "@/lib/exercises";
import { validProfile } from "../fixture";

describe("foundation input validation", () => {
  it("accepts a valid complete profile without inventing optional values", () => expect(profileSchema.parse(validProfile).waist_cm).toBeNull());
  it.each([{ user_id: "forged" }, { role: "admin" }, { weight_kg: -2 }, { height_cm: Infinity }, { preferred_session_minutes: 0 }, { training_days_per_week: 3.5 }, { primary_goal: "magic" }, { date_of_birth: "2020-01-01" }, { date_of_birth: "1965-02-30" }, { equipment: ["unknown"] }, { equipment: ["dumbbells", "dumbbells"] }, { secondary_goal: "strength" }])("rejects unsafe profile edits %j", change => expect(profileSchema.safeParse({ ...validProfile, ...change }).success).toBe(false));
  it("does not allow limitations hidden as none reported", () => expect(profileSchema.safeParse({ ...validProfile, health_restrictions: ["knee_pain"] }).success).toBe(false));
  it.each([{ sets: 0 }, { sets: 21 }, { reps: 101 }, { weight_kg: -1 }, { rpe: 0 }, { rpe: 11 }, { weight_kg: NaN }])("rejects invalid workout values %j", change => expect(workoutInputSchema.safeParse({ sets: 3, reps: 8, weight_kg: 10, rpe: 6, ...change }).success).toBe(false));
});
describe("program input contract", () => {
  const floorPress = starterExercises.find(x => x.name === "Dumbbell Floor Press")!;
  const landmine = starterExercises.find(x => x.name === "Landmine Press")!;
  it("updates goals and caps prescribed training frequency", () => {
    expect(buildProgramInput(validProfile).maxSessionsPerWeek).toBe(3);
    expect(buildProgramInput({ ...validProfile, primary_goal: "fat_loss" }).primaryGoal).toBe("fat_loss");
  });
  it("excludes equipment incompatible with a dumbbell-only profile", () => {
    expect(exerciseEligible(floorPress, validProfile)).toBe(true);
    expect(exerciseEligible(landmine, validProfile)).toBe(false);
  });
  it("excludes known shoulder contraindications", () => expect(exerciseEligible(floorPress, { ...validProfile, health_status: "limitations_reported", health_restrictions: ["shoulder_pain"] })).toBe(false));
  it("requires review for unknown health, medical clearance or free-text limitations", () => {
    for (const change of [{ health_status: "not_reviewed" as const }, { health_restrictions: ["medical_clearance" as const] }, { health_notes: "Unmapped condition" }]) expect(exerciseEligible(floorPress, { ...validProfile, ...change })).toBe(false);
  });
});
describe("callback redirects", () => {
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/settings?next=https://evil.example", "/auth/callback", null])("rejects unsafe destination %s", path => expect(safeNext(path)).toBe("/onboarding"));
  it("allows known destinations", () => expect(safeNext("/settings")).toBe("/settings"));
});
