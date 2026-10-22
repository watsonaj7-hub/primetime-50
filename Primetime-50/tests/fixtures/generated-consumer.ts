// TEST DATA ONLY: shared raw storage fixture for unit/component and later official
// synthetic review. No application route, catalogue seed or real approval.
import type { ProgressionStatus } from "@/lib/ai/generated-records";
import { testRecord } from "../unit/workout-fixture";
export const generatedRequestId = "61000000-0000-4000-8000-000000000001";
export const generatedPolicyId = "61000000-0000-4000-8000-000000000002";
export function savedGenerated() {
  const w = testRecord().prescription_snapshot;
  return {
    id: "61000000-0000-4000-8000-000000000004", request_id: generatedRequestId,
    policy_version_id: generatedPolicyId, created_at: "2026-10-22T00:00:00.123456+00:00",
    selection: { policy_version_id: generatedPolicyId, context_revision: 7, weeks: [{ sessions: [{ day: 1, catalogue_version_id: w.catalogue_version_id }] }] },
    provenance: { source: "validated_generated", contract_version: 1, context_revision: 7,
      policy_version_id: generatedPolicyId, rule_version: "TEST policy rule", reviewer_name: "TEST policy reviewer", reviewer_role: "TEST role",
      approved_at: "2026-10-20T00:00:00+00:00", source_uri: "https://example.invalid/TEST-policy", activation_id: "61000000-0000-4000-8000-000000000005", model: "TEST model", reserved_microusd: 17,
      rules: { weeks: [{ catalogue_ids: [w.catalogue_version_id], min_sessions: 1, max_sessions: 2, rest_days: 1 }] },
      catalogue: [{ catalogue_version_id: w.catalogue_version_id, content_id: w.content_id, content_version: w.content_version, rule_version: w.rule_version,
        reviewer_name: w.reviewer_name, reviewer_role: w.reviewer_role, approved_at: w.approved_at, source_uri: w.source_uri, prescription: w.prescription }]
    }
  };
}
export const noProgression: ProgressionStatus = {
  adaptation: "unavailable" as const, evidence_state: "none" as const, evidence: [], screening_state: "unavailable" as const,
  missing_prerequisites: ["completed_records", "screening_review", "approved_progression_rules", "approved_recovery_rules"]
};
