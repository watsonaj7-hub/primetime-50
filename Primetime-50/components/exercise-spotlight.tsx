import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ExerciseSpotlight() {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-bold">Exercise library</h2>
        <p className="text-base text-muted-foreground">Exercise guidance is withheld pending review</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="leading-7 text-muted-foreground">
          Starter exercise advice is withheld until Austin signs off the content.
          Reviewed workouts require supported saved information and approved content.
        </p>
        <Button asChild><Link href="/workout">View reviewed workouts</Link></Button>
      </CardContent>
    </Card>
  );
}
