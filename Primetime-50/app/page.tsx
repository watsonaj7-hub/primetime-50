import Link from "next/link";
import {
  ArrowRight,
  HeartPulse,
  LineChart,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { HistoryExperience } from "@/components/history/history-experience";
import { ProgressChart } from "@/components/progress-chart";
import { TodayWorkout } from "@/components/today-workout";
import { HabitGrid } from "@/components/habit-grid";
import { CoachPanel } from "@/components/coach-panel";
import { NutritionPanel } from "@/components/nutrition-panel";
import { ExerciseSpotlight } from "@/components/exercise-spotlight";

const safetyCards: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "Content review",
    body: "Exercise content and screening rules require Austin’s review before exercise use.",
    icon: ShieldCheck
  },
  {
    title: "Progression",
    body: "Automatic progression is unavailable. Saved performance does not change your next prescription.",
    icon: LineChart
  },
  {
    title: "Saved records",
    body: "Workout history shows saved sessions, not health clearance or a readiness score.",
    icon: HeartPulse
  }
];

export default function Home() {
  return (
    <AppShell>
      <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[8px] bg-primary p-6 text-primary-foreground shadow-soft sm:p-8">
          <div className="mb-8 flex flex-wrap items-center gap-3 text-sm font-semibold uppercase tracking-wide text-white/78">
            <span className="rounded-full bg-white/15 px-3 py-1">PrimeFit 50+</span>
            <span>Strength • Mobility • Longevity</span>
          </div>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
            Train stronger after 50 with reviewed workout tracking.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-white/84">
            Record workouts, inspect saved history, and log meals, protein and water without
            personalised targets. Workout availability depends on supported saved information and approved content.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" variant="secondary">
              <Link href="/onboarding">
                Start onboarding <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outlineOnDark">
              <Link href="/workout">
                View reviewed workouts <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
        <HistoryExperience compact />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <TodayWorkout />
        <CoachPanel />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <NutritionPanel />
        <ProgressChart />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <HabitGrid />
        <ExerciseSpotlight />
      </section>

      <section className="mt-6 grid gap-4 pb-8 sm:grid-cols-3">
        {safetyCards.map((card) => (
          <div key={card.title} className="rounded-[8px] bg-card p-5 shadow-soft">
            <card.icon className="mb-4 h-6 w-6 text-accent" />
            <h2 className="text-xl font-semibold">{card.title}</h2>
            <p className="mt-2 text-base leading-7 text-muted-foreground">{card.body}</p>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
