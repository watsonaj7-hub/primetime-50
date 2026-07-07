import { CheckCircle2, Clock, Dumbbell, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const movements = [
  ["Warm-up walk", "6 min", "Talk-test pace"],
  ["Goblet box squat", "3 x 8", "RPE 6"],
  ["Band row", "3 x 10", "Slow return"],
  ["Dumbbell floor press", "3 x 8", "Pain-free range"],
  ["Farmer carry", "4 x 30 sec", "Tall posture"],
  ["Hip flexor stretch", "2 x 40 sec", "Easy breathing"]
];

export function TodayWorkout() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-accent">Today</p>
            <h2 className="mt-1 text-2xl font-bold">Full-body strength</h2>
            <p className="mt-1 text-base text-muted-foreground">45 minutes • joint-friendly • moderate load</p>
          </div>
          <Clock className="h-6 w-6 text-accent" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {movements.map(([name, dose, note]) => (
          <div key={name} className="grid grid-cols-[1fr_auto] gap-3 rounded-[8px] border bg-background p-3">
            <div>
              <p className="font-semibold">{name}</p>
              <p className="text-sm text-muted-foreground">{note}</p>
            </div>
            <p className="font-bold text-primary">{dose}</p>
          </div>
        ))}
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <Button>
            <CheckCircle2 className="h-5 w-5" />
            Log workout
          </Button>
          <Button variant="outline">
            <RotateCcw className="h-5 w-5" />
            Swap exercise
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
