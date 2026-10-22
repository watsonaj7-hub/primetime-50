// TEST DATA ONLY. Never a production catalogue seed or approval.
import type { WorkoutRecord } from "@/lib/client/workout";
const id = "71000000-0000-4000-8000-000000000001";
const version = "71000000-0000-4000-8000-000000000002";
const exerciseKey = "71000000-0000-4000-8000-000000000003";
export function testRecord(): WorkoutRecord {
  return { id, catalogue_version_id: version, record_mode: "reviewed", record_timezone: "Australia/Melbourne", performed_at: "2026-10-22T00:00:00Z", completed: false, completed_at: null, revision: 0,
    prescription_snapshot: { source: "reviewed_catalogue", approval_status_at_start: "approved", contract_version: 1, catalogue_version_id: version, content_id: "TEST DATA ONLY", content_version: "TEST-v1", rule_version: "TEST-r1", source_uri: "https://example.invalid/TEST-ONLY", reviewer_name: "TEST ONLY NOT A REAL REVIEWER", reviewer_role: "TEST ONLY", approved_at: "2026-10-20T00:00:00Z", weight_unit: "kg",
      prescription: { title: "TEST DATA ONLY workout", session_minutes: 20, screening_rules: "TEST screening", referral_rules: "TEST referral", stop_rules: "TEST stop", progression_rules: "TEST progression", measurement: "TEST measurement", exercises: [{ exercise_key: exerciseKey, exercise_name: "TEST ONLY movement", equipment: ["TEST equipment"], exclusions: [], sets: 2, reps: "TEST reps", duration_seconds: null, rest_seconds: 30, cues: "TEST cues", stop_rules: "TEST stop", load_guidance: "TEST load", rpe_guidance: "TEST effort" }] } },
    exercise_set_logs: [1,2].map(n => ({ id: `72000000-0000-4000-8000-00000000000${n}`, exercise_key: exerciseKey, exercise_name: "TEST ONLY movement", set_number: n, reps: null, weight: null, rpe: null })) };
}
