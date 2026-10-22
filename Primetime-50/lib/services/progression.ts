import "server-only";
import { z } from "zod";
import { readWorkouts, readReviewedAvailability } from "@/lib/services/workout";
import { decodeHistory } from "@/lib/history/records";
import type { ProgressionStatus } from "@/lib/ai/generated-records";

// Descriptive owned evidence only. No approved adaptive/recovery policy exists.
export async function readProgressionStatus(): Promise<ProgressionStatus> {
  const status: ProgressionStatus = { adaptation: "unavailable", evidence_state: "unavailable", evidence: [], screening_state: "unconfirmed",
    missing_prerequisites: ["approved_progression_rules", "approved_recovery_rules"] };
  try {
    const records = decodeHistory({ workouts: await readWorkouts(null,true) });
    status.evidence = records.map(r => ({ id:r.id, performed_at:r.performed_at, catalogue_version_id:r.catalogue_version_id }));
    status.evidence_state = records.length ? "available" : "none";
    if (!records.length) status.missing_prerequisites.push("completed_records");
  } catch { status.missing_prerequisites.push("record_storage"); }
  try {
    const available = z.object({ state:z.enum(["available","unavailable","unsupported","referral_required"]), workouts:z.array(z.object({catalogue_version_id:z.string().uuid()})) })
      .refine(a=>a.state==="available" ? a.workouts.length>0 : a.workouts.length===0).parse(await readReviewedAvailability());
    status.screening_state = available.state;
  } catch { /* An unavailable check does not establish resolved screening. */ }
  if (status.screening_state !== "available") status.missing_prerequisites.push("screening_review");
  return status;
}
