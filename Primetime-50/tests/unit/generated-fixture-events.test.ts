// Node synthetic React event/transition checks only. No DOM/browser or Next
// router execution. Actual capture-phase keyboard qualification remains parent-owned.
import { beforeEach, expect, it, vi } from "vitest";
import type { MouseEvent } from "react";
const hooks=vi.hoisted(()=>({values:[] as unknown[],notices:[] as unknown[]}));
vi.mock("react",async original=>{
 const actual=await original<typeof import("react")>();
 return {...actual,useState:(initial:unknown)=>{const value=typeof initial==="function"?initial():initial;hooks.values.push(value);return [value,(next:unknown)=>hooks.notices.push(next)];},useEffect:()=>{},useSyncExternalStore:(_subscribe:unknown,get:()=>unknown)=>get()};
});
import { PilotFlowFixture, GeneratedFlowFixture, generatedFlowFixture } from "../fixtures/pilot-flow";
import { validProfile } from "../fixture";
import { WorkoutController } from "@/lib/client/workout";
import { savedGenerated } from "../fixtures/generated-consumer";

beforeEach(()=>{hooks.values=[];hooks.notices=[];});
function click(href:string,anchor=true){
 let prevented=false,stopped=false;
 const event={target:{closest:()=>anchor?{href}:null},currentTarget:{ownerDocument:{location:{origin:"http://localhost"}}},preventDefault:vi.fn(()=>{prevented=true;}),stopPropagation:vi.fn(()=>{stopped=true;})};
 return {event:event as unknown as MouseEvent<HTMLElement>,prevented:()=>prevented,stopped:()=>stopped,raw:event};
}
it.each([PilotFlowFixture,GeneratedFlowFixture])("%s captures an actual link activation before the simulated Next target and keeps its exact version transition",async Component=>{
 const element=Component();
 expect(element.props.onClickCapture).toBeTypeOf("function");
 const fixture=hooks.values[0] as ReturnType<typeof generatedFlowFixture>;await fixture.transport("/api/profile",{method:"POST",body:JSON.stringify(validProfile)});
 const w=hooks.values.find(v=>v instanceof WorkoutController) as WorkoutController;
 const spy=vi.spyOn(w,"load");const catalogue=savedGenerated().provenance.catalogue[0].catalogue_version_id;
 const activation=click(`http://localhost/workout?catalogue=${catalogue}`);const nextTarget=vi.fn();
 element.props.onClickCapture(activation.event);
 // React capture -> target -> bubble order; stopped capture prevents target.
 if(!activation.stopped())nextTarget();
 expect(activation.prevented()).toBe(true);expect(activation.stopped()).toBe(true);expect(nextTarget).not.toHaveBeenCalled();
 expect(spy).toHaveBeenCalledWith(undefined,undefined,catalogue);
 await vi.waitFor(()=>expect(w.state.selectionHint).toBe(catalogue));await vi.waitFor(()=>expect(w.state.busy).toBe(false));
 expect(w.state.hintUnavailable).toBe(false);expect(w.state.record).toBeNull();
 const id="71000000-0000-4000-8000-000000000088";
 element.props.onClickCapture(click(`http://localhost/workout?id=${id}`).event);expect(spy).toHaveBeenLastCalledWith(id,undefined,undefined);
});
it.each([PilotFlowFixture,GeneratedFlowFixture])("%s denies foreign and unknown fixture links before target navigation while leaving nonlinks alone",Component=>{
 const element=Component();expect(element.props.onClickCapture).toBeTypeOf("function");
 for(const href of ["https://foreign.invalid/workout?catalogue=anything","http://localhost/unknown","javascript:alert(1)"]){
  const event=click(href);element.props.onClickCapture(event.event);expect(event.prevented()).toBe(true);expect(event.stopped()).toBe(true);
 }
 expect(hooks.notices.filter(n=>typeof n==="string"&&n.includes("TEST DATA ONLY"))).toHaveLength(3);
 const ordinary=click("http://localhost",false);element.props.onClickCapture(ordinary.event);expect(ordinary.raw.preventDefault).not.toHaveBeenCalled();expect(ordinary.raw.stopPropagation).not.toHaveBeenCalled();
});
it("synthetic progression reflects exact owned completion, screening revocation and recovery without approved adaptive rules",async()=>{
 const f=generatedFlowFixture();
 const status=async()=>(await (await f.transport("/api/ai/plan")).json()).progression;
 const rules=["approved_progression_rules","approved_recovery_rules"];
 const expected=(evidence_state:string,screening_state:string,missing_prerequisites:string[],evidence:unknown[]=[])=>({adaptation:"unavailable",evidence_state,screening_state,missing_prerequisites,evidence});
 expect(await status()).toEqual(expected("none","unsupported",[...rules,"completed_records","screening_review"]));
 await f.transport("/api/profile",{method:"POST",body:JSON.stringify(validProfile)});
 expect(await status()).toEqual(expected("none","available",[...rules,"completed_records"]));
 const w=new WorkoutController(f.transport,f.verify,()=>{});await w.load();await w.start(savedGenerated().provenance.catalogue[0].catalogue_version_id,"UTC");
 w.state.drafts.forEach(s=>{w.edit(s.id,"reps","8");w.edit(s.id,"weight","10");w.edit(s.id,"rpe","6");});await w.save();await w.complete();
 const r=w.state.record!;expect(r.completed).toBe(true);const refs=[{id:r.id,performed_at:r.performed_at,catalogue_version_id:r.catalogue_version_id}];
 expect(await status()).toEqual(expected("available","available",rules,refs));
 f.revoke();expect(await status()).toEqual(expected("available","unavailable",[...rules,"screening_review"],refs));
 f.revoke();expect(await status()).toEqual(expected("available","available",rules,refs));
 f.failRead();expect((await f.transport("/api/ai/plan")).status).toBe(503);expect(await status()).toEqual(expected("available","available",rules,refs));
});
