import { z } from "zod";
import { recordedSetSchema, saveWorkoutSchema, startWorkoutSchema, workoutId } from "@/lib/validation/workout";

// Decode the actual route/SQL contract. A malformed response never becomes a prescription.
const text = z.string().min(1);
const exercise = z.object({
  exercise_key: workoutId, exercise_name: text, equipment: z.array(z.string()), exclusions: z.array(z.string()),
  sets: z.number().int().min(1).max(20), reps: text.nullable(), duration_seconds: z.number().int().positive().nullable(),
  load_guidance: text, rpe_guidance: text, rest_seconds: z.number().int().nonnegative(), cues: text, stop_rules: text
});
const snapshot = z.object({
  source: z.literal("reviewed_catalogue"), approval_status_at_start: z.literal("approved"), contract_version: z.literal(1),
  catalogue_version_id: workoutId, content_id: text, content_version: text, rule_version: text, source_uri: text,
  reviewer_name: text, reviewer_role: text, approved_at: text, weight_unit: z.literal("kg"),
  prescription: z.object({ title: text, session_minutes: z.number().int().positive(), screening_rules: text, referral_rules: text,
    stop_rules: text, progression_rules: text, measurement: text, exercises: z.array(exercise).min(1) })
});
export type WorkoutSnapshot = z.infer<typeof snapshot>;
const record = z.object({
  id: workoutId, catalogue_version_id: workoutId, record_mode: z.literal("reviewed"), record_timezone: text,
  performed_at: text, completed: z.boolean(), completed_at: text.nullable(), revision: z.number().int().nonnegative(),
  prescription_snapshot: snapshot, exercise_set_logs: z.array(recordedSetSchema)
}).superRefine((r, ctx) => {
  const slots = r.prescription_snapshot.prescription.exercises.flatMap(e => Array.from({ length: e.sets }, (_, i) => `${e.exercise_key}:${e.exercise_name}:${i + 1}`));
  const actual = r.exercise_set_logs.map(s => `${s.exercise_key}:${s.exercise_name}:${s.set_number}`);
  if (r.catalogue_version_id !== r.prescription_snapshot.catalogue_version_id || r.completed !== (r.completed_at !== null) ||
      slots.length !== actual.length || new Set(actual).size !== slots.length || new Set(r.exercise_set_logs.map(s => s.id)).size !== slots.length || slots.some(s => !actual.includes(s)))
    ctx.addIssue({ code: "custom", message: "The saved prescription could not be confirmed." });
});
export type WorkoutRecord = z.infer<typeof record>;
const availabilitySchema = z.object({ state: z.enum(["available", "unavailable", "unsupported", "referral_required"]),
  workouts: z.array(z.object({ catalogue_version_id: workoutId, prescription_snapshot: snapshot }))
}).refine(a => a.state === "available" ? a.workouts.length > 0 && a.workouts.every(w => w.catalogue_version_id === w.prescription_snapshot.catalogue_version_id) : a.workouts.length === 0);
export type Availability = z.infer<typeof availabilitySchema>;
export type SetDraft = { id: string; reps: string; weight: string; rpe: string };
type Start = z.infer<typeof startWorkoutSchema>;
export class WorkoutRequestError extends Error { constructor(public status: number, message: string) { super(message); } }
export const safeStates = {
  unavailable: "No reviewed workout matches your saved information. Reviewed content and rules need to be supplied and approved before a workout can be offered.",
  unsupported: "Your saved information is not supported for workout selection. Review your profile, health information and equipment in Settings. No workout has been substituted.",
  referral_required: "Your saved screening information requires professional review before workout selection. No workout is offered."
};
export function draftsFor(r: WorkoutRecord): SetDraft[] {
  return r.exercise_set_logs.map(s => ({ id: s.id, reps: s.reps?.toString() ?? "", weight: s.weight?.toString() ?? "", rpe: s.rpe?.toString() ?? "" }));
}
function value(raw: string, field: "reps" | "weight" | "rpe") {
  if (!raw.trim()) return null;
  // Decimal syntax only; reject silent coercion, infinity and precision loss.
  if (!/^\d+(\.\d+)?$/.test(raw.trim())) throw new Error("Use a nonnegative decimal number, or leave the field blank.");
  const n = Number(raw);
  const normal = raw.trim().replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (!Number.isFinite(n) || String(n) !== normal) throw new Error("Use a number that can be recorded without rounding.");
  if (field === "reps" && (!Number.isInteger(n) || n > 100)) throw new Error("Reps must be a whole number from 0 to 100.");
  if (field === "weight" && n > 10000) throw new Error("Load must be from 0 to 10000 kg.");
  if (field === "rpe" && (n < 1 || n > 10)) throw new Error("RPE must be from 1 to 10.");
  return n;
}
export function savePayload(r: WorkoutRecord, drafts: SetDraft[]) {
  return saveWorkoutSchema.parse({ id: r.id, expected_revision: r.revision, sets: r.exercise_set_logs.flatMap(s => {
    const d = drafts.find(d => d.id === s.id);
    if (!d) throw new Error("Reopen the original workout before saving.");
    const parse = (field: "reps" | "weight" | "rpe") => {
      try { return value(d[field], field); }
      catch (e) { throw new Error(`${s.exercise_name}, set ${s.set_number}, ${field === "weight" ? "load (kg)" : field}: ${e instanceof Error ? e.message : "Check this entry."}`); }
    };
    const updated = { ...s, reps: parse("reps"), weight: parse("weight"), rpe: parse("rpe") };
    return updated.reps === s.reps && updated.weight === s.weight && updated.rpe === s.rpe ? [] : [updated];
  }) });
}
export function isDirty(r: WorkoutRecord | null, drafts: SetDraft[]) {
  if (!r) return false;
  try { return r.exercise_set_logs.some(s => { const d = drafts.find(d => d.id === s.id); return !d || value(d.reps, "reps") !== s.reps || value(d.weight, "weight") !== s.weight || value(d.rpe, "rpe") !== s.rpe; }); }
  catch { return true; }
}
export type WorkoutState = {
  busy: boolean; message: string; error: string; availability: Availability | null; record: WorkoutRecord | null;
  recent: WorkoutRecord[]; drafts: SetDraft[]; needsReconcile: boolean; signedOut: boolean;
};
const initial = (): WorkoutState => ({ busy: false, message: "Loading reviewed workouts…", error: "", availability: null, record: null, recent: [], drafts: [], needsReconcile: false, signedOut: false });

