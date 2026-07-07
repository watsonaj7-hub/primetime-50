import { ArrowRight, HeartPulse } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function OnboardingPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-primary text-primary-foreground">
                <HeartPulse className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold">Build your starting plan</h1>
                <p className="text-muted-foreground">A short intake for safe workouts and realistic nutrition targets.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Input placeholder="Age" type="number" />
            <Select defaultValue="">
              <option value="" disabled>Sex</option>
              <option>Female</option>
              <option>Male</option>
              <option>Prefer not to say</option>
            </Select>
            <Input placeholder="Height" />
            <Input placeholder="Weight" />
            <Input placeholder="Waist measurement" />
            <Select defaultValue="">
              <option value="" disabled>Fitness level</option>
              <option>Beginner</option>
              <option>Returning after a break</option>
              <option>Consistent</option>
            </Select>
            <Select defaultValue="">
              <option value="" disabled>Training location</option>
              <option>Home</option>
              <option>Gym</option>
              <option>Both</option>
            </Select>
            <Select defaultValue="">
              <option value="" disabled>Weekly availability</option>
              <option>2 days</option>
              <option>3 days</option>
              <option>4 days</option>
              <option>5 days</option>
            </Select>
            <Textarea className="md:col-span-2" placeholder="Injuries, medical considerations, mobility limits, and equipment" />
            <Textarea className="md:col-span-2" placeholder="Fat-loss goal, muscle-gain goal, nutrition preferences, sleep, and stress" />
            <Button className="md:col-span-2">
              Generate personalised plan <ArrowRight className="h-5 w-5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
