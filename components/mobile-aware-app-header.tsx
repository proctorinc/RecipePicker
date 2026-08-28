"use client";

import type { ReactNode } from "react";

import { RecipeHeaderBackButton } from "@/components/recipe-header-back-button";

export function MobileAwareAppHeader({
  children,
  mobileLogo,
}: {
  children: ReactNode;
  mobileLogo: ReactNode;
}) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 hidden bg-background md:block">
        {children}
      </header>
      <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-center bg-background px-4 md:hidden">
        <div className="absolute left-2">
          <RecipeHeaderBackButton />
        </div>
        {mobileLogo}
      </header>
    </>
  );
}
