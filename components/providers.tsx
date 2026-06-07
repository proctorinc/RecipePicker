"use client";

import { Toaster } from "sonner";

export function Providers() {
  return <Toaster position="top-center" richColors toastOptions={{ className: "rounded-3xl" }} />;
}

