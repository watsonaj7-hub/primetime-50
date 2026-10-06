"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl space-y-4 p-8"><h1 className="text-2xl font-bold">This page could not be loaded</h1><p role="alert">Please try again. Your saved profile is unchanged.</p><Button onClick={reset}>Try again</Button></main>;
}
