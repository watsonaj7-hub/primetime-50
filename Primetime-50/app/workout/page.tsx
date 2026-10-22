import { AppShell } from "@/components/app-shell";
import { WorkoutExperience } from "@/components/workout/workout-experience";
import { requireUser } from "@/lib/auth/require-user";

export default async function WorkoutPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { user } = await requireUser();
  const { id } = await searchParams;
  return <AppShell><WorkoutExperience key={`${user.id}:${id ?? "selection"}`} userId={user.id} /></AppShell>;
}
