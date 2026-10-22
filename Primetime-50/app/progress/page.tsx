import { AppShell } from "@/components/app-shell";
import { HabitGrid } from "@/components/habit-grid";
import { HistoryExperience } from "@/components/history/history-experience";
export default function ProgressPage() {
  return <AppShell><h1 className="mb-6 text-3xl font-bold">Progress</h1><div className="grid min-w-0 gap-6 xl:grid-cols-[1.1fr_0.9fr]"><HistoryExperience /><HabitGrid /></div></AppShell>;
}
