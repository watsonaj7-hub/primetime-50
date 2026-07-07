import { AppShell } from "@/components/app-shell";
import { starterExercises } from "@/lib/exercises";

export default function LibraryPage() {
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Exercise library</h1>
      <p className="mt-2 text-muted-foreground">50 starter exercises with regressions, progressions, and safety notes.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {starterExercises.map((exercise) => (
          <article key={exercise.name} className="rounded-[8px] bg-card p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold">{exercise.name}</h2>
              <span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-primary">
                {exercise.difficulty}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {exercise.category} • {exercise.equipment} • {exercise.jointImpact} impact
            </p>
            <p className="mt-4 text-base leading-7">{exercise.cues}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="font-semibold">Avoid when</dt><dd className="text-muted-foreground">{exercise.contraindications}</dd></div>
              <div><dt className="font-semibold">Regression</dt><dd className="text-muted-foreground">{exercise.regression}</dd></div>
              <div><dt className="font-semibold">Progression</dt><dd className="text-muted-foreground">{exercise.progression}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
