import Link from "next/link";
import {
  BarChart3,
  Bot,
  Dumbbell,
  Home,
  Library,
  Settings,
  ShieldCheck,
  Utensils
} from "lucide-react";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/workout", label: "Workout", icon: Dumbbell },
  { href: "/nutrition", label: "Meals", icon: Utensils },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/coach", label: "Coach", icon: Bot }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <header className="sticky top-0 z-20 border-b bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 text-xl font-bold">
            <span className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-primary text-primary-foreground">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <span>PrimeFit 50+</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map((item) => (
              <Button key={item.href} asChild variant="ghost">
                <Link href={item.href}>
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              </Button>
            ))}
            <Button asChild variant="ghost">
              <Link href="/library">
                <Library className="h-5 w-5" />
                Library
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/settings">
                <Settings className="h-5 w-5" />
                Settings
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card lg:hidden">
        <div className="grid grid-cols-5">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-semibold text-muted-foreground"
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
