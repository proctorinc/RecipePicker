"use client";

import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

function shouldShowUserButton(pathname: string) {
  return pathname.startsWith("/settings") || pathname.startsWith("/picker");
}

export function AppShellUserButton() {
  const pathname = usePathname();

  if (!shouldShowUserButton(pathname)) {
    return null;
  }

  return (
    <div className="flex gap-2">
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
