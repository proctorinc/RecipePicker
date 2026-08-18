"use client";

import { UserButton } from "@clerk/nextjs";

export function AppShellUserButton() {
  return (
    <div className="ml-auto flex shrink-0 gap-2">
      <UserButton
        appearance={{
          elements: {
            userButtonAvatarBox: "w-10 h-10",
          },
        }}
      />
    </div>
  );
}
