import type { PrescriptionData } from "@/lib/ai/generated-records";
export type PrescriptionPresentation = { prescription: PrescriptionData; content_id: string; content_version: string; rule_version: string; source_uri: string; reviewer_name: string; reviewer_role: string; approved_at: string };

export function Prescription({ snapshot, historical = false, generated = false }: { snapshot: PrescriptionPresentation; historical?: boolean; generated?: boolean }) {
  const p = snapshot.prescription;
  return <section className="min-w-0 space-y-3 break-words" aria-label={generated ? "Historical saved content" : historical ? "Original saved prescription" : "Reviewed prescription"}>
    <h2 className="text-2xl font-bold">{p.title}</h2>
    {generated && <p className="rounded-[8px] bg-secondary p-3">Historical saved content, not current clearance. Approval recorded at generation does not confirm current eligibility or approval.</p>}
    {historical && <p className="rounded-[8px] bg-secondary p-3">Original prescription saved at start. This record does not confirm current eligibility or approval.</p>}
    <p>{p.session_minutes} minutes</p>
    <dl className="space-y-2 text-sm">
      <div><dt className="font-semibold">Content and version</dt><dd>{snapshot.content_id} · {snapshot.content_version}</dd></div>
      <div><dt className="font-semibold">Rule version</dt><dd>{snapshot.rule_version}</dd></div>
      <div><dt className="font-semibold">Source</dt><dd className="[overflow-wrap:anywhere]">{snapshot.source_uri}</dd></div>
      <div><dt className="font-semibold">Approval recorded</dt><dd>{snapshot.reviewer_name}, {snapshot.reviewer_role} · {snapshot.approved_at}</dd></div>
    </dl>
    {([['Screening', p.screening_rules], ['Referral', p.referral_rules], ['Stop rules', p.stop_rules], ['Progression', p.progression_rules], ['Measurement', p.measurement]] as const).map(([label, content]) => <div key={label}><h3 className="font-semibold">{label}</h3><p className="whitespace-pre-wrap">{content}</p></div>)}
    <ol className="space-y-3">
      {p.exercises.map(e => <li key={e.exercise_key} className="min-w-0 rounded-[8px] border bg-background p-3">
        <h3 className="text-lg font-semibold">{e.exercise_name}</h3>
        <p>{e.sets} sets · {e.reps !== null ? `${e.reps} reps` : `${e.duration_seconds} seconds per set`} · Rest {e.rest_seconds} seconds</p>
        <p>Load: {e.load_guidance}</p><p>RPE: {e.rpe_guidance}</p><p className="whitespace-pre-wrap">Cues: {e.cues}</p><p className="whitespace-pre-wrap">Stop rules: {e.stop_rules}</p>
        <p>Equipment: {e.equipment.length ? e.equipment.join(", ") : "None specified"}</p><p>Exclusions: {e.exclusions.length ? e.exclusions.join(", ") : "None listed"}</p>
      </li>)}
    </ol>
  </section>;
}

