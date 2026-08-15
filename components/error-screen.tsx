"use client";

import { RefreshCw, Soup } from "lucide-react";

import { Button } from "@/components/ui/button";

type ErrorScreenProps = {
  title?: string;
  description?: string;
  showHomeLink?: boolean;
};

export function ErrorScreen({
  title = "We couldn't serve that up",
  description = "Something went wrong while loading this page. A quick refresh usually gets things back on track.",
  showHomeLink = true,
}: ErrorScreenProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
      <section
        aria-labelledby="error-title"
        className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/70 bg-card/90 p-2 shadow-[0_24px_70px_rgba(74,51,29,0.14)] backdrop-blur sm:p-3"
      >
        <div className="rounded-[1.6rem] bg-secondary/55 px-6 py-10 text-center sm:px-12 sm:py-14">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/15">
            <Soup className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Recipe Picker
          </p>
          <h1
            id="error-title"
            className="mt-3 font-[family-name:var(--font-serif)] text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
          >
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={() => window.location.reload()} className="w-full sm:w-auto">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh page
            </Button>
            {showHomeLink ? (
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <a href="/">Back to recipes</a>
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
