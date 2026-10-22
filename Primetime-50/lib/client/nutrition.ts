import { z } from "zod";
import { nutritionId,nutritionMutation,nutritionQuery,type NutritionMutation,type NutritionEntry } from "@/lib/validation/nutrition";
import { decodeDay,proteinTenths,waterMl,type NutritionDay } from "@/lib/nutrition/records";
export type NutritionDraft={ id:string; kind:"meal"|"water"; description:string; amount:string; logged_on:string; timezone:string; revision:number; existing:boolean };
export type NutritionState={ status:"loading"|"ready"|"error"|"signedOut"; busy:boolean; delayed:boolean; day:string; timezone:string; saved:NutritionDay|null; draft:NutritionDraft|null; pending:NutritionMutation|null; acknowledged:boolean; error:string; message:string };
const initial=():NutritionState=>({status:"loading",busy:false,delayed:false,day:"",timezone:"",saved:null,draft:null,pending:null,acknowledged:false,error:"",message:"Loading saved nutrition entries…"});
class RequestError extends Error {constructor(public status:number,message:string){super(message);}}
export class NutritionController {
 state=initial();private epoch=0;private active=true;private listeners=new Set<()=>void>();
 constructor(private fetcher:typeof fetch,private verifyIdentity:()=>Promise<boolean>){}
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};getSnapshot=()=>this.state;
 private update(p:Partial<NutritionState>){this.state={...this.state,...p};this.listeners.forEach(f=>f());}
 activate=()=>{this.epoch++;this.active=true;this.update(initial());};
 invalidate=()=>{this.epoch++;this.active=false;this.update({...initial(),status:"signedOut",message:"Your session changed. Entries and drafts have been cleared. Sign in and reload."});};
 dispose=()=>{this.epoch++;this.active=false;this.state=initial();};
 private current(epoch:number){return this.active&&epoch===this.epoch;}
 private assert(epoch:number){if(!this.current(epoch))throw new Error("Stale nutrition operation.");}
 private async identity(epoch:number){this.assert(epoch);const valid=await this.verifyIdentity();this.assert(epoch);if(!valid){this.invalidate();throw new Error("Please sign in again.");}}
 private async request(epoch:number,url:string,payload?:NutritionMutation):Promise<unknown>{
  await this.identity(epoch);
  const r=await this.fetcher(url,{method:payload?"POST":"GET",cache:"no-store",credentials:"same-origin",headers:payload?{"Content-Type":"application/json"}:undefined,body:payload?JSON.stringify(payload):undefined});
  this.assert(epoch);
  if(r.status===401){this.invalidate();throw new Error("Please sign in again.");}
  if(!r.ok)throw new RequestError(r.status,r.status===409?"The saved entry or retry identity changed. Reload saved entries and compare. Your input is retained.":r.status===404?"The owned entry was not found. Reload saved entries and compare.":r.status===422?"Check your date, timezone and entry values. Your input is retained.":"The request could not be confirmed. Your input is retained. Retry the same change.");
  const raw:unknown=await r.json();this.assert(epoch);await this.identity(epoch);return raw;
 }
 private async run(epoch:number,action:()=>Promise<void>){
  this.update({busy:true,delayed:false,error:""});
  const timer=setTimeout(()=>{if(this.current(epoch))this.update({delayed:true});},3000);
  try{await action();}catch(e){if(this.current(epoch))this.update({status:this.state.saved?"ready":"error",error:e instanceof z.ZodError?"Check the meal description, date, timezone and recording values. Your input is retained.":e instanceof Error?e.message:"The request could not be confirmed.",message:""});}
  finally{clearTimeout(timer);if(this.current(epoch))this.update({busy:false,delayed:false});}
 }
 private async read(epoch:number,day:string,timezone:string){
  const raw=await this.request(epoch,`/api/nutrition?day=${encodeURIComponent(day)}&timezone=${encodeURIComponent(timezone)}`);
  return decodeDay(raw,day,timezone);
 }
 async load(day:string,timezone:string){
  if(!this.active)return;
  // A pending mutation can be reconciled by reload, but its exact identity stays available for retry.
  const epoch=++this.epoch;
  this.update({status:"loading",saved:null,day,timezone,message:"Loading saved nutrition entries…"});
  await this.run(epoch,async()=>{nutritionQuery.parse({day,timezone});const saved=await this.read(epoch,day,timezone);this.assert(epoch);this.update({status:"ready",saved,message:"Saved entries checked. Totals include only this date and timezone."});});
 }
 newEntry(kind:"meal"|"water"){
  if(!this.active||this.state.busy||this.state.pending||this.state.draft||this.state.status!=="ready")return;
  this.update({draft:{id:crypto.randomUUID(),kind,description:"",amount:"",logged_on:this.state.day,timezone:this.state.timezone,revision:0,existing:false},error:"",message:"Unsaved entry."});
 }
 open(id:string){
  if(!this.active||this.state.busy||this.state.pending||this.state.draft)return;
  const e=this.state.saved?.entries.find(e=>e.id===id);if(!e)return;
  this.update({draft:{id:e.id,kind:e.kind,description:e.description??"",amount:e.kind==="meal"?String(e.protein_tenths/10):String(e.water_ml),logged_on:e.logged_on,timezone:e.timezone,revision:e.revision,existing:true},error:"",message:"Editing an entry. Changes are unsaved."});
 }
 edit(field:"description"|"amount"|"logged_on"|"timezone",value:string){if(this.active&&!this.state.busy&&!this.state.pending&&this.state.draft)this.update({draft:{...this.state.draft,[field]:value},error:""});}
 cancel(){if(this.active&&!this.state.busy&&!this.state.pending)this.update({draft:null,error:"",message:"Unsaved changes discarded."});}
 private async send(epoch:number,payload:NutritionMutation){
  // Set before issuing any effect. Every ambiguous retry retains these exact bytes/IDs.
  this.update({pending:payload,acknowledged:false,saved:null,message:"Saving and checking saved entries…"});
  try {
   const raw=await this.request(epoch,"/api/nutrition",payload);
   const ack=z.object({mutation_id:nutritionId,id:nutritionId,action:z.enum(["create","update","delete"]),revision:z.number().int().nonnegative()}).strict().parse(raw);
   const id=payload.action==="delete"?payload.id:payload.entry.id;
   const expectedRevision=payload.action==="delete"?payload.expected_revision:payload.entry.revision+(payload.action==="update"?1:0);
   if(ack.mutation_id!==payload.mutation_id||ack.id!==id||ack.action!==payload.action||ack.revision!==expectedRevision)throw new Error("The saved change could not be matched. Retry the same change before continuing.");
   this.update({acknowledged:true});
   const target=payload.action==="delete"?null:payload.entry;
   const savedTarget=target?await this.read(epoch,target.logged_on,target.timezone):null;
   this.assert(epoch);
   const saved=savedTarget&&target?.logged_on===this.state.day&&target.timezone===this.state.timezone?savedTarget:await this.read(epoch,this.state.day,this.state.timezone);
   this.assert(epoch);this.update({status:"ready",saved});
   const actual=savedTarget?.entries.find(e=>e.id===id);
   const matches=target?actual&&Object.entries({...target,revision:expectedRevision}).every(([key,value])=>actual[key as keyof NutritionEntry]===value):!saved.entries.some(e=>e.id===id);
   if(!matches)throw new Error("The change was acknowledged, but current saved values differ. Your input is retained. Compare saved entries before continuing.");
   this.update({status:"ready",saved,pending:null,acknowledged:false,draft:null,error:"",message:"Change saved. Current saved entries and totals checked."});
  }catch(e){
   // Definitive refusals have no committed effects; retain inputs but allow correction.
   if(this.current(epoch)&&e instanceof RequestError&&[404,409,422].includes(e.status))this.update({pending:null});
   throw e;
  }
 }
 async save(){
  if(!this.active||this.state.busy||this.state.pending||!this.state.draft)return;
  const epoch=this.epoch;
  await this.run(epoch,async()=>{
   const d=this.state.draft!;
   const entry:NutritionEntry=d.kind==="meal"?{id:d.id,kind:d.kind,logged_on:d.logged_on,timezone:d.timezone,revision:d.revision,description:d.description.trim(),protein_tenths:proteinTenths(d.amount),water_ml:null}:{id:d.id,kind:d.kind,logged_on:d.logged_on,timezone:d.timezone,revision:d.revision,description:null,protein_tenths:null,water_ml:waterMl(d.amount)};
   const p=nutritionMutation.parse({action:d.existing?"update":"create",mutation_id:crypto.randomUUID(),entry});await this.send(epoch,p);
  });
 }
 async remove(id:string){
  if(!this.active||this.state.busy||this.state.pending||this.state.draft)return;
  const e=this.state.saved?.entries.find(e=>e.id===id);if(!e)return;
  const epoch=this.epoch,p=nutritionMutation.parse({action:"delete",mutation_id:crypto.randomUUID(),id,expected_revision:e.revision});
  await this.run(epoch,()=>this.send(epoch,p));
 }
 useCurrentSaved(){if(this.active&&!this.state.busy&&this.state.acknowledged&&this.state.saved)this.update({pending:null,acknowledged:false,draft:null,error:"",message:"Showing current saved entries. Local input discarded; no new change sent."});}
 async retry(){if(!this.active||this.state.busy||!this.state.pending)return;const epoch=this.epoch,p=this.state.pending;await this.run(epoch,()=>this.send(epoch,p));}
}
