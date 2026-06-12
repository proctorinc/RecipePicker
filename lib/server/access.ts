import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import {
  type AppRole,
  type SubscriptionTier,
  getAccessFlags,
  isPremiumTier,
} from "@/lib/access";
import { requireHouseholdContext } from "@/lib/server/auth";
import { openDatabase } from "@/lib/server/database";
import { userAccessTiers } from "@/lib/server/db";
import {
  AuthenticationError,
  AuthorizationError,
} from "@/lib/server/errors";
import { logWarn } from "@/lib/server/logger";
import { updateRequestContext } from "@/lib/server/request-context";

export const ADMIN_ROLE_OVERRIDE_COOKIE = "food-picker-admin-role-override";
export type { AppRole, SubscriptionTier } from "@/lib/access";

export type AppAccessContext = {
  clerkUserId: string;
  appRole: AppRole;
  actualAppRole: AppRole;
  subscriptionTier: SubscriptionTier;
  isAdmin: boolean;
  isActualAdmin: boolean;
  isFree: boolean;
  isOwner: boolean;
  isPremium: boolean;
  isUser: boolean;
  roleOverride: AppRole | null;
};

export const getCurrentUserAccess = cache(async function getCurrentUserAccess(): Promise<AppAccessContext> {
  const { userId } = await auth();

  if (!userId) {
    logWarn("auth.authentication_required");
    throw new AuthenticationError();
  }

  const user = await currentUser();
  const cookieStore = await cookies();
  const { db, sqlite } = await openDatabase();

  try {
    const row = await db.query.userAccessTiers.findFirst({
      where: (table, { eq }) => eq(table.clerkUserId, userId),
    });
    const actualAppRole = normalizeAppRole(user?.publicMetadata?.appRole ?? user?.publicMetadata?.role);
    const subscriptionTier = normalizeSubscriptionTier(row?.subscriptionTier);
    const roleOverride = actualAppRole === "admin"
      ? normalizeRoleOverride(cookieStore.get(ADMIN_ROLE_OVERRIDE_COOKIE)?.value)
      : null;
    const appRole = roleOverride ?? actualAppRole;
    const {
      isAdminRole: hasAdminRole,
      isOwnerRole: hasOwnerRole,
      isFreeTier,
      isPremiumTier: hasPremiumTier,
      isUserRole,
    } = getAccessFlags({ appRole, subscriptionTier });

    updateRequestContext({
      actor: {
        clerkUserId: userId,
        appRole,
      },
    });

    return {
      clerkUserId: userId,
      appRole,
      actualAppRole,
      subscriptionTier,
      isAdmin: hasAdminRole,
      isActualAdmin: actualAppRole === "admin",
      isFree: isFreeTier,
      isOwner: hasOwnerRole,
      isPremium: hasPremiumTier,
      isUser: isUserRole,
      roleOverride,
    };
  } finally {
    await sqlite.close();
  }
});

export async function requireAdminAccess() {
  const context = await getCurrentUserAccess();

  if (!context.isActualAdmin) {
    logWarn("auth.admin_access_denied", {
      result: {
        actualAppRole: context.actualAppRole,
      },
    });
    throw new AuthorizationError("This page requires admin access.");
  }

  return context;
}

export async function requirePremiumTier() {
  const context = await getCurrentUserAccess();

  if (!context.isPremium) {
    logWarn("auth.premium_required", {
      result: {
        subscriptionTier: context.subscriptionTier,
      },
    });
    throw new AuthorizationError("Premium is required for this action.");
  }

  return context;
}

export async function requirePremiumSubscription() {
  const context = await getCurrentUserAccess();

  if (!context.isPremium) {
    logWarn("auth.premium_required", {
      result: {
        subscriptionTier: context.subscriptionTier,
      },
    });
    throw new AuthorizationError("Premium is required for this action.");
  }

  return context;
}

export async function requireOwnerOrAdminIntegrationAccess() {
  const [household, access] = await Promise.all([
    requireHouseholdContext(),
    getCurrentUserAccess(),
  ]);

  if (household.role !== "owner" && !access.isActualAdmin) {
    logWarn("auth.integration_view_denied", {
      target: {
        householdId: household.householdId,
      },
      result: {
        householdRole: household.role,
        actualAppRole: access.actualAppRole,
      },
    });
    throw new AuthorizationError(
      "You do not have permission to view this integration.",
    );
  }

  return {
    household,
    access,
  };
}

export function canConfigureAi(args: {
  subscriptionTier: SubscriptionTier;
  householdRole: "owner" | "member";
}) {
  return isPremiumTier(args.subscriptionTier) && args.householdRole === "owner";
}

export function normalizeAppRole(value: unknown): AppRole {
  if (value === "admin" || value === "owner") {
    return value;
  }

  return "user";
}

export function normalizeSubscriptionTier(value: unknown): SubscriptionTier {
  return value === "premium" ? "premium" : "free";
}

export function normalizeRoleOverride(value: unknown): AppRole | null {
  if (value === "admin" || value === "owner" || value === "user") {
    return value;
  }

  return null;
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
  return `/recipe/${args.recipeId}`;
}

export async function upsertUserSubscriptionTier(args: {
  clerkUserId: string;
  subscriptionTier: SubscriptionTier;
}) {
  const { db, sqlite } = await openDatabase();

  try {
    const now = new Date().toISOString();

    await db.insert(userAccessTiers)
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
    await sqlite.close();
  }
}
