import { HeartPulse } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProfileForm } from "@/components/onboarding/profile-form";
import { readProfile } from "@/lib/services/profile";
import { readDraft } from "@/lib/services/draft";
export default async function OnboardingPage() {
  const profile = await readProfile();
  const draft = profile ? null : await readDraft();
  return <AppShell><div className="mx-auto max-w-4xl"><Card>
    <CardHeader><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-primary text-primary-foreground"><HeartPulse className="h-6 w-6" /></span><div><h1 className="text-3xl font-bold">Build your starting profile</h1><p className="text-muted-foreground">A short intake for safe workouts and realistic nutrition targets.</p></div></div></CardHeader>
    <CardContent><ProfileForm profile={profile} draft={draft} onboarding /></CardContent>
  </Card></div></AppShell>;
}
