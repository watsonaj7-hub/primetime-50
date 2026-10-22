import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export default function LibraryPage() {
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Exercise library</h1>
      <div className="mt-6 rounded-[8px] bg-card p-5 shadow-soft">
        <h2 className="text-xl font-bold">Exercise guidance is withheld pending review</h2>
        <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
          The starter library has not been signed off for exercise use. Cues, contraindications,
          regressions and progressions are withheld. Austin owns exercise-content approval.
        </p>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
          Use the reviewed-workout route to check available approved content against your supported
          saved information. A saved profile does not establish health clearance.
        </p>
        <Button asChild className="mt-4"><Link href="/workout">View reviewed workouts</Link></Button>
      </div>
    </AppShell>
  );
}
