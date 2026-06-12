"use client";

import { Suspense, type ReactNode } from "react";
import { Toaster } from "sonner";

import { AppRouteTransitionProvider } from "@/components/app-route-transition";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ProviderFallback>{children}</ProviderFallback>}>
      <AppRouteTransitionProvider>
        {children}
        <Toaster
          position="top-center"
          richColors
          toastOptions={{ className: "rounded-3xl" }}
        />
      </AppRouteTransitionProvider>
    </Suspense>
  );
}

function ProviderFallback({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-center"
        richColors
        toastOptions={{ className: "rounded-3xl" }}
      />
    </>
  );
}
