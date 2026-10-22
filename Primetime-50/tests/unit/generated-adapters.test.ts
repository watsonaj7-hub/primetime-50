// Production route -> auth -> service -> pipeline -> real validator; only SDK transports doubled.
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { requestId, trusted, valid } from '../generated-fixture';
const b=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),client:vi.fn(),sdk:vi.fn(),provider:vi.fn()}));
vi.mock('@/lib/auth/require-user',()=>({requireUser:b.auth}));
vi.mock('@supabase/supabase-js',()=>({createClient:b.client}));
vi.mock('openai',()=>({default:b.sdk}));
import { POST } from '@/app/api/ai/plan/route';
const req=(extra={})=>new Request('http://localhost/api/ai/plan',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({request_id:requestId,...extra})});
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('NEXT_PUBLIC_APP_URL','http://localhost');
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://localhost:54321');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','SYNTHETIC_PUBLIC');
 vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','SYNTHETIC_TESTDATAONLY_PRIVATE');vi.stubEnv('OPENAI_API_KEY','SYNTHETIC_TESTDATAONLY_PROVIDER');
 vi.stubEnv('PRIMEFIT_GENERATED_PROVIDER_ENABLED','approved-live-v1');
 b.auth.mockResolvedValue({user:{id:'verified-owner'}});b.client.mockReturnValue({rpc:b.rpc});
 b.rpc.mockImplementation(async(name:string)=>({error:null,data:name==='reserve_generated_workout'?{state:'reserved',context:trusted}:name==='finish_generated_workout'?{id:requestId,provenance:{source:'validated_generated'}}:null}));
 b.sdk.mockImplementation(function(){return {chat:{completions:{create:b.provider}}};});
 b.provider.mockResolvedValue({choices:[{finish_reason:'stop',message:{content:JSON.stringify(valid)}}]});
});
afterEach(()=>vi.unstubAllEnvs());
it('binds verified identity at both service-only RPCs, with fixed model/token/deadline/retry bounds',async()=>{
 const response=await POST(req());expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
 expect(b.rpc).toHaveBeenNthCalledWith(1,'reserve_generated_workout',{owner_id:'verified-owner',request_id:requestId});
 expect(b.rpc).toHaveBeenNthCalledWith(2,'finish_generated_workout',{owner_id:'verified-owner',request_id:requestId,selection:valid});
 expect(b.sdk).toHaveBeenCalledWith({apiKey:'SYNTHETIC_TESTDATAONLY_PROVIDER',baseURL:'https://api.openai.com/v1',maxRetries:0,timeout:10000});
 const [payload,options]=b.provider.mock.calls[0];expect(payload.model).toBe('gpt-4o-mini');expect(payload.max_tokens).toBe(2048);expect(options.signal).toBeInstanceOf(AbortSignal);
 expect(JSON.parse(payload.messages[1].content)).toEqual(trusted);
 expect(await response.json()).toEqual({plan:{id:requestId,provenance:{source:'validated_generated'}}});
});
it.each(['disabled','unsupported','referral_required','budget_exhausted','in_progress','failed'])('never constructs a provider after SQL admission %s',async state=>{
 b.rpc.mockResolvedValue({data:{state},error:null});const response=await POST(req());expect(response.status).not.toBe(200);expect(b.sdk).not.toHaveBeenCalled();
});
it.each([{user_id:'other'},{onboarding:{health_status:'none_reported'}},{approved:true},{model:'other'},{policy_version_id:trusted.policy_version_id}])('refuses caller authority before any service client or provider %j',async extra=>{
 expect((await POST(req(extra))).status).toBe(422);expect(b.client).not.toHaveBeenCalled();expect(b.sdk).not.toHaveBeenCalled();
});
it.each(['length','content_filter','tool_calls'])('refuses incomplete provider finish %s with no persistence',async finish_reason=>{
 b.provider.mockResolvedValue({choices:[{finish_reason,message:{content:JSON.stringify(valid)}}]});expect((await POST(req())).status).toBe(503);expect(b.rpc.mock.calls.map(x=>x[0])).toEqual(['reserve_generated_workout','fail_generated_workout']);
});
it('does not leak SDK exceptions or return provisional output after storage failure',async()=>{
 b.rpc.mockImplementation(async(name:string)=>name==='reserve_generated_workout'?{data:{state:'reserved',context:trusted},error:null}:{data:null,error:{message:'SYNTHETIC_TESTDATAONLY_PRIVATE'}});
 const response=await POST(req());expect(response.status).toBe(503);const raw=await response.text();expect(raw).not.toContain('SYNTHETIC');expect(raw).not.toContain('weeks');
});
it('provider outage marks failure and never saves a fabricated plan',async()=>{
 b.provider.mockRejectedValue(new Error('SYNTHETIC_TESTDATAONLY_PROVIDER'));const response=await POST(req());expect(response.status).toBe(503);expect(b.rpc.mock.calls.map(x=>x[0])).toEqual(['reserve_generated_workout','fail_generated_workout']);
});
it('pins the provider endpoint instead of inheriting an arbitrary SDK base URL',async()=>{
 vi.stubEnv('OPENAI_BASE_URL','https://untrusted.example.test');await POST(req());expect(b.sdk.mock.calls[0][0].baseURL).toBe('https://api.openai.com/v1');
});
