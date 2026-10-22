import { beforeEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ auth: vi.fn(), ai: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: boundary.auth }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create: boundary.ai } }; } }));
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
