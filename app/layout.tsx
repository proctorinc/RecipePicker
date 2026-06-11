import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Manrope } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { Providers } from "@/components/providers";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Recipe Picker",
  description:
    "Browse Pinterest-sourced recipes and manage sync and extraction flows.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable}`}>
      <body className="font-sans antialiased">
        <ClerkProvider>
          {children}
          <Providers />
        </ClerkProvider>
      </body>
    </html>
  );
}
