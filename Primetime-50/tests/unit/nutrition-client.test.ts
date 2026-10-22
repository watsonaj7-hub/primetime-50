import { expect,it,vi } from "vitest";
import { NutritionController } from "@/lib/client/nutrition";
import { totals } from "@/lib/nutrition/records";
import type { NutritionEntry } from "@/lib/validation/nutrition";
const id="11111111-1111-4111-8111-111111111111", zone="Australia/Melbourne", day="2026-10-23";
const meal:NutritionEntry={id,kind:"meal",logged_on:day,timezone:zone,description:"TEST ONLY meal",protein_tenths:123,water_ml:null,revision:0};
function reply(entries:NutritionEntry[]=[],d=day){return Response.json({day:d,timezone:zone,entries,totals:totals(entries)});}
function ack(p:{mutation_id:string;action:string;entry?:NutritionEntry;id?:string}){return Response.json({mutation_id:p.mutation_id,id:p.entry?.id??p.id,action:p.action,revision:p.action==="update"?((p.entry?.revision??0)+1):0});}
function deferred<T>(){let resolve!:(v:T)=>void;return {promise:new Promise<T>(r=>resolve=r),resolve:(v:T)=>resolve(v)};}
it("loads exact date/zone through no-store owned route, and keeps loading/error distinct from empty",async()=>{
 const f=vi.fn().mockResolvedValue(reply()),c=new NutritionController(f,async()=>true);expect(c.state.status).toBe("loading");await c.load(day,zone);
 expect(c.state.status).toBe("ready");expect(c.state.saved?.entries).toEqual([]);expect(f.mock.calls[0][0]).toBe(`/api/nutrition?day=${day}&timezone=${encodeURIComponent(zone)}`);expect(f.mock.calls[0][1].cache).toBe("no-store");
 f.mockRejectedValue(new Error("offline"));await c.load(day,zone);expect(c.state.status).toBe("error");expect(c.state.saved).toBeNull();
});
it("retains raw invalid input and refuses effects",async()=>{
 const f=vi.fn().mockResolvedValue(reply()),c=new NutritionController(f,async()=>true);await c.load(day,zone);c.newEntry("meal");c.edit("description","TEST ONLY");c.edit("amount","1.23");f.mockClear();await c.save();expect(f).not.toHaveBeenCalled();expect(c.state.draft?.amount).toBe("1.23");expect(c.state.error).not.toBe("");
});
it("retains one mutation identity after lost response and retries exactly once before reconciling saved entries",async()=>{
 let stored:NutritionEntry[]=[];let first=true;const posts:string[]=[];
 const f=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==="POST"){posts.push(init.body as string);const p=JSON.parse(init.body as string);stored=[p.entry];if(first){first=false;throw new Error("response lost");}return ack(p);}return reply(stored);});
 const c=new NutritionController(f,async()=>true);await c.load(day,zone);c.newEntry("meal");c.edit("description","TEST ONLY meal");c.edit("amount","12.3");await c.save();
 expect(c.state.pending).not.toBeNull();expect(c.state.draft?.amount).toBe("12.3");c.edit("amount","99");expect(c.state.draft?.amount).toBe("12.3");await c.retry();
 expect(posts).toHaveLength(2);expect(posts[1]).toBe(posts[0]);expect(c.state.pending).toBeNull();expect(c.state.saved?.totals.protein_tenths).toBe(123);expect(c.state.draft).toBeNull();
});
it("keeps acknowledged identity when saved-day read fails and retries receipt, without a new write identity",async()=>{
 const f=vi.fn().mockResolvedValueOnce(reply()).mockImplementationOnce(async(_u,init)=>ack(JSON.parse(init.body))).mockRejectedValueOnce(new Error("read lost"));
 const c=new NutritionController(f,async()=>true);await c.load(day,zone);c.newEntry("water");c.edit("amount","250");await c.save();expect(c.state.pending).not.toBeNull();expect(c.state.saved).toBeNull();expect(c.state.draft?.amount).toBe("250");
});
it("editing another date sends original revision and refreshes the viewed day; delete uses owned ID and revision",async()=>{
 const posts:Record<string,unknown>[]=[];let entries:NutritionEntry[]=[meal];const f=vi.fn(async(_u:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==="POST"){const p=JSON.parse(init.body as string);posts.push(p);entries=p.action==="delete"?[]:[{...p.entry,revision:p.entry.revision+1}];return ack(p);}const d=new URL(String(_u),"http://localhost").searchParams.get("day")!;return reply(entries.filter(e=>e.logged_on===d),d);});
 const c=new NutritionController(f,async()=>true);await c.load(day,zone);c.open(meal.id);c.edit("logged_on","2026-10-22");await c.save();expect((posts[0].entry as NutritionEntry).logged_on).toBe("2026-10-22");expect(c.state.saved?.totals.protein_tenths).toBe(0);
 entries=[meal];await c.load(day,zone);await c.remove(meal.id);expect(posts[1]).toMatchObject({action:"delete",id,expected_revision:0});expect(c.state.saved?.entries).toEqual([]);
});
it.each([200,401,503])("ignores stale %s after owner switch/unmount and clears drafts",async status=>{
 const d=deferred<Response>(),f=vi.fn().mockReturnValueOnce(d.promise).mockResolvedValue(reply()),c=new NutritionController(f,async()=>true);const old=c.load(day,zone);await Promise.resolve();await Promise.resolve();c.invalidate();c.activate();await c.load(day,zone);const state=c.state;d.resolve(status===200?reply([meal]):new Response(null,{status}));await old;expect(c.state).toBe(state);expect(c.state.saved?.entries).toEqual([]);
});
it("checks identity after response even without an auth callback",async()=>{
 const verify=vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),c=new NutritionController(vi.fn().mockResolvedValue(reply([meal])),verify);await c.load(day,zone);expect(c.state.status).toBe("signedOut");expect(c.state.saved).toBeNull();
});
it("latest day read wins over slow old day and current 401 clears data",async()=>{
 const d=deferred<Response>(),f=vi.fn().mockReturnValueOnce(d.promise).mockResolvedValue(reply([],"2026-10-22")),c=new NutritionController(f,async()=>true);const old=c.load(day,zone);await Promise.resolve();await c.load("2026-10-22",zone);d.resolve(reply([meal]));await old;expect(c.state.day).toBe("2026-10-22");expect(c.state.saved?.entries).toEqual([]);
 f.mockResolvedValue(new Response(null,{status:401}));await c.load(day,zone);expect(c.state.status).toBe("signedOut");
});
it("rejects mismatched acknowledgements and malformed or inconsistent saved totals without success",async()=>{
 const f=vi.fn().mockResolvedValueOnce(reply()).mockResolvedValueOnce(Response.json({mutation_id:id,id,action:"create",revision:0}));const c=new NutritionController(f,async()=>true);await c.load(day,zone);c.newEntry("water");c.edit("amount","250");await c.save();expect(c.state.error).not.toBe("");expect(c.state.pending).not.toBeNull();expect(c.state.draft).not.toBeNull();
});
it("does not announce save success when a valid day response omits the acknowledged entry",async()=>{
 const f=vi.fn().mockResolvedValueOnce(reply()).mockImplementationOnce(async(_u,init)=>ack(JSON.parse(init.body))).mockResolvedValue(reply());
 const c=new NutritionController(f,async()=>true);await c.load(day,zone);c.newEntry("water");c.edit("amount","250");await c.save();expect(c.state.error).not.toBe("");expect(c.state.draft?.amount).toBe("250");
});
it("verifies the moved entry on its destination day, not only subtraction from the old day",async()=>{
 const f=vi.fn().mockResolvedValueOnce(reply([meal])).mockImplementationOnce(async(_u,init)=>{const p=JSON.parse(init.body);return Response.json({...JSON.parse(await ack(p).text()),revision:1});}).mockImplementation(async(u)=>reply([],new URL(String(u),"http://localhost").searchParams.get("day")!));
 const c=new NutritionController(f,async()=>true);await c.load(day,zone);c.open(id);c.edit("logged_on","2026-10-22");await c.save();expect(c.state.error).not.toBe("");expect(c.state.draft?.logged_on).toBe("2026-10-22");
 expect(f.mock.calls.some(call=>String(call[0]).includes("day=2026-10-22"))).toBe(true);
});
it("an acknowledged concurrent change is compared without silently dropping local input",async()=>{
 const f=vi.fn().mockResolvedValueOnce(reply()).mockImplementationOnce(async(_u,init)=>ack(JSON.parse(init.body))).mockResolvedValue(reply());
 const c=new NutritionController(f,async()=>true);await c.load(day,zone);c.newEntry("meal");c.edit("description","TEST ONLY");c.edit("amount","12.3");await c.save();
 expect(c.state.acknowledged).toBe(true);expect(c.state.draft?.amount).toBe("12.3");expect(c.state.saved?.entries).toEqual([]);c.useCurrentSaved();expect(c.state.draft).toBeNull();expect(c.state.pending).toBeNull();expect(c.state.message).toContain("no new change sent");
});
it("retains inputs through definitive conflict, then reloads saved values for comparison",async()=>{
 const f=vi.fn().mockResolvedValueOnce(reply([meal])).mockResolvedValueOnce(new Response(null,{status:409})).mockResolvedValue(reply([{...meal,revision:1,protein_tenths:456}]));
 const c=new NutritionController(f,async()=>true);await c.load(day,zone);c.open(id);c.edit("amount","99");await c.save();expect(c.state.pending).toBeNull();expect(c.state.draft?.amount).toBe("99");await c.load(day,zone);expect(c.state.saved?.entries[0].protein_tenths).toBe(456);expect(c.state.draft?.amount).toBe("99");
});
it("shows actual delayed status without ETA and suppresses post-unmount publication",async()=>{
 vi.useFakeTimers();try{
 const d=deferred<Response>(),f=vi.fn().mockReturnValue(d.promise),c=new NutritionController(f,async()=>true);const loading=c.load(day,zone);await vi.advanceTimersByTimeAsync(3001);expect(c.state.delayed).toBe(true);c.dispose();const state=c.state;d.resolve(reply([meal]));await loading;expect(c.state).toBe(state);expect(c.state.saved).toBeNull();
 }finally{vi.useRealTimers();}
});
it("a stale identity check cannot invalidate the next activation or issue a new effect",async()=>{
 const d=deferred<boolean>();let calls=0;const f=vi.fn().mockResolvedValue(reply()),c=new NutritionController(f,()=>++calls===2?d.promise:Promise.resolve(true));
 const old=c.load(day,zone);while(calls<2)await new Promise(r=>setTimeout(r,0));c.invalidate();c.activate();await c.load(day,zone);const saved=c.state;d.resolve(false);await old;expect(c.state).toBe(saved);
});
it("a stale mutation response cannot publish, retry or begin readback after user switch",async()=>{
 const d=deferred<Response>(),f=vi.fn().mockResolvedValueOnce(reply()).mockReturnValueOnce(d.promise),c=new NutritionController(f,async()=>true);
 await c.load(day,zone);c.newEntry("water");c.edit("amount","250");const old=c.save();while(f.mock.calls.length<2)await new Promise(r=>setTimeout(r,0));
 const pending=c.state.pending!;c.invalidate();expect(c.state.pending).toBeNull();expect(c.state.draft).toBeNull();d.resolve(ack(pending));await old;expect(c.state.status).toBe("signedOut");expect(f).toHaveBeenCalledTimes(2);await c.retry();expect(f).toHaveBeenCalledTimes(2);
});
