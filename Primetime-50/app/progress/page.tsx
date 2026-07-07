import { AppShell } from "@/components/app-shell";
import { ProgressChart } from "@/components/progress-chart";
import { HabitGrid } from "@/components/habit-grid";
import { MetricCard } from "@/components/metric-card";
import { Footprints, Moon, Ruler, Scale } from "lucide-react";

export default function ProgressPage() {
  return (
    <AppShell>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Weight trend" value="-4.1 lb" helper="6-week average" icon={Scale} />
        <MetricCard label="Waist trend" value="-1.7 in" helper="Steady fat-loss signal" icon={Ruler} />
        <MetricCard label="Steps" value="7,840" helper="Daily average" icon={Footprints} />
        <MetricCard label="Sleep" value="7h 12m" helper="Last 7 nights" icon={Moon} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ProgressChart />
        <HabitGrid />
      </div>
    </AppShell>
  );
}
