import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { strengthEvidence, type HistoryRecord } from "@/lib/history/records";

export function ProgressChart({ records }: { records?: HistoryRecord[] }) {
  const comparisons = records ? strengthEvidence(records) : [];
  return <Card className="min-w-0 break-words [overflow-wrap:anywhere]">
    <CardHeader><h2 className="text-2xl font-bold">Observed load comparisons</h2><p className="text-muted-foreground">Recorded kg at the same reps, exercise and reviewed version. Descriptive evidence, not a readiness score or training advice.</p></CardHeader>
    <CardContent className="space-y-4">
      {records === undefined ? <p><Link href="/progress" className="font-semibold underline focus-visible:outline focus-visible:outline-2">Open workout history</Link> to inspect saved sessions and comparable loads. Body measurements and recovery analytics are unavailable.</p> : <>
        <p className="text-sm text-muted-foreground">Within the latest 100 owned completed records only. Each session contributes its maximum observed kg at those reps. Earliest and latest comparable sessions are compared; this is not an all-time personal best.</p>
        {comparisons.length === 0 ? <p>Insufficient comparable data. At least two completed sessions with the same reviewed version, exercise and positive reps are needed. Personal records remain visible in history, but do not establish a fixed comparable protocol.</p> : <ul className="space-y-4">{comparisons.map(c => <li key={c.key} className="rounded-[8px] border p-3">
          <h3 className="font-bold">{c.name} · {c.reps} reps</h3><p className="text-sm">Reviewed version {c.version}</p>
          <p><Link className="underline focus-visible:outline focus-visible:outline-2" href={`/progress?id=${c.baseline.id}`}>Baseline session {c.baseline.id}</Link>: {c.baseline.kg} kg</p>
          <p><Link className="underline focus-visible:outline focus-visible:outline-2" href={`/progress?id=${c.latest.id}`}>Latest session {c.latest.id}</Link>: {c.latest.kg} kg</p>
          <p>Observed difference: {c.difference !== "0" && !c.difference.startsWith("-") ? "+" : ""}{c.difference} kg{c.difference === "0" ? " (tie)" : ""}. Loads of 0 kg are retained; no percentage or estimated 1RM is calculated.</p>
        </li>)}</ul>}
      </>}
    </CardContent>
  </Card>;
}
