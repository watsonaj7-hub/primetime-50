import { expect, it, vi } from "vitest";
import { HistoryController } from "@/lib/client/history";
import { historyRecord } from "./history-fixture";
function response(workouts: unknown[]) { return Response.json({ workouts }); }
function deferred<T>() { let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>resolve=r);return {promise,resolve}; }
it("reads actual authenticated no-store history route and selected original ID, including older records outside window", async () => {
 const a=historyRecord(1),older=historyRecord(2); const fetcher=vi.fn().mockResolvedValueOnce(response([a])).mockResolvedValueOnce(response([older]));
 const verify=vi.fn().mockResolvedValue(true),c=new HistoryController(fetcher,verify);
 await c.load(older.id);
 expect(fetcher.mock.calls.map(c=>c[0])).toEqual(["/api/workouts?view=history",`/api/workouts?view=history&id=${older.id}`]);
 expect(fetcher.mock.calls[0][1]).toEqual({cache:"no-store",credentials:"same-origin"});
 expect(c.state.status).toBe("ready"); expect(c.state.selected).toEqual(older); expect(c.state.records).toEqual([a]); expect(verify).toHaveBeenCalledTimes(2);
});
it.each(["network","malformed","json","wrongId"])("reports %s as error with cleared facts rather than empty success",async kind=>{
 const fetcher=vi.fn();
 if(kind==="network")fetcher.mockRejectedValue(new Error("offline"));
 if(kind==="malformed")fetcher.mockResolvedValue(Response.json({workouts:[{id:"broken"}]}));
 if(kind==="json")fetcher.mockResolvedValue(new Response("not json"));
 if(kind==="wrongId")fetcher.mockResolvedValue(response([]));
 const c=new HistoryController(fetcher,async()=>true);await c.load(kind==="wrongId"?historyRecord().id:undefined);
 expect(c.state.status).toBe("error");expect(c.state.records).toEqual([]);expect(c.state.error).not.toBe("");
});
it("distinguishes real empty history, failed identity and current 401",async()=>{
 const f=vi.fn().mockResolvedValue(response([])),c=new HistoryController(f,async()=>true);await c.load();expect(c.state.status).toBe("ready");
 f.mockResolvedValue(new Response(null,{status:401}));await c.load();expect(c.state.status).toBe("signedOut");
 const denied=new HistoryController(f,async()=>false);f.mockClear();await denied.load();expect(f).not.toHaveBeenCalled();expect(denied.state.status).toBe("signedOut");
});
it.each([200,401,503])("stale owner A response %s cannot populate or clear ready owner B",async status=>{
 const pending=deferred<Response>(),a=historyRecord(1),b=historyRecord(2);let identity="A";
 const f=vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response([b]));
 const c=new HistoryController(f,async()=>!!identity);const old=c.load();await Promise.resolve();
 c.invalidate();identity="B";c.activate();await c.load();const saved=c.state;
 pending.resolve(status===200?response([a]):new Response(null,{status}));await old;
 expect(c.state).toBe(saved);expect(c.state.records).toEqual([b]);
});
it("stale post-read identity verification cannot invalidate a new activation",async()=>{
 const pending=deferred<boolean>();let calls=0;const c=new HistoryController(vi.fn().mockResolvedValue(response([historyRecord()])),()=>++calls===2?pending.promise:Promise.resolve(true));
 const old=c.load();while(calls<2)await new Promise(r=>setTimeout(r,0));
 c.invalidate();c.activate();await c.load();const saved=c.state;pending.resolve(false);await old;expect(c.state).toBe(saved);
});
it("invalidates data when owner changes during a read even without an auth callback",async()=>{
 const verify=vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);const c=new HistoryController(vi.fn().mockResolvedValue(response([historyRecord()])),verify);
 await c.load();expect(c.state.status).toBe("signedOut");expect(c.state.records).toEqual([]);
});
it("latest reload wins even when a previous request fails after it",async()=>{
 const pending=deferred<Response>();const f=vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response([historyRecord(2)]));
 const c=new HistoryController(f,async()=>true);const old=c.load();await Promise.resolve();await c.load();pending.resolve(new Response(null,{status:401}));await old;expect(c.state.status).toBe("ready");expect(c.state.records[0].id).toBe(historyRecord(2).id);
});
