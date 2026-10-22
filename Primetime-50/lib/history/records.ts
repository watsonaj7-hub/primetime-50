import { z } from "zod";
import { recordedSetSchema, workoutId } from "@/lib/validation/workout";

const text = z.string().min(1).max(2000);
// Require an explicit offset and real calendar date; Date.parse alone normalises 30 February.
const instant = z.string().datetime({ offset: true }).refine(s => {
  const [year, month, day] = s.slice(0,10).split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  return Number.isFinite(Date.parse(s)) && day <= days[month - 1] && !/\.\d{7}/.test(s);
});
const zone = z.string().min(1).max(100).refine(s => {
  try { new Intl.DateTimeFormat("en-AU", { timeZone: s }); return true; } catch { return false; }
});
const exercise = z.object({
  exercise_key: workoutId, exercise_name: z.string().trim().min(1).max(200), equipment: z.array(text), exclusions: z.array(text),
  sets: z.number().int().min(1).max(20), reps: text.nullable(), duration_seconds: z.number().int().positive().nullable(),
  load_guidance: text, rpe_guidance: text, rest_seconds: z.number().int().nonnegative(), cues: text, stop_rules: text
}).refine(e => (e.reps !== null) !== (e.duration_seconds !== null));
const reviewed = z.object({
  source: z.literal("reviewed_catalogue"), approval_status_at_start: z.literal("approved"), contract_version: z.literal(1),
  catalogue_version_id: workoutId, content_id: text, content_version: text, rule_version: text, source_uri: text,
  reviewer_name: text, reviewer_role: text, approved_at: instant, weight_unit: z.literal("kg"),
  prescription: z.object({ title: text, session_minutes: z.number().int().min(1).max(120), screening_rules: text, referral_rules: text,
    stop_rules: text, progression_rules: text, measurement: text, exercises: z.array(exercise).min(1).max(100) })
});
const personal = z.object({ source: z.literal("user_recorded"), version: z.literal(1), prescription: z.null(), weight_unit: z.literal("kg") }).strict();
const base = { id: workoutId, record_timezone: zone, performed_at: instant, completed: z.boolean(), completed_at: instant.nullable(), revision: z.number().int().nonnegative(), exercise_set_logs: z.array(recordedSetSchema).max(100) };
const historyRecord = z.discriminatedUnion("record_mode", [
  z.object({ ...base, record_mode: z.literal("personal"), catalogue_version_id: z.null(), prescription_snapshot: personal }),
  z.object({ ...base, record_mode: z.literal("reviewed"), catalogue_version_id: workoutId, prescription_snapshot: reviewed })
]).superRefine((r, ctx) => {
  const sets = r.exercise_set_logs;
  let invalid = r.completed !== (r.completed_at !== null) || (r.completed_at !== null && instantMicros(r.completed_at) < instantMicros(r.performed_at)) ||
    new Set(sets.map(s => s.id)).size !== sets.length || new Set(sets.map(s => `${s.exercise_key}:${s.set_number}`)).size !== sets.length ||
    (r.completed && (!sets.length || sets.some(s => s.reps === null || s.weight === null || s.rpe === null)));
  if (r.record_mode === "reviewed") {
    const snapshot = r.prescription_snapshot;
    const exercises = snapshot.prescription.exercises;
    const slots = exercises.flatMap(e => Array.from({ length: e.sets }, (_, i) => `${e.exercise_key}:${e.exercise_name}:${i + 1}`));
    const actual = sets.map(s => `${s.exercise_key}:${s.exercise_name}:${s.set_number}`);
    invalid ||= snapshot.catalogue_version_id !== r.catalogue_version_id || new Set(exercises.map(e => e.exercise_key)).size !== exercises.length || slots.length !== sets.length || slots.some(s => !actual.includes(s));
  }
  if (invalid) ctx.addIssue({ code: "custom", message: "Saved record is inconsistent." });
});
export type HistoryRecord = z.infer<typeof historyRecord>;
// PostgreSQL timestamptz has microsecond precision; Date.parse alone loses tie ordering.
function instantMicros(s: string) {
  const fraction = /\.(\d+)/.exec(s)?.[1] ?? "";
  return BigInt(Date.parse(s)) * BigInt(1000) + BigInt(fraction.slice(3).padEnd(3,"0"));
}
export function ordered(records: HistoryRecord[]) {
  return [...records].sort((a,b) => (instantMicros(a.performed_at) < instantMicros(b.performed_at) ? 1 : instantMicros(a.performed_at) > instantMicros(b.performed_at) ? -1 : 0) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
export function decodeHistory(value: unknown): HistoryRecord[] {
  const parsed = z.object({ workouts: z.array(historyRecord).max(100) }).parse(value).workouts;
  if (new Set(parsed.map(r => r.id)).size !== parsed.length) throw new Error("Duplicate workout identities in the saved response.");
  return ordered(parsed.filter(r => r.completed));
}
export function recordDay(r: HistoryRecord) {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: r.record_timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(r.performed_at));
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function recordTime(r: HistoryRecord, completed = false) {
  const value = completed ? r.completed_at! : r.performed_at;
  return `${new Intl.DateTimeFormat("en-AU", { timeZone: r.record_timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" }).format(new Date(value))} (${r.record_timezone})`;
}
export function historyGroups(records: HistoryRecord[]) {
  const groups = new Map<string, { key: string; day: string; zone: string; records: HistoryRecord[] }>();
  for (const r of ordered(records)) {
    const day = recordDay(r), key = `${day}|${r.record_timezone}`;
    if (!groups.has(key)) groups.set(key, { key, day, zone: r.record_timezone, records: [] });
    groups.get(key)!.records.push(r);
  }
  return [...groups.values()];
}
export type Comparison = { key: string; name: string; reps: number; version: string; baseline: { id: string; kg: number }; latest: { id: string; kg: number }; difference: string };
function decimalParts(value: number): [bigint, number] {
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const scale = fraction.length - Number(exponent);
  return scale < 0 ? [BigInt(whole + fraction) * BigInt(10) ** BigInt(-scale), 0] : [BigInt(whole + fraction), scale];
}
function observedDifference(latest: number, baseline: number) {
  const [a, sa] = decimalParts(latest), [b, sb] = decimalParts(baseline), scale = Math.max(sa,sb);
  const difference = a * BigInt(10) ** BigInt(scale - sa) - b * BigInt(10) ** BigInt(scale - sb);
  const sign = difference < BigInt(0) ? "-" : "";
  const digits = (difference < BigInt(0) ? -difference : difference).toString().padStart(scale + 1,"0");
  const value = scale ? `${digits.slice(0,-scale)}.${digits.slice(-scale)}`.replace(/0+$/, "").replace(/\.$/, "") : digits;
  return value === "0" ? "0" : sign + value;
}
export function strengthEvidence(records: HistoryRecord[]): Comparison[] {
  const series = new Map<string, { name: string; reps: number; version: string; sessions: { id: string; kg: number }[] }>();
  for (const r of ordered(records).reverse()) {
    if (!r.completed || r.record_mode !== "reviewed") continue; // Personal UUIDs do not establish a fixed protocol.
    const snapshot = r.prescription_snapshot;
    for (const e of snapshot.prescription.exercises) {
      if (e.duration_seconds !== null) continue; // No seconds-to-reps inference.
      const maxima = new Map<number, number>();
      for (const s of r.exercise_set_logs) {
        if (s.exercise_key !== e.exercise_key || s.reps === null || s.reps <= 0 || s.weight === null) continue;
        maxima.set(s.reps, Math.max(maxima.get(s.reps) ?? 0, s.weight));
      }
      for (const [reps, kg] of maxima) {
        const key = JSON.stringify([r.record_mode, r.catalogue_version_id, snapshot.content_id, snapshot.content_version, snapshot.rule_version, e.exercise_key, e.exercise_name, reps]);
        if (!series.has(key)) series.set(key, { name: e.exercise_name, reps, version: r.catalogue_version_id, sessions: [] });
        series.get(key)!.sessions.push({ id: r.id, kg });
      }
    }
  }
  return [...series].flatMap(([key, s]) => {
    if (s.sessions.length < 2) return [];
    const baseline = s.sessions[0], latest = s.sessions[s.sessions.length - 1];
    return [{ key, name: s.name, reps: s.reps, version: s.version, baseline, latest, difference: observedDifference(latest.kg, baseline.kg) }];
  }).sort((a,b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
