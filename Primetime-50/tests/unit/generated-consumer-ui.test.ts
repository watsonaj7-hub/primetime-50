import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn()}));
import { GeneratedView } from "@/components/workout/generated-experience";
import { GeneratedController } from "@/lib/client/generated-workout";
import { decodeGeneratedRecord } from "@/lib/ai/generated-records";
import { savedGenerated, noProgression } from "../fixtures/generated-consumer";
import CoachPage from "@/app/coach/page";
it("wires the real coach route to the production consumer without chat",()=>{
 const html=renderToStaticMarkup(createElement("main",null,CoachPage().props.children));
 expect(html).toContain("Saved generated plans");expect(html).not.toMatch(/<textarea|Send to coach|AI coach chat/);
});
it("renders every frozen prescription field, relative slots and separate historical generation/content provenance",()=>{
 const raw=savedGenerated();const p=raw.provenance.catalogue[0].prescription;
 p.exercises.push({...p.exercises[0],exercise_key:"71000000-0000-4000-8000-000000000099",exercise_name:"TEST duration",reps:null,duration_seconds:35,exclusions:["TEST exclusion"]});
 raw.provenance.source_uri="javascript:TEST untrusted URI";
 const c=new GeneratedController(fetch,async()=>true);const plan=decodeGeneratedRecord(raw);
 const html=renderToStaticMarkup(createElement(GeneratedView,{controller:c,state:{...c.state,status:"ready",plans:[plan],progression:noProgression}}));
 for(const s of ["Week 1 / Day 1","TEST screening","TEST referral","TEST stop","TEST progression","TEST measurement","TEST load","TEST effort","TEST cues","TEST equipment","TEST exclusion","35 seconds per set","Rest 30 seconds","2 sets","TEST reps","20 minutes","Generation provenance","TEST policy reviewer","TEST policy rule","TEST model","TEST ONLY NOT A REAL REVIEWER","TEST-v1","TEST-r1",plan.request_id,plan.provenance.activation_id,"17","Historical saved content","not current clearance","not linked to generated schedule slots","does not record duration or convert seconds to reps"])expect(html).toContain(s);
 expect(html).toContain(`href="/workout?catalogue=${plan.provenance.catalogue[0].catalogue_version_id}"`);
 expect(html).toContain("Review this version in workout logger"); expect(html).not.toContain('href="javascript:');
 expect(html).not.toContain("Today’s");expect(html).not.toContain("Start selected workout");
});
it.each(["loading","error","signedOut"] as const)("shows informative %s without stale actionable plans",status=>{
 const c=new GeneratedController(fetch,async()=>true);
 const html=renderToStaticMarkup(createElement(GeneratedView,{controller:c,state:{...c.state,status,plans:[decodeGeneratedRecord(savedGenerated())],error:status==="error"?"Unable to confirm":""}}));
 expect(html).not.toContain("TEST reps");expect(html).not.toContain("Review this version in workout logger");expect(html).toContain('href="/workout"');
 if(status==="error")expect(html).toContain('role="alert"');if(status==="signedOut")expect(html).toContain("Sign in again");
});
it("shows progress references and missing prerequisites without claiming adaptive prescription changes",()=>{
 const c=new GeneratedController(fetch,async()=>true);const raw=savedGenerated();
 const html=renderToStaticMarkup(createElement(GeneratedView,{controller:c,state:{...c.state,status:"ready",progression:{...noProgression,evidence_state:"available",evidence:[{id:raw.id,performed_at:raw.created_at,catalogue_version_id:null}],screening_state:"referral_required"}}}));
 for(const s of ["Automatic progression is unavailable","Professional screening review is required","Approved progression rules are missing","Approved recovery rules are missing",raw.id])expect(html).toContain(s);
 expect(html).toContain(`/progress?id=${raw.id}`);expect(html).not.toContain("2.5%");
});
it.each(["review_required","limit","in_progress","unavailable","unconfirmed"] as const)("reports %s generation outcome and retains the original request",outcome=>{
 const c=new GeneratedController(fetch,async()=>true);const html=renderToStaticMarkup(createElement(GeneratedView,{controller:c,state:{...c.state,status:"error",outcome,requestId:savedGenerated().request_id,error:"Unable to confirm"}}));
 expect(html).toContain(savedGenerated().request_id);expect(html).toContain("Check original generation request");expect(html).toContain("Retry original generation request");expect(html).not.toContain("TEST reps");
});
it("escapes hostile text and wraps long provenance without creating executable links",()=>{
 const raw=savedGenerated();raw.provenance.catalogue[0].prescription.title='<script>TEST hostile</script>';raw.provenance.source_uri="javascript:"+"x".repeat(1000);
 const c=new GeneratedController(fetch,async()=>true);const html=renderToStaticMarkup(createElement(GeneratedView,{controller:c,state:{...c.state,status:"ready",plans:[decodeGeneratedRecord(raw)]}}));
 expect(html).toContain("&lt;script&gt;TEST hostile&lt;/script&gt;");expect(html).not.toContain("<script>");expect(html).not.toContain('href="javascript:');expect(html).toContain("overflow-wrap:anywhere");
});
