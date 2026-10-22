import { Card, CardContent, CardHeader } from "@/components/ui/card";
export function HabitGrid() {
  return <Card className="min-w-0"><CardHeader><h2 className="text-2xl font-bold">Habit tracking</h2></CardHeader><CardContent><p>Habit completion and streaks are unavailable. Workout history records completed sessions; it does not establish daily steps, protein, water, mobility or sleep completion.</p></CardContent></Card>;
}
