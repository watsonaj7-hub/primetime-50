import Link from "next/link";
import { Mail, KeyRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <h1 className="text-3xl font-bold">Welcome back</h1>
            <p className="text-muted-foreground">Use email/password or a magic link to continue.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input type="email" placeholder="Email address" />
            <Input type="password" placeholder="Password" />
            <Button className="w-full">
              <KeyRound className="h-5 w-5" />
              Sign in
            </Button>
            <Button variant="outline" className="w-full">
              <Mail className="h-5 w-5" />
              Send magic link
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              New here? <Link href="/onboarding" className="font-semibold text-primary">Create your profile</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
