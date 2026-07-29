import * as React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[40%] h-[60%] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <header className="px-6 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg shadow-sm">
            SP
          </div>
          <span className="font-bold text-xl tracking-tight text-foreground">
            Superior Patio Covers
          </span>
        </div>
        <div>
          <Button asChild variant="ghost" className="mr-2">
            <Link href="/sign-in">Sign In</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Get Started</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 relative z-10">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm text-primary mb-8 font-medium">
          Operations Cockpit
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-foreground max-w-4xl leading-[1.1]">
          Job tracking, built for the <span className="text-primary">field.</span>
        </h1>
        <p className="mt-6 text-xl text-muted-foreground max-w-2xl">
          The dense, spreadsheet-style Kanban board for patio cover and pergola installations. See your pipeline at a glance, move jobs in two clicks, and never lose track of prep work.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <Button asChild size="lg" className="text-base h-12 px-8">
            <Link href="/sign-in">Open Board</Link>
          </Button>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground relative z-10">
        &copy; {new Date().getFullYear()} Superior Patio Covers. Twin Falls, Idaho.
      </footer>
    </div>
  );
}
