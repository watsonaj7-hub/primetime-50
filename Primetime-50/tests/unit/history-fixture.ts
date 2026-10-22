// TEST DATA ONLY. Synthetic snapshots are not real content or professional approval.
import { testRecord } from "./workout-fixture";
import { decodeHistory, type HistoryRecord } from "@/lib/history/records";
export function historyRecord(n = 1, kg = 12.5): HistoryRecord {
  const r = testRecord();
  r.id = `73000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
  r.performed_at = `2026-10-${String(10+n).padStart(2,"0")}T00:00:00Z`;
  r.completed = true; r.completed_at = r.performed_at;
  r.exercise_set_logs.forEach((s,i) => { s.id = `74000000-0000-4000-8000-${String(n*100+i).padStart(12,"0")}`; s.reps = 8; s.weight = kg+i; s.rpe = 7; });
  return decodeHistory({ workouts: [r] })[0];
}
export function personalRecord(n = 1): HistoryRecord {
  const r = historyRecord(n);
  return decodeHistory({ workouts: [{ ...r, record_mode: "personal", catalogue_version_id: null, prescription_snapshot: { source: "user_recorded", version: 1, prescription: null, weight_unit: "kg" } }] })[0];
}
