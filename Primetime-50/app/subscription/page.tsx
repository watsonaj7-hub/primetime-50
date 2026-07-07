import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

const plans = [
  ["Free", "$0", "Onboarding, basic tracking, limited workouts"],
  ["Pro", "$19", "AI coaching, full plans, nutrition, progress reports"],
  ["Premium", "$39", "Advanced AI coaching, wearable imports, priority support"]
];

export default function SubscriptionPage() {
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Subscription</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {plans.map(([name, price, description]) => (
          <div key={name} className="rounded-[8px] bg-card p-5 shadow-soft">
            <h2 className="text-2xl font-bold">{name}</h2>
            <p className="mt-2 text-3xl font-bold">{price}<span className="text-base font-medium text-muted-foreground">/mo</span></p>
            <p className="mt-3 min-h-20 text-muted-foreground">{description}</p>
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary">
              <CheckCircle2 className="h-5 w-5" /> Stripe-ready checkout
            </div>
            <Button className="mt-5 w-full">{name === "Free" ? "Current plan" : "Upgrade"}</Button>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
