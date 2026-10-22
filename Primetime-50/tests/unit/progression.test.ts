import { beforeEach, expect, it, vi } from "vitest";
const b = vi.hoisted(() => ({ records: vi.fn(), availability: vi.fn() }));
vi.mock("@/lib/services/workout", () => ({ readWorkouts: b.records, readReviewedAvailability: b.availability }));
import { readProgressionStatus } from "@/lib/services/progression";
import { testRecord } from "./workout-fixture";
beforeEach(() => { vi.resetAllMocks(); b.records.mockResolvedValue([]); b.availability.mockResolvedValue({ state: "available", workouts: [{catalogue_version_id:testRecord().catalogue_version_id}] }); });
it("distinguishes no records and missing approved rules without inventing adaptation", async () => {
  const s = await readProgressionStatus(); expect(b.records).toHaveBeenCalledWith(null,true);
  expect(s.evidence_state).toBe("none"); expect(s.missing_prerequisites).toContain("completed_records");
  expect(s.missing_prerequisites).toContain("approved_progression_rules"); expect(s.missing_prerequisites).toContain("approved_recovery_rules"); expect(s.adaptation).toBe("unavailable");
});
it("returns references to actual owned completed evidence only, never numerical advice", async () => {
  const r = testRecord(); r.completed = true; r.completed_at = "2026-10-22T01:00:00Z"; r.exercise_set_logs.forEach(s => { s.reps=8;s.weight=10;s.rpe=6; }); b.records.mockResolvedValue([r]);
  const s = await readProgressionStatus(); expect(s.evidence_state).toBe("available"); expect(s.evidence).toEqual([{ id:r.id, performed_at:r.performed_at, catalogue_version_id:r.catalogue_version_id }]);
  expect(s.missing_prerequisites).not.toContain("completed_records"); expect(s.adaptation).toBe("unavailable");
});
it.each(["unsupported", "referral_required", "unavailable"])("keeps %s screening unresolved", async state => {
  b.availability.mockResolvedValue({ state, workouts: [] }); const s = await readProgressionStatus(); expect(s.screening_state).toBe(state); expect(s.missing_prerequisites).toContain("screening_review");
});
it("distinguishes storage failure/malformed records from an empty history and unavailable screening", async () => {
  b.records.mockRejectedValue(new Error("TEST private")); b.availability.mockRejectedValue(new Error("TEST private"));
  let s = await readProgressionStatus(); expect(s.evidence_state).toBe("unavailable"); expect(s.screening_state).toBe("unconfirmed"); expect(JSON.stringify(s)).not.toContain("TEST private");
  b.records.mockResolvedValue([{ completed:true }]); s = await readProgressionStatus(); expect(s.evidence_state).toBe("unavailable");
});
it("does not resolve screening from a malformed availability payload",async()=>{
 b.availability.mockResolvedValue({state:"available",workouts:[]});
 expect((await readProgressionStatus()).screening_state).toBe("unconfirmed");
});
