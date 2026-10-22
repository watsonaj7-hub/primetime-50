// TESTDATAONLY synthetic contract. Not professional approval or exercise advice.
export const requestId='61000000-0000-4000-8000-000000000001';
export const policyId='61000000-0000-4000-8000-000000000002';
export const catalogueId='61000000-0000-4000-8000-000000000003';
export const trusted = { policy_version_id:policyId,context_revision:7,max_sessions:2,session_minutes:30,rules:{weeks:[{catalogue_ids:[catalogueId],min_sessions:1,max_sessions:2,rest_days:1}]},catalogue:[{id:catalogueId,session_minutes:20}] };
export const valid = {policy_version_id:policyId,context_revision:7,weeks:[{sessions:[{day:1,catalogue_version_id:catalogueId}]}]};
