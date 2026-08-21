"use client";

import { UserButton, useUser } from "@clerk/nextjs";

import { AppTransitionLink } from "@/components/app-transition-link";

export function MobileProfileButton({
  linksToSettings,
}: {
  linksToSettings: boolean;
}) {
  const { isLoaded, user } = useUser();

  if (!linksToSettings) {
    return (
      <div className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/55">
        <UserButton
          appearance={{
            elements: {
              userButtonAvatarBox: "h-10 w-10",
            },
          }}
        />
      </div>
    );
  }

  return (
    <AppTransitionLink
      href="/settings"
      prefetch
      aria-label="Settings"
      title="Settings"
      className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/55 transition hover:bg-secondary/80"
    >
      {isLoaded && user ? (
        <img
          src={user.imageUrl}
          alt="Your profile"
          className="h-10 w-10 rounded-full object-cover"
        />
      ) : (
        <span className="h-10 w-10 animate-pulse rounded-full bg-muted" />
      )}
    </AppTransitionLink>
  );
}
