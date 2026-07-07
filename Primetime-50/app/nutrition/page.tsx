import { AppShell } from "@/components/app-shell";
import { NutritionPanel } from "@/components/nutrition-panel";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default function NutritionPage() {
  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <NutritionPanel />
        <Card>
          <CardHeader>
            <h1 className="text-3xl font-bold">Meal logger</h1>
            <p className="text-muted-foreground">Filter suggestions by dietary preference.</p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Input placeholder="Meal name" />
            <Select defaultValue="Mediterranean">
              {["Standard", "Mediterranean", "Vegetarian", "Low-carb", "High-protein", "Gluten-free", "Dairy-free"].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Select>
            <Input placeholder="Calories" type="number" />
            <Input placeholder="Protein grams" type="number" />
            <Button className="md:col-span-2">Add meal</Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
