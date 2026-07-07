import { Check, Flame } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const habits = ["Workout", "Steps", "Protein", "Water", "Mobility", "Sleep"];

export function HabitGrid() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Habit tracker</h2>
            <p className="text-base text-muted-foreground">Weekly completion score: 83%</p>
          </div>
          <span className="flex items-center gap-2 rounded-[8px] bg-secondary px-3 py-2 font-bold text-primary">
            <Flame className="h-5 w-5" /> 12
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {habits.map((habit, index) => (
          <div key={habit} className="rounded-[8px] border bg-background p-4">
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-[8px] bg-primary text-primary-foreground">
              <Check className="h-5 w-5" />
            </span>
            <p className="font-semibold">{habit}</p>
            <p className="text-sm text-muted-foreground">{index === 5 ? "7h 20m" : "Done today"}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
