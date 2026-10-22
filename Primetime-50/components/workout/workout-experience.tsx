"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import { WorkoutController, isDirty, safeStates, type WorkoutState } from "@/lib/client/workout";
import { Prescription } from "@/components/workout/prescription";
import { startWorkoutSchema } from "@/lib/validation/workout";

export function WorkoutView({ state, controller, compact = false }: { state: WorkoutState; controller: WorkoutController; compact?: boolean }) {
  const feedback = useRef<HTMLDivElement>(null);
  const [chosen, setSelected] = useState("");
  const selected = chosen || (!state.hintUnavailable && state.availability?.workouts.some(w => w.catalogue_version_id === state.selectionHint) ? state.selectionHint! : "");
  useEffect(() => { if (state.error) feedback.current?.focus(); }, [state.error]);
  const r = state.record;
  const dirty = isDirty(r, state.drafts);
  const locked = state.busy || state.signedOut;
  const available = state.availability;
  return <div className="min-w-0 space-y-6 break-words">
    <Card className="min-w-0">
      <CardHeader>{compact ? <h2 className="text-2xl font-bold">Today’s workout</h2> : <h1 className="text-3xl font-bold">Workout logger</h1>}<p className="text-muted-foreground">Reviewed workouts use your saved profile, health information and equipment.</p></CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <p role="status" aria-live="polite">{state.message}</p>
        <div ref={feedback} tabIndex={-1} role={state.error ? "alert" : undefined} className="rounded-[8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{state.error}</div>
        {state.signedOut ? <Button asChild><Link href="/login?next=/workout">Sign in again</Link></Button> : <>
          {available && available.state !== "available" && <p>{safeStates[available.state]}</p>}
          {compact ? <>
            {available?.state === "available" && <p>{available.workouts.length} reviewed {available.workouts.length === 1 ? "workout is" : "workouts are"} available. Choose and review the exact prescription in the logger.</p>}
            <Button asChild><Link href="/workout">Open workout logger</Link></Button>
          </> : <>
            {!r && state.selectionHint && <p role={state.hintUnavailable ? "alert" : "status"}>{state.hintUnavailable ? "The requested catalogue version is not currently available. No alternative has been selected." : "Review this freshly available version before explicitly starting. Saved generated approval is historical; the server rechecks admission at start."}</p>}
            {!r && available?.state === "available" && <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (selected) void controller.start(selected, Intl.DateTimeFormat().resolvedOptions().timeZone); }} aria-busy={state.busy}>
              <fieldset disabled={locked || controller.hasStartIntent()} className="min-w-0 space-y-4">
                <legend className="mb-3 text-xl font-semibold">Choose a reviewed workout</legend>
                {available.workouts.map(w => <label key={w.catalogue_version_id} className="flex min-w-0 items-start gap-3 rounded-[8px] border p-3"><input type="radio" name="workout" value={w.catalogue_version_id} checked={selected === w.catalogue_version_id} onChange={() => setSelected(w.catalogue_version_id)} required className="mt-1 h-5 w-5 shrink-0 focus-visible:outline focus-visible:outline-2" /><span className="min-w-0">{w.prescription_snapshot.prescription.title}<span className="block text-sm">Version {w.prescription_snapshot.content_version}</span></span></label>)}
                {available.workouts.filter(w => w.catalogue_version_id === selected).map(w => <Prescription key={w.catalogue_version_id} snapshot={w.prescription_snapshot} />)}
                <Button type="submit" disabled={!selected}>Start selected workout</Button>
              </fieldset>
            </form>}
            {!r && controller.hasStartIntent() && <div className="space-y-3"><p>The original start identity is retained. Check whether it was saved before retrying that same start.</p><div className="flex flex-wrap gap-3"><Button disabled={locked} onClick={() => void controller.reconcile()}>Check original start</Button><Button variant="outline" disabled={locked} onClick={() => void controller.retryStart()}>Retry original start</Button></div></div>}
            {!r && !controller.hasStartIntent() && <Button variant="outline" disabled={locked} onClick={() => void controller.load(new URLSearchParams(window.location.search).get("id") ?? undefined, undefined, new URLSearchParams(window.location.search).get("catalogue") ?? undefined)}>Retry loading workouts</Button>}
            {!r && state.recent.length > 0 && <section className="space-y-3"><h2 className="text-xl font-bold">Reopen a saved workout</h2><p className="text-sm text-muted-foreground">Up to 100 recent records. Opening a record keeps its original identity and prescription.</p><ul className="space-y-2">{state.recent.map(w => <li key={w.id}><Link className="block rounded-[8px] border p-3 underline focus-visible:outline focus-visible:outline-2" href={`/workout?id=${w.id}`}>{w.prescription_snapshot.prescription.title} · {w.performed_at} · {w.completed ? "Completed" : "Draft"}</Link></li>)}</ul></section>}
          </>}
          <p className="text-sm"><Link className="underline focus-visible:outline focus-visible:outline-2" href="/settings">Review saved information in Settings</Link>. Workout selection cannot supply missing professional review.</p>
        </>}
      </CardContent>
    </Card>
    {r && !compact && !state.signedOut && <div className="grid min-w-0 gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <Card className="min-w-0"><CardContent><Prescription snapshot={r.prescription_snapshot} historical /></CardContent></Card>
      <Card className="min-w-0"><CardHeader><h2 className="text-2xl font-bold">{r.completed ? "Completed record" : "Record your sets"}</h2><p>Load is always kg. Blank fields stay blank. Enter 0 only when that is the observed value. RPE is from 1 to 10.</p><p className="text-sm [overflow-wrap:anywhere]">Record {r.id} · Revision {r.revision} · Timezone {r.record_timezone}</p>{r.completed_at && <p>Completed at {r.completed_at}</p>}</CardHeader>
        <CardContent className="min-w-0 space-y-4">
          <form className="min-w-0 space-y-4" aria-busy={state.busy} noValidate onSubmit={e => { e.preventDefault(); void controller.save(); }}>
            {r.prescription_snapshot.prescription.exercises.map(ex => <fieldset key={ex.exercise_key} disabled={locked || r.completed} className="min-w-0 space-y-3 rounded-[8px] border bg-background p-3">
              <legend className="max-w-full px-1 text-lg font-semibold">{ex.exercise_name}</legend>
              {ex.duration_seconds !== null && <p className="text-sm">The prescription uses seconds. This logger records factual reps, kg and RPE; it does not record duration or convert seconds to reps.</p>}
              {r.exercise_set_logs.filter(s => s.exercise_key === ex.exercise_key).sort((a,b) => a.set_number - b.set_number).map(set => {
                const draft = state.drafts.find(s => s.id === set.id)!;
                return <fieldset key={set.id} className="min-w-0 border-t pt-3"><legend className="px-1 font-semibold">Set {set.set_number}</legend><div className="grid min-w-0 gap-3 sm:grid-cols-3">
                  {([['reps','Reps','numeric'],['weight','Load (kg)','decimal'],['rpe','RPE','decimal']] as const).map(([field,label,inputMode]) => <div key={field} className="min-w-0"><label htmlFor={`${set.id}-${field}`} className="mb-1 block text-sm font-semibold">{label}</label><Input id={`${set.id}-${field}`} name={`${set.id}-${field}`} type="text" inputMode={inputMode} autoComplete="off" value={draft[field]} onChange={e => controller.edit(set.id, field, e.target.value)} aria-describedby="workout-recording-bounds" /></div>)}
                </div></fieldset>;
              })}
            </fieldset>)}
            <p id="workout-recording-bounds" className="text-sm">Recording limits: whole reps 0–100, load 0–10000 kg, RPE 1–10. Decimals are supported for load and RPE. These limits are not training guidance.</p>
            {!r.completed && <div className="flex flex-wrap gap-3"><Button type="submit" disabled={locked || state.needsReconcile}>{state.busy ? "Working…" : "Save entries"}</Button><Button type="button" variant="outline" disabled={locked || dirty || state.needsReconcile} onClick={() => void controller.complete()}>Complete workout</Button></div>}
          </form>
          {state.needsReconcile && <p role="status">A write is not yet reconciled. Your entries are retained. Check saved values before retrying.</p>}
          <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={locked} onClick={() => void controller.reconcile()}>Check saved values</Button>{dirty && <Button variant="outline" disabled={locked} onClick={() => controller.useSaved()}>Discard local edits and use saved values</Button>}</div>
          {(dirty || state.needsReconcile) && <details className="min-w-0 rounded-[8px] border p-3"><summary className="cursor-pointer font-semibold">Compare last confirmed saved values</summary><ul className="mt-3 space-y-2">{r.exercise_set_logs.map(s => <li key={s.id}>{s.exercise_name}, set {s.set_number}: reps {s.reps ?? "blank"}, load {s.weight ?? "blank"} kg, RPE {s.rpe ?? "blank"}</li>)}</ul></details>}
        </CardContent>
      </Card>
    </div>}
  </div>;
}

