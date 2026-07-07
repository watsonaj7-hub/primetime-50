import { featuredExercises } from "@/lib/exercises";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ExerciseSpotlight() {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-bold">Exercise library</h2>
        <p className="text-base text-muted-foreground">Starter movements filtered for low-impact training</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {featuredExercises.map((exercise) => (
          <div key={exercise.name} className="rounded-[8px] border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{exercise.name}</p>
                <p className="text-sm text-muted-foreground">
                  {exercise.primaryMuscles.join(", ")} • {exercise.equipment}
                </p>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-primary">
                {exercise.jointImpact}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
