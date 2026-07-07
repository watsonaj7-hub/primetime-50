import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground">Profile, units, notifications, and safety preferences.</p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Input placeholder="Display name" defaultValue="Austin" />
            <Select defaultValue="imperial">
              <option value="imperial">Imperial units</option>
              <option value="metric">Metric units</option>
            </Select>
            <Select defaultValue="weekly">
              <option value="weekly">Weekly progress email</option>
              <option value="none">No progress email</option>
            </Select>
            <Select defaultValue="moderate">
              <option value="conservative">Conservative progression</option>
              <option value="moderate">Moderate progression</option>
            </Select>
            <Button className="md:col-span-2">Save settings</Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
