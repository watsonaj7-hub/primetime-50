import { Droplets, Utensils } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function NutritionPanel() {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-bold">Nutrition targets</h2>
        <p className="text-base text-muted-foreground">Conservative fat loss with muscle support</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[8px] bg-background p-4">
          <Utensils className="mb-3 h-6 w-6 text-primary" />
          <p className="text-sm text-muted-foreground">Calories</p>
          <p className="text-3xl font-bold">1,920</p>
          <p className="mt-1 text-sm text-muted-foreground">Moderate 12% deficit</p>
        </div>
        <div className="rounded-[8px] bg-background p-4">
          <Droplets className="mb-3 h-6 w-6 text-accent" />
          <p className="text-sm text-muted-foreground">Protein</p>
          <p className="text-3xl font-bold">135g</p>
          <p className="mt-1 text-sm text-muted-foreground">Spread over 3-4 meals</p>
        </div>
        <div className="sm:col-span-2 rounded-[8px] border p-4">
          <p className="font-semibold">Meal suggestion</p>
          <p className="mt-2 text-muted-foreground">
            Mediterranean bowl with salmon, lentils, greens, olive oil, and Greek yogurt.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
