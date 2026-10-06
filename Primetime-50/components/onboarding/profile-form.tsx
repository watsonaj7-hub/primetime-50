"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MutationStatus } from "@/components/shared/mutation-status";
import { equipmentTypes, goals, restrictions, profileSchema, type SavedProfile } from "@/lib/validation/profile";
import { initialState, type MutationState } from "@/lib/types/mutation";
import { type OnboardingDraft } from "@/lib/validation/draft";

const title = (value: string) => value.replaceAll("_", " ").replace(/^./, v => v.toUpperCase());
const steps = ["Personal details", "Goals and training", "Health and equipment", "Review"];

export function ProfileForm({ profile, draft = null, onboarding = false }: { profile: SavedProfile | null; draft?: OnboardingDraft | null; onboarding?: boolean }) {
  const [step, setStep] = useState(draft?.step ?? 0);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<MutationState>(initialState);
  const [values, setValues] = useState(draft?.values ?? {
    display_name: profile?.display_name ?? "", date_of_birth: profile?.date_of_birth ?? "", sex: profile?.sex ?? "not_specified", unit_system: profile?.unit_system ?? "metric",
    height_cm: profile?.height_cm?.toString() ?? "", weight_kg: profile?.weight_kg?.toString() ?? "", waist_cm: profile?.waist_cm?.toString() ?? "",
    fitness_level: profile?.fitness_level ?? "", primary_goal: profile?.primary_goal ?? "", secondary_goal: profile?.secondary_goal ?? "",
    training_days_per_week: profile?.training_days_per_week?.toString() ?? "", preferred_session_minutes: profile?.preferred_session_minutes?.toString() ?? "", training_location: profile?.training_location ?? "",
    health_status: profile?.health_status ?? "not_reviewed", health_notes: profile?.health_notes ?? ""
  });
  const [equipment, setEquipment] = useState<string[]>(draft?.equipment ?? profile?.equipment ?? []);
  const [healthRestrictions, setHealthRestrictions] = useState<string[]>(draft?.healthRestrictions ?? profile?.health_restrictions ?? []);
  const [draftStatus, setDraftStatus] = useState(draft ? "Draft restored." : "");
  const [saved, setSaved] = useState(false);
  const latestDraft = useRef("");
  useEffect(() => {
    if (!onboarding || profile || saved) return;
    const body = JSON.stringify({ step, values, equipment, healthRestrictions });
    latestDraft.current = body;
    const timer = setTimeout(() => {
      setDraftStatus("Saving draft…");
      fetch("/api/profile/draft", { method: "PUT", headers: { "Content-Type": "application/json" }, body }).then(response => {
        if (latestDraft.current === body) setDraftStatus(response.ok ? "Draft saved to your account." : "Draft could not be saved. Keep this page open and try again.");
      }).catch(() => { if (latestDraft.current === body) setDraftStatus("Draft could not be saved. Keep this page open and try again."); });
    }, 800);
    return () => clearTimeout(timer);
  }, [onboarding, profile, saved, step, values, equipment, healthRestrictions]);
  const update = (key: keyof typeof values, value: string) => setValues(current => ({ ...current, [key]: value }));
  const input = (key: keyof typeof values, label: string, type = "text", min?: number, max?: number) => <label className="block space-y-2" key={key}><span className="font-semibold">{label}</span><Input name={key} type={type} min={min} max={max} step={type === "number" ? "any" : undefined} value={values[key]} onChange={event => update(key, event.target.value)} /></label>;
  const select = (key: keyof typeof values, label: string, options: readonly string[], optional = false) => <label className="block space-y-2" key={key}><span className="font-semibold">{label}</span><Select name={key} value={values[key]} onChange={event => update(key, event.target.value)}><option value="">{optional ? "None" : "Choose an option"}</option>{options.map(value => <option key={value} value={value}>{title(value)}</option>)}</Select></label>;
  const checked = (label: string, options: readonly string[], selected: string[], change: (v: string[]) => void) => <fieldset className="rounded-[8px] border p-4 md:col-span-2"><legend className="px-2 font-semibold">{label}</legend><div className="grid gap-3 sm:grid-cols-2">{options.map(value => <label key={value} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={selected.includes(value)} onChange={e => change(e.target.checked ? [...selected, value] : selected.filter(item => item !== value))} />{title(value)}</label>)}</div></fieldset>;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = profileSchema.safeParse({ ...values, height_cm: values.height_cm ? Number(values.height_cm) : NaN, weight_kg: values.weight_kg ? Number(values.weight_kg) : NaN, waist_cm: values.waist_cm ? Number(values.waist_cm) : null, training_days_per_week: values.training_days_per_week ? Number(values.training_days_per_week) : NaN, preferred_session_minutes: values.preferred_session_minutes ? Number(values.preferred_session_minutes) : NaN, secondary_goal: values.secondary_goal || null, equipment, health_restrictions: healthRestrictions });
    if (!parsed.success) {
      setState({ status: "error", message: "Please check your entries. You can go back to edit any step.", fields: parsed.error.flatten().fieldErrors });
      return;
    }
    setPending(true);
    setState(initialState);
    try {
      const response = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) setState({ status: "error", message: result.error || "Your changes were not saved. Please try again.", fields: result.fields });
      else { setSaved(true); setState({ status: "success", message: onboarding ? "Your profile is saved. You can review or update it in Settings." : "Your settings are saved." }); }
    } catch { setState({ status: "error", message: "Connection failed. Your entries are still here. Please try again." }); }
    finally { setPending(false); }
  }
  const show = (n: number) => !onboarding || step === n;
  return <form onSubmit={save} noValidate className="space-y-6" aria-busy={pending}>
    {onboarding && <div><p role="status" className="font-semibold">Step {step + 1} of {steps.length}: {steps[step]}</p><progress className="mt-2 w-full" max={steps.length} value={step + 1} aria-label="Onboarding progress" /></div>}
    <fieldset disabled={pending} className="space-y-6">
      {show(0) && <div className="grid gap-4 md:grid-cols-2">
        {input("display_name", "Display name")}{input("date_of_birth", "Date of birth", "date")}
        {select("sex", "Sex (optional)", ["not_specified", "female", "male"])}{select("unit_system", "Preferred display units", ["metric", "imperial"])}
        {input("height_cm", "Height (cm)", "number", 100, 250)}{input("weight_kg", "Weight (kg)", "number", 25, 350)}{input("waist_cm", "Waist (cm, optional)", "number", 30, 250)}
        <p className="text-sm text-muted-foreground md:col-span-2">Use cm and kg for these inputs. Your preferred display units are saved for future tracking screens.</p>
      </div>}
      {show(1) && <div className="grid gap-4 md:grid-cols-2">
        {select("fitness_level", "Fitness level", ["beginner", "returning", "consistent"])}{select("primary_goal", "Primary goal", goals)}{select("secondary_goal", "Secondary goal (optional)", goals, true)}
        {select("training_location", "Training location", ["home", "gym", "both"])}{input("training_days_per_week", "Training days per week", "number", 1, 7)}{input("preferred_session_minutes", "Session duration (minutes)", "number", 10, 120)}
      </div>}
      {show(2) && <div className="grid gap-4 md:grid-cols-2">
        <p className="text-sm text-muted-foreground md:col-span-2">Health details are private to your account and help identify exercise restrictions. They do not provide a medical diagnosis. Unreviewed limitations require review before automatic exercise selection.</p>
        {select("health_status", "Health limitations", ["not_reviewed", "none_reported", "limitations_reported"])}
        {checked("Exercise restrictions", restrictions, healthRestrictions, setHealthRestrictions)}
        <label className="space-y-2 md:col-span-2"><span className="font-semibold">Health notes (optional)</span><Textarea maxLength={2000} value={values.health_notes} onChange={event => update("health_notes", event.target.value)} /></label>
        {checked("Available equipment", equipmentTypes, equipment, setEquipment)}
      </div>}
      {onboarding && step === 3 && <div className="space-y-3 rounded-[8px] bg-muted p-4"><h2 className="text-xl font-bold">Review your profile</h2><p>Name: {values.display_name || "Not entered"}</p><p>Goal: {title(values.primary_goal || "not_entered")}</p><p>Training: {values.training_days_per_week || "—"} days/week, {values.preferred_session_minutes || "—"} minutes/session</p><p>Equipment: {equipment.map(title).join(", ") || "Not selected"}</p><p>Health: {title(values.health_status)}</p><p>Restrictions: {healthRestrictions.map(title).join(", ") || "None selected"}</p><p className="text-sm">Review your preferences before saving. You can update them later in Settings.</p></div>}
      <div className="flex flex-wrap gap-3">
        {onboarding && step > 0 && <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
        {onboarding && step < 3 ? <Button type="button" onClick={() => { setState(initialState); setStep(step + 1); }}>Continue</Button> : <Button type="submit">{pending ? "Saving…" : onboarding ? "Save profile" : "Save settings"}</Button>}
      </div>
    </fieldset>
    <MutationStatus state={state} />
    {onboarding && !profile && !saved && <p role="status" className="text-sm text-muted-foreground">{draftStatus}</p>}
  </form>;
}
