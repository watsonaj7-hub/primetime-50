import { z } from "zod";
import { generatedPlanSchema } from "./generated-contract";
const uuid = z.string().uuid();
const text = z.string().min(1).max(2000).refine(s => s.trim().length > 0);
const integer = z.number().int().safe();
const instant = z.string().datetime({ offset: true }).refine(s => {
  const [year, month, day] = s.slice(0,10).split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31][month-1] && !/\.\d{7}/.test(s);
});
const exercise = z.object({
  exercise_key: uuid, exercise_name: text, equipment: z.array(text).max(100), exclusions: z.array(text).max(100),
  sets: integer.min(1).max(20), reps: text.nullable(), duration_seconds: integer.positive().nullable(),
  load_guidance: text, rpe_guidance: text, rest_seconds: integer.nonnegative(), cues: text, stop_rules: text
}).strict().refine(e => (e.reps !== null) !== (e.duration_seconds !== null));
export const prescriptionSchema = z.object({
  title: text, session_minutes: integer.min(1).max(120), screening_rules: text, referral_rules: text,
  stop_rules: text, progression_rules: text, measurement: text, exercises: z.array(exercise).min(1).max(100)
}).strict().refine(p => new Set(p.exercises.map(e => e.exercise_key)).size === p.exercises.length);
export type PrescriptionData = z.infer<typeof prescriptionSchema>;
const content = z.object({ catalogue_version_id: uuid, content_id: text, content_version: text, rule_version: text,
  reviewer_name: text, reviewer_role: text, approved_at: instant, source_uri: text, prescription: prescriptionSchema }).strict();
const rule = z.object({ catalogue_ids: z.array(uuid).min(1).max(20), min_sessions: integer.min(1).max(7), max_sessions: integer.min(1).max(7), rest_days: integer.min(0).max(6) }).strict()
  .refine(r => r.min_sessions <= r.max_sessions && new Set(r.catalogue_ids).size === r.catalogue_ids.length);
const saved = z.object({ id: uuid, request_id: uuid, policy_version_id: uuid, created_at: instant, selection: generatedPlanSchema,
  provenance: z.object({ source: z.literal("validated_generated"), contract_version: z.literal(1), context_revision: integer.nonnegative(),
    policy_version_id: uuid, rule_version: text, reviewer_name: text, reviewer_role: text, approved_at: instant, source_uri: text,
    rules: z.object({ weeks: z.array(rule).min(1).max(4) }).strict(), catalogue: z.array(content).min(1).max(20),
    activation_id: uuid, model: text, reserved_microusd: integer.nonnegative()
  }).strict()
}).strict().superRefine((r, ctx) => {
  const s = r.selection, p = r.provenance;
  const entries = new Map(p.catalogue.map(c => [c.catalogue_version_id,c]));
  const used = new Set(s.weeks.flatMap(w => w.sessions.map(x => x.catalogue_version_id)));
  let invalid = r.policy_version_id !== s.policy_version_id || r.policy_version_id !== p.policy_version_id || s.context_revision !== p.context_revision ||
    s.weeks.length !== p.rules.weeks.length || entries.size !== p.catalogue.length || used.size !== entries.size || [...used].some(id => !entries.has(id));
  let last: number | undefined, previousRest = 0;
  s.weeks.forEach((week,i) => {
    const rule = p.rules.weeks[i];
    if (!rule) { invalid = true; return; }
    invalid ||= week.sessions.length < rule.min_sessions || week.sessions.length > rule.max_sessions;
    week.sessions.forEach(slot => {
      const day = i*7+slot.day;
      invalid ||= !rule.catalogue_ids.includes(slot.catalogue_version_id) || (last !== undefined && day-last <= Math.max(previousRest,rule.rest_days));
      last=day; previousRest=rule.rest_days;
    });
  });
  if (invalid) ctx.addIssue({ code: "custom", message: "Saved generated references could not be confirmed." });
});
export type SavedGeneratedPlan = z.infer<typeof saved>;
export function decodeGeneratedRecord(value: unknown): SavedGeneratedPlan { return saved.parse(value); }
export function decodeGeneratedRecords(value: unknown): SavedGeneratedPlan[] {
  const records = z.array(saved).max(20).parse(value);
  if (new Set(records.map(r => r.id)).size !== records.length || new Set(records.map(r => r.request_id)).size !== records.length) throw new Error("Duplicate generated identities.");
  return records;
}
export function resolveGeneratedSession(plan: SavedGeneratedPlan, id: string) {
  // Keep exact lookup defensive even when invoked independently of the decoder.
  const entries = plan.provenance.catalogue.filter(c => c.catalogue_version_id === id);
  if (entries.length !== 1) throw new Error("Saved catalogue reference is unavailable.");
  return entries[0];
}
export const progressionStatusSchema = z.object({ adaptation: z.literal("unavailable"), evidence_state: z.enum(["available", "none", "unavailable"]),
  evidence: z.array(z.object({ id: uuid, performed_at: instant, catalogue_version_id: uuid.nullable() }).strict()).max(100),
  screening_state: z.enum(["available", "unavailable", "unsupported", "referral_required", "unconfirmed"]),
  missing_prerequisites: z.array(z.enum(["completed_records", "record_storage", "screening_review", "approved_progression_rules", "approved_recovery_rules"]))
}).strict();
export type ProgressionStatus = z.infer<typeof progressionStatusSchema>;
