import { AppShell } from "@/components/app-shell";
import { TodayWorkout } from "@/components/today-workout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const rows = ["Goblet box squat", "Band row", "Dumbbell floor press"];

export default function WorkoutPage() {
  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <TodayWorkout />
        <Card>
          <CardHeader>
            <h1 className="text-3xl font-bold">Workout logger</h1>
            <p className="text-muted-foreground">Track sets, reps, weight, RPE, and rest time.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.map((row) => (
              <div key={row} className="rounded-[8px] border bg-background p-4">
                <p className="mb-3 font-semibold">{row}</p>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Input placeholder="Sets" type="number" />
                  <Input placeholder="Reps" type="number" />
                  <Input placeholder="Weight" />
                  <Input placeholder="RPE" type="number" />
                </div>
              </div>
            ))}
            <Button className="w-full">Save log</Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
