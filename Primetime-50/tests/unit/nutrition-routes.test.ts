import { beforeEach,afterEach,expect,it,vi } from "vitest";
const s=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:s.getUser},rpc:s.rpc})}));
import {GET,POST} from "@/app/api/nutrition/route";
const id="11111111-1111-4111-8111-111111111111", origin="http://localhost";
const entry={id,kind:"water",logged_on:"2026-10-23",timezone:"UTC",water_ml:250,protein_tenths:null,description:null,revision:0};
const body={action:"create",mutation_id:id,entry};
function req(value:unknown=body,headers:Record<string,string>={origin,"content-type":"application/json"}){return new Request(origin+"/api/nutrition",{method:"POST",headers,body:JSON.stringify(value)});}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("NEXT_PUBLIC_APP_URL",origin);s.getUser.mockResolvedValue({data:{user:{id:"A"}},error:null});s.rpc.mockResolvedValue({data:{},error:null});});
afterEach(()=>vi.unstubAllEnvs());
it("uses verified auth and bounded RPC payloads with no caller ownership",async()=>{
 expect((await POST(req())).status).toBe(200);expect(s.rpc).toHaveBeenCalledWith("mutate_nutrition_record",{payload:body});
 const r=await GET(new Request(origin+"/api/nutrition?day=2026-10-23&timezone=UTC"));expect(r.status).toBe(200);expect(r.headers.get("Cache-Control")).toBe("no-store");expect(s.rpc).toHaveBeenLastCalledWith("read_nutrition_day",{payload:{day:"2026-10-23",timezone:"UTC"}});
});
it.each([{user_id:"B"},{entry:{...entry,user_id:"B"}},{entry:{...entry,water_ml:-1}},{action:"replace"}])("rejects invalid and forged fields before RPC %j",async patch=>{expect((await POST(req({...body,...patch}))).status).toBe(422);expect(s.rpc).not.toHaveBeenCalled();});
it("refuses missing/foreign origin before reading body or auth",async()=>{const r=req(body,{"content-type":"application/json"});expect((await POST(r)).status).toBe(403);expect(r.bodyUsed).toBe(false);expect(s.getUser).not.toHaveBeenCalled();});
it("refuses anonymous read/write before storage",async()=>{s.getUser.mockResolvedValue({data:{user:null},error:null});expect((await POST(req())).status).toBe(401);expect((await GET(new Request(origin+"/api/nutrition?day=2026-10-23&timezone=UTC"))).status).toBe(401);expect(s.rpc).not.toHaveBeenCalled();});
it.each([["P1101",409],["P0002",404],["22023",422],["XX000",503]] as const)("maps storage %s to %i without leaking provider details",async(code,status)=>{s.rpc.mockResolvedValue({data:null,error:{code,message:"PRIVATE ERROR"}});const r=await POST(req());expect(r.status).toBe(status);expect(await r.text()).not.toContain("PRIVATE ERROR");});
it("rejects malformed days and extra query authority",async()=>{expect((await GET(new Request(origin+"/api/nutrition?day=2026-02-30&timezone=UTC"))).status).toBe(422);expect((await GET(new Request(origin+"/api/nutrition?day=2026-10-23&timezone=UTC&user_id=B"))).status).toBe(422);expect(s.rpc).not.toHaveBeenCalled();});
it("preserves bounded HTTP body and content-type refusals",async()=>{expect((await POST(req(body,{origin}))).status).toBe(415);expect((await POST(req({description:"x".repeat(17000)}))).status).toBe(413);expect(s.rpc).not.toHaveBeenCalled();});
it("never caches private error responses",async()=>{s.rpc.mockResolvedValue({data:null,error:{code:"XX000"}});expect((await GET(new Request(origin+"/api/nutrition?day=2026-10-23&timezone=UTC"))).headers.get("Cache-Control")).toBe("no-store");});
