import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export default function SubscriptionPage() {
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Subscription</h1>
      <div className="mt-6 rounded-[8px] bg-card p-5 shadow-soft">
        <h2 className="text-xl font-bold">Paid subscriptions and checkout are unavailable</h2>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          No billing plan or entitlement is shown here. Reviewed-workout tracking depends on
          supported saved information and approved content.
        </p>
        <Button asChild className="mt-5"><Link href="/workout">View reviewed workouts</Link></Button>
      </div>
    </AppShell>
  );
}
