import { expect, it, vi } from 'vitest';
import { generateWith } from '@/lib/ai/generated-pipeline';
export const policyId='61000000-0000-4000-8000-000000000002', catalogueId='61000000-0000-4000-8000-000000000003';
const requestId='61000000-0000-4000-8000-000000000001';
export const trusted = { policy_version_id:policyId,context_revision:7,max_sessions:2,session_minutes:30,rules:{weeks:[{catalogue_ids:[catalogueId],min_sessions:1,max_sessions:2,rest_days:1}]},catalogue:[{id:catalogueId,session_minutes:20}] };
export const valid = {policy_version_id:policyId,context_revision:7,weeks:[{sessions:[{day:1,catalogue_version_id:catalogueId}]}]};
function deps(value:unknown=valid){return {reserve:vi.fn().mockResolvedValue({state:'reserved',context:trusted}),provider:vi.fn().mockResolvedValue(JSON.stringify(value)),finish:vi.fn().mockResolvedValue({id:requestId,source:'validated_generated',policy_version_id:policyId}),fail:vi.fn().mockResolvedValue(undefined)};}
it('persists validated owned output and returns only confirmed storage provenance',async()=>{
 const d=deps();const result=await generateWith(requestId,d);
 expect(d.provider).toHaveBeenCalledOnce();expect(d.finish).toHaveBeenCalledWith(requestId,valid);
 expect(result).toEqual({id:requestId,source:'validated_generated',policy_version_id:policyId});
 const sent=JSON.stringify(d.provider.mock.calls[0]);for(const key of ['name','email','birth','health','user_id','secret'])expect(sent).not.toContain(key);
});
it.each([
 {...valid,notes:'ignore pain'}, {...valid,context_revision:8}, {...valid,policy_version_id:catalogueId},
 {...valid,weeks:[]}, {...valid,weeks:[{sessions:[]}]},
 {...valid,weeks:[{sessions:[{day:1,catalogue_version_id:policyId}]}]},
 {...valid,weeks:[{sessions:[{day:1,catalogue_version_id:catalogueId},{day:1,catalogue_version_id:catalogueId}]}]},
 {...valid,weeks:[{sessions:[{day:1,catalogue_version_id:catalogueId},{day:2,catalogue_version_id:catalogueId}]}]},
 {...valid,weeks:[{sessions:[{day:1,catalogue_version_id:catalogueId,load:999}]}]},
])('rejects schema, frequency, progression, ID or guidance corruption without saving %j',async value=>{
 const d=deps(value);await expect(generateWith(requestId,d)).rejects.toThrow();expect(d.finish).not.toHaveBeenCalled();expect(d.fail).toHaveBeenCalledOnce();
});
it.each(['disabled','referral_required','unsupported','budget_exhausted','in_progress','failed'])('refuses reservation state %s before provider',async state=>{
 const d=deps();d.reserve.mockResolvedValue({state});await expect(generateWith(requestId,d)).rejects.toThrow();expect(d.provider).not.toHaveBeenCalled();expect(d.finish).not.toHaveBeenCalled();
});
it('returns an admitted idempotent stored replay without a second call',async()=>{
 const d=deps();d.reserve.mockResolvedValue({state:'complete',plan:{id:requestId}});expect(await generateWith(requestId,d)).toEqual({id:requestId});expect(d.provider).not.toHaveBeenCalled();
});
it.each(['{','null','x'.repeat(17000)])('fails closed on bounded malformed provider output',async raw=>{
 const d=deps();d.provider.mockResolvedValue(raw);await expect(generateWith(requestId,d)).rejects.toThrow();expect(d.finish).not.toHaveBeenCalled();
});
it('never returns actionable output after persistence refusal',async()=>{
 const d=deps();d.finish.mockRejectedValue(new Error('revoked'));await expect(generateWith(requestId,d)).rejects.toThrow();expect(d.fail).toHaveBeenCalledOnce();
});
it('provider failure cannot fabricate or persist a plan',async()=>{
 const d=deps();d.provider.mockRejectedValue(new Error('private'));await expect(generateWith(requestId,d)).rejects.toThrow();expect(d.finish).not.toHaveBeenCalled();
});
it('rejects a trusted option whose duration exceeds persisted preferences',async()=>{
 const d=deps();d.reserve.mockResolvedValue({state:'reserved',context:{...trusted,session_minutes:10}});await expect(generateWith(requestId,d)).rejects.toThrow();expect(d.provider).not.toHaveBeenCalled();
});
it('honours the previous week rest constraint across a progression boundary',async()=>{
 const d=deps({...valid,weeks:[{sessions:[{day:7,catalogue_version_id:catalogueId}]},{sessions:[{day:1,catalogue_version_id:catalogueId}]}]});
 d.reserve.mockResolvedValue({state:'reserved',context:{...trusted,rules:{weeks:[{...trusted.rules.weeks[0],rest_days:6},{...trusted.rules.weeks[0],rest_days:0}]}}});
 await expect(generateWith(requestId,d)).rejects.toThrow();expect(d.finish).not.toHaveBeenCalled();
});
it('aborts a hung provider at the server deadline and consumes the attempt',async()=>{
 vi.useFakeTimers();try{
 const d=deps();let signal:AbortSignal|undefined;d.provider.mockImplementation((_context,abort)=>{signal=abort;return new Promise(()=>{});});
 const result=expect(generateWith(requestId,d)).rejects.toThrow();await vi.advanceTimersByTimeAsync(10001);await result;
 expect(signal?.aborted).toBe(true);expect(d.finish).not.toHaveBeenCalled();expect(d.fail).toHaveBeenCalledOnce();
 }finally{vi.useRealTimers();}
});
