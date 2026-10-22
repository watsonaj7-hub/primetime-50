"use client";
import Link from "next/link";
import { useEffect,useRef,useState,useSyncExternalStore } from "react";
import { Card,CardContent,CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import { NutritionController,type NutritionState } from "@/lib/client/nutrition";
import { dateInZone } from "@/lib/nutrition/records";

// Exported production view permits a synthetic, provider-free rendered fixture.
export function NutritionView({state:s,controller:c}:{state:NutritionState;controller:NutritionController}){
 const [day,setDay]=useState(s.day),[zone,setZone]=useState(s.timezone);
 const [confirmDelete,setConfirmDelete]=useState<string|null>(null);
 const form=useRef<HTMLDivElement>(null),draft=s.draft;
 const draftId=draft?.id;
 useEffect(()=>{setDay(s.day);setZone(s.timezone);setConfirmDelete(null);},[s.day,s.timezone]);
 useEffect(()=>{if(draftId)form.current?.querySelector<HTMLInputElement>("input")?.focus();},[draftId]);
 const blocked=s.busy||s.status==="signedOut";
 return <div className="min-w-0 space-y-6 break-words [overflow-wrap:anywhere]">
  <Card><CardHeader><h1 className="text-3xl font-bold">Nutrition log</h1><p className="text-muted-foreground">Record your meals, protein and water. These are your records, without personalised targets or recommendations.</p></CardHeader>
   <CardContent className="space-y-4" aria-busy={s.busy}>
    <p className="text-sm text-muted-foreground" id="nutrition-date-policy">Each entry belongs to its saved calendar date and IANA timezone. Totals include only the selected date and timezone, from midnight to the next midnight there, including daylight saving changes. Changing your device timezone does not move saved entries. Protein uses grams (g), water uses millilitres (mL).</p>
    <form className="grid items-end gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void c.load(day,zone);}} aria-describedby="nutrition-date-policy">
     <label className="min-w-0 space-y-1" htmlFor="nutrition-day"><span>Date</span><Input id="nutrition-day" type="date" min="1900-01-01" max="2100-12-31" required value={day} onChange={e=>setDay(e.target.value)} disabled={blocked||!!draft||!!s.pending}/></label>
     <label className="min-w-0 space-y-1" htmlFor="nutrition-zone"><span>Timezone</span><Input id="nutrition-zone" required maxLength={100} value={zone} placeholder="Australia/Melbourne" onChange={e=>setZone(e.target.value)} disabled={blocked||!!draft||!!s.pending}/></label>
     <Button variant="outline" disabled={blocked||!!draft||!!s.pending} type="submit">Show saved day</Button>
    </form>
    <p role="status" aria-live="polite">{s.message}</p>
    {s.delayed&&<p role="status">Still waiting for the saved records. Your input is retained; avoid submitting another change.</p>}
    {s.error&&<p role="alert">{s.error}</p>}
    {s.status==="signedOut"?<Button asChild><Link href="/login?next=/app/nutrition">Sign in to view nutrition</Link></Button>:<div className="flex flex-wrap gap-3">
     <Button variant="outline" disabled={s.busy} onClick={()=>void c.load(s.day,s.timezone)}>Reload saved entries</Button>
     {s.pending&&<Button disabled={s.busy} onClick={()=>void c.retry()}>Retry same change</Button>}
     {s.acknowledged&&s.saved&&<Button variant="outline" disabled={s.busy} onClick={()=>c.useCurrentSaved()}>Use current saved entries and discard local input</Button>}
    </div>}
    {s.pending&&<p>The result of this change is not fully confirmed. Retry keeps its original identity and cannot add it twice. Inputs are locked until confirmed. If you leave this page, reload and inspect saved entries before entering anything again.</p>}
    {s.saved&&<section aria-label="Saved daily totals" className="grid gap-4 sm:grid-cols-2">
     <div className="rounded-[8px] bg-background p-4"><h2 className="font-semibold">Saved protein (g)</h2><p className="text-3xl font-bold">{s.saved.totals.protein_tenths/10}</p></div>
     <div className="rounded-[8px] bg-background p-4"><h2 className="font-semibold">Saved water (mL)</h2><p className="text-3xl font-bold">{s.saved.totals.water_ml}</p></div>
     <p className="sm:col-span-2 text-sm">{s.saved.day} · {s.saved.timezone} · {s.saved.entries.length} saved entries. Totals sum the entries shown below.</p>
    </section>}
   </CardContent>
  </Card>
  {s.status!=="signedOut"&&<Card><CardHeader><h2 className="text-2xl font-bold">Meal and water entries</h2><p className="text-muted-foreground">Enter what you want to record. Protein can be zero; blank protein is not saved as zero.</p></CardHeader><CardContent className="space-y-4">
   <div className="flex flex-wrap gap-3"><Button disabled={blocked||!!draft||!!s.pending||s.status!=="ready"} onClick={()=>c.newEntry("meal")}>Add meal</Button><Button disabled={blocked||!!draft||!!s.pending||s.status!=="ready"} onClick={()=>c.newEntry("water")}>Add water</Button></div>
   {/* Stable labels are also visible while the initial owned read is loading. */}
   <p className="text-sm text-muted-foreground">Meal description · Protein (g) · Water (mL)</p>
   {draft&&<div ref={form} className="rounded-[8px] border p-4"><form className="grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void c.save();}}>
    <h3 className="sm:col-span-2 text-xl font-bold">{draft.existing?"Edit":"New"} {draft.kind=== "meal"?"meal":"water entry"}</h3>
    {draft.kind==="meal"&&<label className="space-y-1 sm:col-span-2" htmlFor="entry-description"><span>Meal description</span><Input id="entry-description" required maxLength={300} value={draft.description} disabled={blocked||!!s.pending} onChange={e=>c.edit("description",e.target.value)}/></label>}
    <label className="space-y-1" htmlFor="entry-amount"><span>{draft.kind==="meal"?"Protein (g)":"Water (mL)"}</span><Input id="entry-amount" required inputMode={draft.kind==="meal"?"decimal":"numeric"} aria-describedby="entry-precision" value={draft.amount} disabled={blocked||!!s.pending} onChange={e=>c.edit("amount",e.target.value)}/></label>
    <p id="entry-precision" className="self-center text-sm text-muted-foreground">{draft.kind==="meal"?"Use grams with up to one decimal place, including zero.":"Use whole millilitres, greater than zero."}</p>
    <label className="space-y-1" htmlFor="entry-day"><span>Entry date</span><Input id="entry-day" type="date" required min="1900-01-01" max="2100-12-31" value={draft.logged_on} disabled={blocked||!!s.pending} onChange={e=>c.edit("logged_on",e.target.value)}/></label>
    <label className="space-y-1 min-w-0" htmlFor="entry-zone"><span>Entry timezone</span><Input id="entry-zone" required maxLength={100} value={draft.timezone} disabled={blocked||!!s.pending} onChange={e=>c.edit("timezone",e.target.value)}/></label>
    <p className="sm:col-span-2 text-sm">Changing the entry date or timezone moves it to that saved day’s totals. The current day will be reloaded after saving.</p>
    <div className="sm:col-span-2 flex flex-wrap gap-3"><Button type="submit" disabled={blocked||!!s.pending}>Save {draft.kind=== "meal"?"meal":"water"}</Button><Button type="button" variant="outline" disabled={blocked||!!s.pending} onClick={()=>c.cancel()}>Discard unsaved changes</Button></div>
   </form></div>}
   {s.saved?.entries.length===0&&<p>No entries saved for this date and timezone. Add a meal or water entry to begin.</p>}
   {s.saved&&<ul aria-label="Saved nutrition entries" className="space-y-3">{s.saved.entries.map(e=><li key={e.id} className="min-w-0 rounded-[8px] border bg-background p-4">
    <h3 className="font-semibold">{e.kind==="meal"?e.description:"Water"}</h3><p>{e.kind==="meal"?`${e.protein_tenths/10} g protein`:`${e.water_ml} mL water`}</p><p className="text-sm text-muted-foreground">{e.logged_on} · {e.timezone} · Saved revision {e.revision}</p>
    <div className="mt-3 flex flex-wrap gap-3"><Button variant="outline" disabled={blocked||!!draft||!!s.pending} aria-label={`Edit ${e.kind} entry ${e.id}`} onClick={()=>c.open(e.id)}>Edit</Button><Button variant="outline" disabled={blocked||!!draft||!!s.pending} aria-label={`Delete ${e.kind} entry ${e.id}`} onClick={()=>setConfirmDelete(e.id)}>Delete</Button></div>
    {confirmDelete===e.id&&<div className="mt-3 space-y-3"><p>Delete this saved entry? This removes it from its saved day’s totals.</p><div className="flex flex-wrap gap-3"><Button disabled={blocked||!!draft||!!s.pending} onClick={()=>{setConfirmDelete(null);void c.remove(e.id);}}>Confirm delete</Button><Button variant="outline" onClick={()=>setConfirmDelete(null)}>Keep entry</Button></div></div>}
   </li>)}</ul>}
  </CardContent></Card>}
 </div>;
}
export function NutritionPanel({userId}:{userId?:string}={}){
 const identity=useRef(userId),[lifecycle]=useState(()=>({generation:0}));
 const [controller]=useState(()=>new NutritionController((...args)=>fetch(...args),async()=>{
  const generation=lifecycle.generation;const {data,error}=await createClient().auth.getUser();
  if(generation!==lifecycle.generation||error||!data.user)return false;
  if(identity.current===undefined)identity.current=data.user.id;return identity.current===data.user.id;
 }));
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 useEffect(()=>{
  lifecycle.generation++;identity.current=userId;controller.activate();let subscription:{unsubscribe:()=>void}|undefined;
  try{subscription=createClient().auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"||(identity.current!==undefined&&session?.user.id!==identity.current)){lifecycle.generation++;controller.invalidate();}}).data.subscription;}catch{/* Load reports actual unavailable configuration. */}
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";
  void controller.load(dateInZone(new Date(),zone),zone);
  return()=>{lifecycle.generation++;subscription?.unsubscribe();controller.dispose();};
 },[controller,lifecycle,userId]);
 return <NutritionView state={state} controller={controller}/>;
}
