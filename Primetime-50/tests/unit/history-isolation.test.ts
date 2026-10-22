// Production controller -> HTTP handler -> service -> requireUser. Only external Supabase is doubled.
// This is a local ownership/calculation fixture, NOT database RLS/Auth/cookie persistence acceptance.
import { beforeEach, expect, it, vi } from "vitest";
import { historyRecord, personalRecord } from "./history-fixture";
const db=vi.hoisted(()=>({owner:"A" as string|null, rows:[] as Record<string,unknown>[], reads:[] as unknown[][]}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({
 auth:{getUser:async()=>({data:{user:db.owner?{id:db.owner,user_metadata:{user_id:"B"}}:null},error:null})},
 from:(table:string)=>{
  const filters:[string,unknown][]=[];const q={
   select:()=>q,eq:(key:string,value:unknown)=>{filters.push([key,value]);return q;},in:()=>q,order:()=>q,
   limit:async(n:number)=>{db.reads.push([table,...filters]);return {data:structuredClone(db.rows.filter(r=>filters.every(([key,value])=>r[key]===value)).slice(0,n)),error:null};}
  };return q;
 }
})}));
import { GET } from "@/app/api/workouts/route";
import { HistoryController } from "@/lib/client/history";
import { strengthEvidence } from "@/lib/history/records";
beforeEach(()=>{db.owner="A";db.rows=[{...historyRecord(1,10),user_id:"A"},{...historyRecord(2,12),user_id:"A"},{...personalRecord(3),user_id:"A"},{...historyRecord(4,500),user_id:"B"}];db.reads=[];});
it("isolates A/B history and strength evidence, clears logout and preserves all prior records",async()=>{
 const original=structuredClone(db.rows);
 const fetcher:typeof fetch=async url=>GET(new Request(`http://localhost${url}`));
 const c=new HistoryController(fetcher,async()=>!!db.owner);await c.load();
 expect(c.state.records.map(r=>r.id)).toEqual([personalRecord(3).id,historyRecord(2).id,historyRecord(1).id]);
 expect(strengthEvidence(c.state.records)[0]).toMatchObject({baseline:{kg:11},latest:{kg:13},difference:"2"});
 db.owner=null;c.invalidate();expect(c.state.records).toEqual([]);
 expect((await GET(new Request("http://localhost/api/workouts?view=history"))).status).toBe(401);
 db.owner="B";c.activate();await c.load();expect(c.state.records.map(r=>r.id)).toEqual([historyRecord(4).id]);expect(strengthEvidence(c.state.records)).toEqual([]);
 await c.load(historyRecord(1).id);expect(c.state.status).toBe("error");expect(c.state.records).toEqual([]);
 db.owner="A";c.activate();await c.load(historyRecord(1).id);expect(c.state.selected?.exercise_set_logs).toEqual(historyRecord(1,10).exercise_set_logs);
 expect(db.rows).toEqual(original);
 expect(db.reads.every(call=>call.some(filter=>Array.isArray(filter)&&filter[0]==="completed"&&filter[1]===true))).toBe(true);
});
