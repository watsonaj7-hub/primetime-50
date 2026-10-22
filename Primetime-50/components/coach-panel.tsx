import { Bot, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function CoachPanel() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-accent text-accent-foreground">
            <Bot className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-2xl font-bold">Coach availability</h2>
            <p className="text-base text-muted-foreground">Reviewed tracking and coaching limits</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-[8px] bg-muted p-4">
          <p className="font-semibold">Automatic progression is unavailable</p>
          <p className="mt-2 leading-7 text-muted-foreground">
            Saved workout history is descriptive evidence. Changes to prescriptions require approved progression and recovery rules
            from Austin; no automatic load adjustment is provided.
          </p>
        </div>
        <div className="mt-4 flex gap-3 rounded-[8px] border border-destructive/25 bg-destructive/5 p-4 text-destructive">
          <ShieldAlert className="mt-1 h-5 w-5 shrink-0" />
          <p className="text-sm leading-6">
            This app does not monitor symptoms or provide health clearance. Saved records do not
            establish exercise readiness.
          </p>
        </div>
        <Button asChild className="mt-4 w-full">
          <Link href="/progress">Open workout history</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
