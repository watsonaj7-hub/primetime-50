import { Send, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function CoachPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-accent text-accent-foreground">
                <Sparkles className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold">AI coach chat</h1>
                <p className="text-muted-foreground">Ask for plan changes, substitutions, or weekly summaries.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[8px] bg-muted p-4">
              <p className="font-semibold">Coach</p>
              <p className="mt-2 leading-7 text-muted-foreground">
                Tell me how your last workout felt. Mention pain, dizziness, sleep, soreness, and available equipment so I can adjust safely.
              </p>
            </div>
            <Textarea placeholder="Example: My knees felt good, but I missed Wednesday and only have bands this week." />
            <Button className="w-full">
              Send to coach <Send className="h-5 w-5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
