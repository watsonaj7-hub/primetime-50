import { expect, it } from "vitest";
import { draftSchema } from "@/lib/validation/draft";
const draft = {
  step: 1, values: { display_name: "Draft name", date_of_birth: "", sex: "not_specified", unit_system: "metric", height_cm: "", weight_kg: "", waist_cm: "", fitness_level: "", primary_goal: "", secondary_goal: "", training_days_per_week: "", preferred_session_minutes: "", training_location: "", health_status: "not_reviewed", health_notes: "" }, equipment: [], healthRestrictions: []
};
it("allows incomplete draft input while final profile remains strictly validated", () => expect(draftSchema.parse(draft).values.height_cm).toBe(""));
it.each([{ user_id: "forged" }, { step: 8 }, { equipment: ["invalid"] }, { values: { ...draft.values, health_notes: "x".repeat(2001) } }])("rejects unsafe draft payload %j", change => expect(draftSchema.safeParse({ ...draft, ...change }).success).toBe(false));
