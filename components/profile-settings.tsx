"use client";

import { UserProfile } from "@clerk/nextjs";

export function ProfileSettings() {
  return (
    <UserProfile
      appearance={{
        elements: {
          rootBox: "w-full !max-w-none",
          cardBox: "w-full !max-w-none",
          card: "w-full !max-w-none rounded-[28px] border-border/60 shadow-sm",
          navbar: "border-border/60",
          navbarButton: "rounded-xl",
          pageScrollBox: "p-4 sm:p-6",
          headerTitle: "font-serif text-2xl",
          profileSectionTitleText: "font-medium",
          formButtonPrimary: "rounded-full",
        },
      }}
    />
  );
}
