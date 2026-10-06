import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AuthForm } from "@/components/auth/auth-form";
import { supabaseConfig } from "@/lib/config/public";
import { safeNext } from "@/lib/auth/redirect";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return <AppShell><div className="mx-auto max-w-xl"><Card>
    <CardHeader><h1 className="text-3xl font-bold">Welcome back</h1><p className="text-muted-foreground">Use email/password or a magic link to continue.</p></CardHeader>
    <CardContent className="space-y-4">
      {params.error && <p role="alert" className="text-destructive">Your sign-in link could not be verified. Please request another link.</p>}
      <AuthForm mode="login" next={safeNext(params.next)} configured={!!supabaseConfig()} />
      <p className="text-center text-sm text-muted-foreground">New here? <Link href="/register" className="font-semibold text-primary">Create your account</Link></p>
    </CardContent>
  </Card></div></AppShell>;
}