export function WorkoutExperience({ userId, compact = false }: { userId?: string; compact?: boolean }) {
  const identity = useRef(userId);
  const [controller] = useState(() => {
    return new WorkoutController((...args) => fetch(...args), async () => {
      const { data, error } = await createClient().auth.getUser();
      if (error || !data.user) return false;
      if (identity.current === undefined) identity.current = data.user.id;
      return data.user.id === identity.current;
    }, intent => {
      const url = new URL(window.location.href);
      url.search = new URLSearchParams({ id: intent.id, version: intent.catalogue_version_id!, timezone: intent.timezone }).toString();
      window.history.replaceState(null, "", url);
    });
  });
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    controller.activate();
    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const client = createClient();
      subscription = client.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT" || (identity.current && session?.user.id !== identity.current)) controller.invalidate();
      }).data.subscription;
    } catch { /* The real load reports unavailable account configuration. */ }
    const query = new URLSearchParams(window.location.search);
    const id = compact ? undefined : query.get("id") ?? undefined;
    const intent = startWorkoutSchema.safeParse({ id, mode: "reviewed", timezone: query.get("timezone"), catalogue_version_id: query.get("version") });
    void controller.load(id, intent.success ? intent.data : undefined, compact ? undefined : query.get("catalogue") ?? undefined);
    return () => { subscription?.unsubscribe(); controller.dispose(); };
  }, [controller, userId, compact]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (isDirty(state.record, state.drafts)) event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [state.record, state.drafts]);
  return <WorkoutView state={state} controller={controller} compact={compact} />;
}
