"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/browser";
import { GeneratedController, type GeneratedState } from "@/lib/client/generated-workout";
import { resolveGeneratedSession } from "@/lib/ai/generated-records";
import { Prescription } from "./prescription";
const outcomes = {
  review_required: "Generation requires professional health review. No plan was created.",
  limit: "Generation limit reached. No new plan was created.",
  in_progress: "The original generation request is still being processed. Check it before retrying.",
  unavailable: "Generation or saved-plan storage is unavailable. No provisional plan is shown.",
  unconfirmed: "The request outcome is unconfirmed. Keep the original request identity."
};
const screening = {
  available: "Reviewed selection is available for your saved information. This is not health clearance.",
  unavailable: "Approved content or supported screening rules are unavailable.",
  unsupported: "Saved screening information is unsupported. Review your profile in Settings.",
  referral_required: "Professional screening review is required before workout selection.",
  unconfirmed: "Screening could not be checked. No readiness is inferred."
};
const prerequisites = {
  completed_records: "Completed workout records are missing.", record_storage: "Completed-record storage could not be confirmed.",
  screening_review: "Screening review remains unresolved.", approved_progression_rules: "Approved progression rules are missing.", approved_recovery_rules: "Approved recovery rules are missing."
};
export function GeneratedView({ state, controller }: { state: GeneratedState; controller: GeneratedController }) {
  const feedback=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(state.error)feedback.current?.focus();},[state.error]);
  const p=state.progression;
  return <div className="min-w-0 space-y-6 break-words [overflow-wrap:anywhere]">
    <Card className="min-w-0"><CardHeader><h2 className="text-2xl font-bold">Saved generated plans</h2><p className="text-muted-foreground">Relative weeks and days from saved reviewed-content selections. No calendar dates, active-plan status or current clearance are inferred.</p></CardHeader>
      <CardContent className="space-y-4" aria-busy={state.busy}>
        <p role="status" aria-live="polite">{state.message}</p>
        <div ref={feedback} tabIndex={-1} role={state.error ? "alert" : undefined} className="rounded-[8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{state.error}</div>
        {state.outcome && <p role="status">{outcomes[state.outcome]}</p>}
        {state.status==="signedOut" ? <Button asChild><Link href="/login?next=/coach">Sign in again</Link></Button> : <>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" disabled={state.busy} onClick={()=>void controller.load()}>Reload saved generated plans</Button>
            {!state.requestId && <Button disabled={state.busy} onClick={()=>void controller.generate()}>Request a generated plan</Button>}
          </div>
          <p className="text-sm text-muted-foreground">Generation requires approved content, supported saved information, provider activation and available limits. Reading saved plans does not call the provider. No general chat is provided.</p>
          {state.requestId && <div className="space-y-3 rounded-[8px] border p-3">
            <p>Original generation request: {state.requestId}</p>
            <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={state.busy} onClick={()=>void controller.reconcile()}>Check original generation request</Button>
              {!state.reconciled && <Button variant="outline" disabled={state.busy} onClick={()=>void controller.generate()}>Retry original generation request</Button>}
              {state.reconciled && <Button variant="outline" disabled={state.busy} onClick={()=>controller.newRequest()}>Begin another generation request</Button>}
            </div>
            <p className="text-sm">An unconfirmed write retains its original identity. Retry uses that identity; a different request is offered only after a saved result is confirmed.</p>
          </div>}
        </>}
        <div className="flex flex-wrap gap-3"><Link className="underline focus-visible:outline focus-visible:outline-2" href="/workout">View reviewed workouts</Link><Link className="underline focus-visible:outline focus-visible:outline-2" href="/progress">Open workout history</Link><Link className="underline focus-visible:outline focus-visible:outline-2" href="/settings">Review saved profile</Link></div>
        <p className="text-sm">Workout logs are not linked to generated schedule slots. Review the selected version in the logger; starting rechecks current admission and does not mark a generated slot completed.</p>
      </CardContent>
    </Card>
    {state.status==="ready" && <>
      {state.plans.length===0 && <p>No saved generated plans were found in this read. Up to 20 recent plans are shown.</p>}
      {state.plans.map(plan=><Card key={plan.id} className="min-w-0"><CardHeader><h2 className="text-xl font-bold">Saved plan {plan.id}</h2><p>Saved at {plan.created_at}. Historical record; no current approval is asserted.</p></CardHeader><CardContent className="min-w-0 space-y-6">
        <section aria-label="Generation provenance" className="space-y-2 text-sm"><h3 className="text-lg font-bold">Generation provenance</h3>
          <p>Request {plan.request_id} · Source {plan.provenance.source} · Contract {plan.provenance.contract_version} · Context revision {plan.provenance.context_revision}</p>
          <p>Policy {plan.policy_version_id} · Rule {plan.provenance.rule_version}</p>
          <p>Recorded approval: {plan.provenance.reviewer_name}, {plan.provenance.reviewer_role} · {plan.provenance.approved_at}</p>
          <p>Source: {plan.provenance.source_uri}</p><p>Recorded activation {plan.provenance.activation_id} · Model {plan.provenance.model} · Reserved microUSD {plan.provenance.reserved_microusd}</p>
          <p>Recorded selection rules, not current adaptive guidance:</p><ul>{plan.provenance.rules.weeks.map((rule,i)=><li key={i}>Week {i+1}: catalogue IDs {rule.catalogue_ids.join(", ")} · Sessions {rule.min_sessions}–{rule.max_sessions} · Rest days {rule.rest_days}</li>)}</ul>
        </section>
        {plan.selection.weeks.map((week,i)=><div key={i} className="space-y-6">{week.sessions.map(slot=>{
          const content=resolveGeneratedSession(plan,slot.catalogue_version_id);
          return <section key={slot.day} className="min-w-0 space-y-4 rounded-[8px] border p-3" aria-label={`Week ${i+1} / Day ${slot.day}`}>
            <h3 className="text-xl font-bold">Week {i+1} / Day {slot.day}</h3><p className="text-sm">Frozen catalogue version {content.catalogue_version_id}</p>
            <Prescription snapshot={content} generated />
            {content.prescription.exercises.some(e=>e.duration_seconds!==null) && <p className="text-sm">The prescription uses seconds. This logger records factual reps, kg and RPE; it does not record duration or convert seconds to reps.</p>}
            <Button asChild variant="outline"><Link href={`/workout?catalogue=${content.catalogue_version_id}`}>Review this version in workout logger</Link></Button>
          </section>;
        })}</div>)}
      </CardContent></Card>)}
    </>}
    <Card className="min-w-0"><CardHeader><h2 className="text-2xl font-bold">Automatic progression is unavailable</h2></CardHeader><CardContent className="space-y-3">
      <p>Saved history is descriptive evidence. It does not change the next prescription. Austin must approve progression and recovery rules before adaptation can be implemented.</p>
      {p ? <>
        <p>{screening[p.screening_state]}</p>
        <p>{p.evidence_state==="unavailable" ? "Completed-record storage is unavailable; this is not an empty history." : p.evidence_state==="none" ? "No owned completed records were found." : "Evidence references from up to 100 owned completed records:"}</p>
        <ul className="space-y-2">{p.evidence.map(e=><li key={e.id}><Link className="underline focus-visible:outline focus-visible:outline-2" href={`/progress?id=${e.id}`}>Saved session {e.id}</Link> · {e.performed_at}{e.catalogue_version_id && <> · Reviewed version {e.catalogue_version_id}</>}</li>)}</ul>
        <ul>{p.missing_prerequisites.map(key=><li key={key}>{prerequisites[key]}</li>)}</ul>
      </> : <p>Owned completed evidence and screening have not been confirmed. No readiness or performance values are inferred.</p>}
    </CardContent></Card>
  </div>;
}
export function GeneratedExperience() {
  const identity=useRef<string | undefined>(undefined);
  const [controller]=useState(()=>new GeneratedController((...args)=>fetch(...args),async()=>{
    const {data,error}=await createClient().auth.getUser();
    if(error || !data.user)return false;
    if(identity.current===undefined)identity.current=data.user.id;
    return identity.current===data.user.id;
  },id=>{const url=new URL(window.location.href);if(id)url.searchParams.set("request_id",id);else url.searchParams.delete("request_id");window.history.replaceState(null,"",url);}));
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  useEffect(()=>{
    controller.activate(); let subscription: {unsubscribe:()=>void}|undefined;
    try { subscription=createClient().auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT" || (identity.current && session?.user.id!==identity.current))controller.invalidate();}).data.subscription; } catch { /* Controller reports unavailable configuration. */ }
    void controller.load(new URLSearchParams(window.location.search).get("request_id")??undefined);
    return ()=>{subscription?.unsubscribe();controller.dispose();};
  },[controller]);
  return <GeneratedView controller={controller} state={state}/>;
}
