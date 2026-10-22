import { afterEach, beforeEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ auth: vi.fn(), ai: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: boundary.auth }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create: boundary.ai } }; } }));
import { AppError } from "@/lib/http/errors";
import { POST } from "@/app/api/ai/plan/route";
const request = (body: unknown) => new Request('http://localhost/api/ai/plan', { method:'POST', headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_APP_URL','http://localhost'); boundary.auth.mockResolvedValue({user:{id:'owner'}}); });
it.each([{}, {onboarding:{approved:true}}, {request_id:'61000000-0000-4000-8000-000000000001',user_id:'other'}])('rejects untrusted context or absent request identity without a prescription %j',async body=>{
 const response=await POST(request(body)); expect(response.status).toBe(422); expect(boundary.ai).not.toHaveBeenCalled();
});
it('a key alone cannot enable generation or produce a demo prescription',async()=>{
 vi.stubEnv('OPENAI_API_KEY','SYNTHETIC_TESTDATAONLY');
 const response=await POST(request({request_id:'61000000-0000-4000-8000-000000000001'}));
 expect(response.status).toBe(503); expect(boundary.ai).not.toHaveBeenCalled(); expect(await response.text()).not.toContain('weekly_schedule');
});

afterEach(() => vi.unstubAllEnvs());
it.each([
 ['origin',403], ['authentication',401], ['malformed JSON',400], ['unknown keys',422],
 ['media type',415], ['body limit',413], ['disabled provider',503], ['unexpected error',503]
] as const)('sets no-store on generated-route %s refusal',async (scenario,status)=>{
 const req=request({request_id:'61000000-0000-4000-8000-000000000001'});
 let input=req;
 if(scenario==='origin')req.headers.delete('origin');
 if(scenario==='authentication')boundary.auth.mockRejectedValue(new AppError(401,'Please sign in to continue.'));
 if(scenario==='unexpected error')boundary.auth.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_FAILURE'));
 if(scenario==='unknown keys')input=request({approved:true});
 if(scenario==='media type')req.headers.set('content-type','text/plain');
 if(scenario==='malformed JSON'||scenario==='body limit')input=new Request(req.url,{method:'POST',headers:req.headers,body:scenario==='malformed JSON'?'{':'x'.repeat(1025)});
 const response=await POST(input);
 expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toBe('no-store');
 expect(boundary.ai).not.toHaveBeenCalled();expect(await response.text()).not.toContain('SYNTHETIC_PRIVATE_FAILURE');
 if(scenario==='origin')expect(boundary.auth).not.toHaveBeenCalled();
});