// One ephemeral controller per mounted identity. No autosave, browser health storage or generated set IDs.
export class WorkoutController {
  state = initial();
  private epoch = 0;
  private active = true;
  private listeners = new Set<() => void>();
  private intent: Start | null = null;
  constructor(private fetcher: typeof fetch, private verifyIdentity: () => Promise<boolean>, private remember: (s: Start) => void) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.state;
  activate = () => { this.epoch++; this.active = true; this.intent = null; this.update(initial()); };
  private update(patch: Partial<WorkoutState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()); }
  invalidate = () => { this.epoch++; this.active = false; this.intent = null; this.update({ ...initial(), signedOut: true, message: "Your session changed. Reload and sign in before continuing." }); };
  dispose = () => { this.active = false; this.epoch++; };
  edit(id: string, field: "reps" | "weight" | "rpe", raw: string) {
    if (!this.active || this.state.busy || this.state.record?.completed) return;
    this.update({ drafts: this.state.drafts.map(s => s.id === id ? { ...s, [field]: raw } : s), message: "Unsaved entries." });
  }
  private assertCurrent(epoch: number) {
    if (!this.active || epoch !== this.epoch) throw new Error("Stale workout operation.");
  }
  private async request(epoch: number, url: string, method = "GET", payload?: unknown): Promise<unknown> {
    this.assertCurrent(epoch);
    const response = await this.fetcher(url, { method, cache: "no-store", credentials: "same-origin", headers: payload ? { "Content-Type": "application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined });
    this.assertCurrent(epoch);
    if (response.status === 401) { this.invalidate(); throw new WorkoutRequestError(401, "Please sign in again."); }
    if (!response.ok) throw new WorkoutRequestError(response.status, response.status === 409 ? "The saved workout may have changed. Check saved values before continuing." : "The request could not be confirmed. Your entries are retained. Check your connection and retry.");
    const data: unknown = await response.json();
    this.assertCurrent(epoch);
    return data;
  }
  private async run(action: (epoch: number) => Promise<void>) {
    if (!this.active || this.state.busy) return;
    const epoch = this.epoch;
    this.update({ busy: true, error: "", message: "Working…" });
    try {
      const verified = await this.verifyIdentity();
      this.assertCurrent(epoch);
      if (!verified) { this.invalidate(); return; }
      await action(epoch);
    } catch (e) {
      if (this.active && epoch === this.epoch) this.update({ error: e instanceof Error ? e.message : "The request could not be confirmed.", message: "" });
    } finally { if (this.active && epoch === this.epoch) this.update({ busy: false }); }
  }
  private async read(epoch: number, id: string) {
    const parsed = z.object({ workouts: z.array(z.unknown()) }).parse(await this.request(epoch, `/api/workouts?id=${encodeURIComponent(workoutId.parse(id))}`));
    const r = parsed.workouts.length === 1 ? record.parse(parsed.workouts[0]) : null;
    if (!r || r.id !== id) throw new Error("The original reviewed workout was not found. Retry opening it; no replacement has been created.");
    return r;
  }
  async load(id?: string, intent?: Start) {
    if (intent) this.intent = startWorkoutSchema.parse(intent);
    return this.run(async epoch => {
      if (id) {
        const r = await this.read(epoch, id);
        if (this.active && epoch === this.epoch) this.update({ record: r, drafts: draftsFor(r), message: r.completed ? "Completed workout. Saved values are read-only." : "Saved workout opened.", needsReconcile: false });
      } else {
        const a = z.object({ availability: availabilitySchema }).parse(await this.request(epoch, "/api/workouts?view=reviewed-availability"));
        const recent = z.object({ workouts: z.array(z.unknown()) }).parse(await this.request(epoch, "/api/workouts"));
        if (this.active && epoch === this.epoch) this.update({ availability: a.availability, recent: recent.workouts.flatMap(r => { const p = record.safeParse(r); return p.success ? [p.data] : []; }), message: "Workouts checked against your saved information." });
      }
    });
  }
  async start(version: string, timezone: string) {
    if (this.state.record) return;
    return this.run(async epoch => {
      if (!this.intent) {
        if (!this.state.availability?.workouts.some(w => w.catalogue_version_id === version)) throw new Error("Check available workouts before starting.");
        this.intent = startWorkoutSchema.parse({ id: crypto.randomUUID(), mode: "reviewed", timezone, catalogue_version_id: version });
        this.remember(this.intent);
      }
      const intent = this.intent;
      await this.request(epoch, "/api/workouts", "POST", intent);
      if (!this.active || epoch !== this.epoch) return;
      const r = await this.read(epoch, intent.id); // Mutation responses have no joined sets.
      if (r.catalogue_version_id !== intent.catalogue_version_id || r.record_timezone !== intent.timezone) throw new Error("The original start could not be matched. Keep its identity and check the saved record.");
      if (this.active && epoch === this.epoch) this.update({ record: r, drafts: draftsFor(r), message: "Workout started. Record what you actually do.", needsReconcile: false });
    });
  }
  retryStart() { if (this.intent) return this.start(this.intent.catalogue_version_id!, this.intent.timezone); }
  hasStartIntent() { return !!this.intent; }
  async reconcile() {
    return this.run(async epoch => {
      const before = this.state.record;
      const id = before?.id ?? this.intent?.id;
      if (!id) throw new Error("Open the original workout first.");
      const r = await this.read(epoch, id);
      if (!this.active || epoch !== this.epoch) return;
      // Keep every local field, including invalid input, until explicitly accepted/discarded by the user.
      this.update({ record: r, drafts: before ? this.state.drafts : draftsFor(r), needsReconcile: false,
        message: r.completed ? "Completion confirmed. Local entries remain visible; saved values are shown below." : "Saved values checked. Local entries retained. Compare them before saving again." });
    });
  }
  useSaved() { if (this.state.record && !this.state.busy) this.update({ drafts: draftsFor(this.state.record), message: "Showing saved values.", error: "" }); }
  async save() {
    return this.run(async epoch => {
      const r = this.state.record;
      if (!r || r.completed || this.state.needsReconcile) throw new Error("Check the saved workout before saving again.");
      if (!isDirty(r, this.state.drafts)) { this.update({ message: "All entries are saved." }); return; }
      const payload = savePayload(r, this.state.drafts);
      this.update({ needsReconcile: true });
      // Sparse bounded requests avoid the route's 16 KiB body limit. Reconcile each committed batch.
      for (const set of payload.sets) {
        const current = this.state.record!;
        await this.request(epoch, "/api/workouts", "PUT", { id: r.id, expected_revision: current.revision, sets: [set] });
        if (!this.active || epoch !== this.epoch) return;
        const saved = await this.read(epoch, r.id);
        if (!this.active || epoch !== this.epoch) return;
        this.update({ record: saved });
        if (saved.completed) throw new Error("This workout was completed elsewhere. Check saved values.");
        if (saved.revision !== current.revision + 1 || saved.exercise_set_logs.some(s => {
          const expected = s.id === set.id ? set : current.exercise_set_logs.find(e => e.id === s.id);
          return !expected || s.reps !== expected.reps || s.weight !== expected.weight || s.rpe !== expected.rpe;
        })) throw new Error("The workout changed during saving. Local entries are retained. Compare saved values before retrying.");
      }
      if (isDirty(this.state.record, this.state.drafts)) throw new Error("The returned values differ from your entries. Compare saved values before continuing.");
      this.update({ needsReconcile: false, message: "Entries saved and checked." });
    });
  }
  async complete() {
    return this.run(async epoch => {
      const r = this.state.record;
      if (!r || r.completed) return;
      if (this.state.needsReconcile || isDirty(r, this.state.drafts)) throw new Error("Save and check all entries before completing.");
      if (r.exercise_set_logs.some(s => s.reps === null || s.weight === null || s.rpe === null)) throw new Error("Fill and save reps, load and RPE for every set before completing.");
      this.update({ needsReconcile: true });
      await this.request(epoch, "/api/workouts/complete", "POST", { id: r.id, expected_revision: r.revision });
      if (!this.active || epoch !== this.epoch) return;
      const saved = await this.read(epoch, r.id);
      if (this.active && epoch === this.epoch) this.update({ record: saved, needsReconcile: !saved.completed, message: saved.completed ? "Workout completed. Saved values are read-only." : "Completion is not confirmed. Check saved values before retrying." });
    });
  }
}
