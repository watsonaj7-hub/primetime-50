import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProfileForm } from "@/components/onboarding/profile-form";
import { readProfile } from "@/lib/services/profile";
export default async function SettingsPage() {
  const profile = await readProfile();
  return <AppShell><div className="mx-auto max-w-3xl"><Card>
    <CardHeader><h1 className="text-3xl font-bold">Settings</h1><p className="text-muted-foreground">Profile, goals, equipment, training and health preferences.</p></CardHeader>
    <CardContent>{profile ? <ProfileForm profile={profile} /> : <p>Your profile is incomplete. <Link href="/onboarding" className="font-semibold text-primary">Complete onboarding</Link> to save your preferences.</p>}</CardContent>
  </Card></div></AppShell>;
}
