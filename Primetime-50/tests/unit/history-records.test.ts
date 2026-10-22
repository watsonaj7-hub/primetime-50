import { expect, it } from "vitest";
import { decodeHistory, historyGroups, recordDay, recordTime, strengthEvidence } from "@/lib/history/records";
import { historyRecord, personalRecord } from "./history-fixture";
it("preserves personal and reviewed original observed values without mutating prior sessions", () => {
 const rows = [historyRecord(1), personalRecord(2)]; const before = structuredClone(rows);
 const parsed = decodeHistory({ workouts: rows });
 expect(parsed.map(r => r.record_mode)).toEqual(["personal","reviewed"]);
 expect(parsed[1].exercise_set_logs.map(s => [s.reps,s.weight,s.rpe])).toEqual([[8,12.5,7],[8,13.5,7]]);
 strengthEvidence(parsed); historyGroups(parsed); expect(rows).toEqual(before);
});
it("deduplicates neither conflicting nor identical IDs silently", () => {
 const r = historyRecord(); expect(() => decodeHistory({ workouts: [r,r] })).toThrow();
});
it.each([
 { performed_at: "2026-02-30T01:00:00Z" }, { performed_at: "2026-10-11T00:00:00" }, { performed_at: "not a date" },
 { record_timezone: "Not/AZone" }, { record_timezone: "" }, { completed_at: null }, { completed_at: "2020-01-01T00:00:00Z" },
 { prescription_snapshot: null }, { exercise_set_logs: [] }, { record_mode: "legacy" },
])( "rejects malformed history instead of generating empty facts: %j", change => {
 expect(() => decodeHistory({ workouts: [{ ...historyRecord(), ...change }] })).toThrow();
});
it("rejects malformed, duplicate and missing saved set slots and provenance", () => {
 const r = historyRecord();
 for (const change of [{ reps: null }, { weight: Infinity }, { rpe: 12 }, { reps: "8" }, { exercise_key: "bad" }]) expect(() => decodeHistory({ workouts: [{ ...r, exercise_set_logs: [{ ...r.exercise_set_logs[0], ...change },r.exercise_set_logs[1]] }] })).toThrow();
 expect(() => decodeHistory({ workouts: [{ ...r, exercise_set_logs: [r.exercise_set_logs[0],r.exercise_set_logs[0]] }] })).toThrow();
 if (r.record_mode === "reviewed") {
   r.prescription_snapshot.catalogue_version_id = "75000000-0000-4000-8000-000000000001";
   expect(() => decodeHistory({ workouts: [r] })).toThrow();
 }
});
it("filters drafts, orders instant then descending ID, groups stored day and zone independently of host timezone", () => {
 const a=historyRecord(1), b=historyRecord(2), draft=personalRecord(3);
 a.performed_at=b.performed_at="2026-10-03T14:30:00Z"; a.completed_at=b.completed_at="2026-10-03T16:30:00Z";
 a.record_timezone="Australia/Melbourne"; b.record_timezone="UTC";
 draft.completed=false; draft.completed_at=null;
 const rows=decodeHistory({ workouts: [a,draft,b] });
 expect(rows.map(r=>r.id)).toEqual([b.id,a.id]);
 expect(recordDay(a)).toBe("2026-10-04"); expect(recordDay(b)).toBe("2026-10-03");
 expect(historyGroups(rows).map(g=>[g.day,g.zone])).toEqual([["2026-10-03","UTC"],["2026-10-04","Australia/Melbourne"]]);
 expect(recordTime(a)).toContain("GMT+10:00"); expect(recordTime(a,true)).toContain("GMT+11:00");
});
it("calculates maxima within distinct comparable sessions, baseline/latest and ties with zero kg retained", () => {
 const a=historyRecord(1,0), middle=historyRecord(2,99), latest=historyRecord(3,4);
 const result = strengthEvidence(decodeHistory({ workouts: [latest,a,middle] }));
 expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ baseline: { id:a.id,kg:1 },latest:{ id:latest.id,kg:5 },difference:"4",reps:8 });
 latest.exercise_set_logs.forEach(s=>s.weight=1); expect(strengthEvidence([a,latest])[0].difference).toBe("0");
 a.exercise_set_logs.forEach(s=>s.weight=0); expect(strengthEvidence([a,latest])[0].baseline.kg).toBe(0);
 expect(strengthEvidence([a])).toEqual([]); expect(strengthEvidence([])).toEqual([]);
});
it("never conflates same labels across exercise keys, versions, modes, reps or duration protocols", () => {
 const a=historyRecord(1), b=historyRecord(2);
 expect(strengthEvidence([a,b])).toHaveLength(1);
 for (const mode of ["key","version","reps","duration","zeroReps","content","rule"] as const) {
   const different=structuredClone(b);
   if(different.record_mode!=="reviewed") throw new Error("fixture");
   if(mode==="key") { different.exercise_set_logs.forEach(s=>s.exercise_key="76000000-0000-4000-8000-000000000001");different.prescription_snapshot.prescription.exercises[0].exercise_key=different.exercise_set_logs[0].exercise_key; }
   if(mode==="version") different.catalogue_version_id=different.prescription_snapshot.catalogue_version_id="76000000-0000-4000-8000-000000000002";
   if(mode==="content") different.prescription_snapshot.content_version="TEST-v2";
   if(mode==="rule") different.prescription_snapshot.rule_version="TEST-r2";
   if(mode==="reps" || mode==="zeroReps") different.exercise_set_logs.forEach(s=>s.reps=mode==="reps"?9:0);
   if(mode==="duration") { different.prescription_snapshot.prescription.exercises[0].reps=null; different.prescription_snapshot.prescription.exercises[0].duration_seconds=30; }
   expect(strengthEvidence(decodeHistory({workouts:[a,different]})),mode).toEqual([]);
 }
 expect(strengthEvidence([personalRecord(1),personalRecord(2)])).toEqual([]);
});
it("uses deterministic session ID tie ordering rather than input order for equal instants", () => {
 const a=historyRecord(1,5),b=historyRecord(2,9); b.performed_at=a.performed_at;
 expect(strengthEvidence([b,a])[0]).toMatchObject({baseline:{id:a.id},latest:{id:b.id}});
});
it("preserves PostgreSQL microsecond chronology rather than sorting distinct instants as ID ties", () => {
 const a=historyRecord(1),b=historyRecord(2); a.performed_at="2026-10-11T00:00:00.000002Z";b.performed_at="2026-10-11T00:00:00.000001Z";a.completed_at=b.completed_at="2026-10-11T01:00:00Z";
 expect(decodeHistory({workouts:[b,a]}).map(r=>r.id)).toEqual([a.id,b.id]);
});
it("keeps fractional observed differences without binary subtraction noise or invented ties",()=>{
 const a=historyRecord(1),b=historyRecord(2);a.exercise_set_logs.forEach(s=>s.weight=0.1);b.exercise_set_logs.forEach(s=>s.weight=0.3);
 expect(strengthEvidence([a,b])[0].difference).toBe("0.2");
 a.exercise_set_logs.forEach(s=>s.weight=0);b.exercise_set_logs.forEach(s=>s.weight=1e-8);
 expect(strengthEvidence([a,b])[0].difference).toBe("0.00000001");
});
