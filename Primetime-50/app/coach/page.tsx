import { GeneratedExperience } from "@/components/workout/generated-experience";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function CoachPage() {
  return (
    <AppShell>
      <div className="mx-auto min-w-0 max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-accent text-accent-foreground">
                <Sparkles className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold">Coach availability</h1>
                <p className="text-muted-foreground">General chat is unavailable. Saved generated plans are shown below.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[8px] bg-muted p-4">
              <p className="font-semibold">Automatic progression is unavailable</p>
              <p className="mt-2 leading-7 text-muted-foreground">
                Saved history does not change your next prescription. Austin must approve progression,
                recovery and screening rules before adaptive guidance can be provided.
                This app does not monitor symptoms or provide health clearance.
              </p>
            </div>
            <p className="leading-7 text-muted-foreground">
              Reviewed-workout tracking remains available when your saved profile is supported and
              approved content is available. Saved records are distinct from exercise readiness.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild><Link href="/workout">View reviewed workouts</Link></Button>
              <Button asChild variant="outline"><Link href="/progress">Open workout history</Link></Button>
              <Button asChild variant="outline"><Link href="/onboarding">Review saved profile</Link></Button>
            </div>
          </CardContent>
        </Card>
        <GeneratedExperience />
      </div>
    </AppShell>
  );
}
