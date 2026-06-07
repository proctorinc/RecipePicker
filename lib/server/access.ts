import { auth, currentUser } from "@clerk/nextjs/server";

import { openDatabase } from "@/lib/server/database";
import { userAccessTiers } from "@/lib/server/db";

export type AppRole = "admin" | "user";
export type SubscriptionTier = "free" | "premium";

export type AppAccessContext = {
  clerkUserId: string;
  appRole: AppRole;
  subscriptionTier: SubscriptionTier;
  isAdmin: boolean;
  isPremium: boolean;
};

export async function getAppAccessContext(): Promise<AppAccessContext> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Authentication required.");
  }

  const user = await currentUser();
  const { db, sqlite } = openDatabase();

  try {
    const row = db.query.userAccessTiers.findFirst({
      where: (table, { eq }) => eq(table.clerkUserId, userId),
    }).sync();
    const appRole = normalizeAppRole(user?.publicMetadata?.appRole ?? user?.publicMetadata?.role);
    const subscriptionTier = normalizeSubscriptionTier(row?.subscriptionTier);

    return {
      clerkUserId: userId,
      appRole,
      subscriptionTier,
      isAdmin: appRole === "admin",
      isPremium: subscriptionTier === "premium",
    };
  } finally {
    sqlite.close();
  }
}

export async function requireAdminAccess() {
  const context = await getAppAccessContext();

  if (!context.isAdmin) {
    throw new Error("This page requires admin access.");
  }

  return context;
}

export async function requirePremiumTier() {
  const context = await getAppAccessContext();

  if (!context.isPremium) {
    throw new Error("Premium is required for this action.");
  }

  return context;
}

export function canConfigureAi(args: {
  subscriptionTier: SubscriptionTier;
  householdRole: "owner" | "member";
}) {
  return args.subscriptionTier === "premium" && args.householdRole === "owner";
}

export function normalizeAppRole(value: unknown): AppRole {
  return value === "admin" ? "admin" : "user";
}

export function normalizeSubscriptionTier(value: unknown): SubscriptionTier {
  return value === "premium" ? "premium" : "free";
}

export function getPinterestPinHref(pinId: string | null | undefined) {
  const normalizedPinId = pinId?.trim();

  if (!normalizedPinId) {
    return null;
  }

  return `https://www.pinterest.com/pin/${encodeURIComponent(normalizedPinId)}/`;
}

export function resolveFeedCardHref(args: {
  recipeId: string;
  pinId: string | null | undefined;
  subscriptionTier: SubscriptionTier;
  fallbackUrl?: string | null;
}) {
  const recipeHref = `/recipe/${args.recipeId}`;

  if (args.subscriptionTier === "premium") {
    return recipeHref;
  }

  return getPinterestPinHref(args.pinId) ?? args.fallbackUrl ?? recipeHref;
}

export async function upsertUserSubscriptionTier(args: {
  clerkUserId: string;
  subscriptionTier: SubscriptionTier;
}) {
  const { db, sqlite } = openDatabase();

  try {
    const now = new Date().toISOString();

    db.insert(userAccessTiers)
      .values({
        clerkUserId: args.clerkUserId,
        subscriptionTier: args.subscriptionTier,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userAccessTiers.clerkUserId],
        set: {
          subscriptionTier: args.subscriptionTier,
          updatedAt: now,
        },
      })
      .run();
  } finally {
    sqlite.close();
  }
}
