"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProgressChart } from "@/components/progress-chart";
import { createClient } from "@/lib/supabase/browser";
import { HistoryController, type HistoryState } from "@/lib/client/history";
import { historyGroups, recordTime, type HistoryRecord } from "@/lib/history/records";

function SavedDetails({ record: r, open = false }: { record: HistoryRecord; open?: boolean }) {
  return <details open={open} className="min-w-0 rounded-[8px] border bg-background p-3 [overflow-wrap:anywhere]">
    <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Saved sets and provenance · {r.id}</summary>
    <div className="mt-4 space-y-4">
      <p>Performed: <time dateTime={r.performed_at}>{recordTime(r)}</time></p>
      <p>Completed: <time dateTime={r.completed_at!}>{recordTime(r, true)}</time></p>
      <p>Mode: {r.record_mode === "personal" ? "Personal recording, no prescribed workout" : "Reviewed workout, original saved prescription"}. Revision {r.revision}.</p>
      <ul aria-label={`Original recorded sets for ${r.id}`} className="space-y-3">
        {r.exercise_set_logs.map(s => <li key={s.id} className="rounded-[8px] border p-3"><h4 className="font-semibold">{s.exercise_name} · Set {s.set_number}</h4><dl className="grid grid-cols-3 gap-2"><div><dt>Reps</dt><dd>{s.reps ?? "Not recorded"}</dd></div><div><dt>Load (kg)</dt><dd>{s.weight ?? "Not recorded"}</dd></div><div><dt>RPE</dt><dd>{s.rpe ?? "Not recorded"}</dd></div></dl><p className="mt-2 text-sm text-muted-foreground">Exercise key: {s.exercise_key}<br />Set ID: {s.id}</p></li>)}
      </ul>
      {r.record_mode === "reviewed" ? <>
        <details className="space-y-3"><summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2">Original prescription and approval provenance</summary>
          <p className="mt-3">Historical snapshot only; this does not confirm current eligibility or approval.</p>
          <dl className="space-y-2 text-sm">{Object.entries({ "Title": r.prescription_snapshot.prescription.title, "Catalogue version": r.catalogue_version_id, "Content": `${r.prescription_snapshot.content_id} · ${r.prescription_snapshot.content_version}`, "Rule version": r.prescription_snapshot.rule_version, "Source": r.prescription_snapshot.source_uri, "Approval at start": `${r.prescription_snapshot.approval_status_at_start}: ${r.prescription_snapshot.reviewer_name}, ${r.prescription_snapshot.reviewer_role}, ${r.prescription_snapshot.approved_at}`, "Contract": r.prescription_snapshot.contract_version, "Session minutes": r.prescription_snapshot.prescription.session_minutes,
          "Screening": r.prescription_snapshot.prescription.screening_rules, "Referral": r.prescription_snapshot.prescription.referral_rules, "Stop rules": r.prescription_snapshot.prescription.stop_rules, "Progression": r.prescription_snapshot.prescription.progression_rules, "Measurement": r.prescription_snapshot.prescription.measurement }).map(([label,value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>)}</dl>
          <ul className="space-y-3">{r.prescription_snapshot.prescription.exercises.map(e => <li key={e.exercise_key} className="rounded-[8px] border p-3"><h4 className="font-semibold">{e.exercise_name}</h4><p>{e.sets} prescribed sets · {e.reps !== null ? `${e.reps} reps` : `${e.duration_seconds} seconds`} · Rest {e.rest_seconds} seconds</p><p>No conversion from seconds to observed reps is made.</p><p>Load: {e.load_guidance}</p><p>RPE: {e.rpe_guidance}</p><p>Cues: {e.cues}</p><p>Stop rules: {e.stop_rules}</p><p>Equipment: {e.equipment.join(", ") || "None listed"}</p><p>Exclusions: {e.exclusions.join(", ") || "None listed"}</p></li>)}</ul>
        </details>
        <Link className="inline-block font-semibold underline focus-visible:outline focus-visible:outline-2" href={`/workout?id=${r.id}`}>Open original workout in logger</Link>
      </> : <p>Personal records reopen here as read-only saved details. The reviewed-workout logger does not edit personal records. No prescription has been substituted.</p>}
      <Link className="inline-block font-semibold underline focus-visible:outline focus-visible:outline-2" href={`/progress?id=${r.id}`}>Permanent link to saved session {r.id}</Link>
    </div>
  </details>;
}
export function HistoryView({ state, retry, compact = false }: { state: HistoryState; retry: () => void; compact?: boolean }) {
  const ready = state.status === "ready";
  const records = compact ? state.records.slice(0,3) : state.records;
  return <div className="min-w-0 space-y-6 break-words [overflow-wrap:anywhere]">
    <Card className="min-w-0"><CardHeader><h2 className="text-2xl font-bold">Workout history</h2><p className="text-muted-foreground">Your saved completed sessions, with original observed sets.</p></CardHeader>
      <CardContent className="min-w-0 space-y-4" aria-busy={state.status === "loading"}>
        {state.status === "loading" && <p role="status">Loading owned workout history…</p>}
        {state.status === "error" && <p role="alert">{state.error}</p>}
        {state.status === "signedOut" && <><p role="status">Your session changed. History has been cleared. Sign in and reload to view your records.</p><Button asChild><Link href="/login?next=/progress">Sign in to view history</Link></Button></>}
        {ready && <>
          <p role="status">{state.records.length === 0 ? "No completed workouts in this history window. Complete and save a workout to see its original sets here." : `${state.records.length} completed ${state.records.length === 1 ? "session" : "sessions"} in the latest 100-record window.`}</p>
          <p className="text-sm text-muted-foreground">Latest 100 completed personal and reviewed sessions, ordered by performed instant then record ID, newest first. Dates use each session’s stored timezone, never your current device zone. Groups are ordered by their newest session.</p>
          {state.selected && <section aria-label="Selected original session" className="space-y-3"><h3 className="text-xl font-bold">Selected original session</h3><SavedDetails record={state.selected} open /></section>}
          {historyGroups(records.filter(r => r.id !== state.selected?.id)).map(group => <section key={group.key} className="min-w-0 space-y-3"><h3 className="text-lg font-bold">{group.day} · {group.zone}</h3><ul className="min-w-0 space-y-3">{group.records.map(r => <li key={r.id}><SavedDetails record={r} /></li>)}</ul></section>)}
          {compact && state.records.length > 3 && <p>Showing the latest 3 sessions here.</p>}
        </>}
        <div className="flex flex-wrap gap-3">
          {state.status !== "signedOut" && <Button variant="outline" disabled={state.status === "loading"} onClick={retry}>Reload history</Button>}
          <Button asChild variant="outline"><Link href="/workout">Open workout logger</Link></Button>
          {compact && <Button asChild variant="outline"><Link href="/progress">View full history</Link></Button>}
        </div>
      </CardContent>
    </Card>
    {ready && !compact && <ProgressChart records={state.records} />}
  </div>;
}
export function HistoryExperience({ userId, compact = false }: { userId?: string; compact?: boolean }) {
  const identity = useRef(userId);
  const [lifecycle] = useState(() => ({ generation: 0 }));
  const [controller] = useState(() => new HistoryController((...args) => fetch(...args), async () => {
    const started = lifecycle.generation;
    const { data, error } = await createClient().auth.getUser();
    if (started !== lifecycle.generation || error || !data.user) return false;
    if (identity.current === undefined) identity.current = data.user.id;
    return identity.current === data.user.id;
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const selectedId = () => compact ? undefined : new URLSearchParams(window.location.search).get("id") ?? undefined;
  useEffect(() => {
    lifecycle.generation++;
    identity.current = userId;
    controller.activate();
    let subscription: { unsubscribe: () => void } | undefined;
    try {
      subscription = createClient().auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT" || (identity.current !== undefined && session?.user.id !== identity.current)) { lifecycle.generation++; controller.invalidate(); }
      }).data.subscription;
    } catch { /* Real load reports unavailable configuration as an error. */ }
    const id = compact ? undefined : new URLSearchParams(window.location.search).get("id") ?? undefined;
    void controller.load(id);
    return () => { lifecycle.generation++; subscription?.unsubscribe(); controller.dispose(); };
  }, [controller, userId, compact, lifecycle]);
  return <HistoryView state={state} retry={() => void controller.load(selectedId())} compact={compact} />;
}
