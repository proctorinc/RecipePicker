import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAccessFlags,
  getRoleFlags,
  getTierFlags,
  isAdminRole,
  isFreeTier,
  isPremiumTier,
  isUserRole,
} from "@/lib/access";
import { openDatabase } from "@/lib/server/database";
import { households, householdMembers, userAccessTiers } from "@/lib/server/db";
import {
  ADMIN_ROLE_OVERRIDE_COOKIE,
  canConfigureAi,
  getCurrentUserAccess,
  normalizeAppRole,
  normalizeRoleOverride,
  requireOwnerOrAdminIntegrationAccess,
  requirePremiumSubscription,
  resolveFeedCardHref,
  upsertUserSubscriptionTier,
} from "@/lib/server/access";
import { AuthorizationError } from "@/lib/server/errors";

const { mockAuth, mockCookies, mockCurrentUser } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCookies: vi.fn(),
  mockCurrentUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  currentUser: mockCurrentUser,
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

let tempDir: string;
let sqlitePath: string;
let originalNodeEnv: string | undefined;

function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  setNodeEnv("development");
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "food-picker-access-"));
  sqlitePath = path.join(tempDir, "test.sqlite");
  process.env.SQLITE_PATH = sqlitePath;
  mockAuth.mockResolvedValue({ userId: "user_123" });
  mockCurrentUser.mockResolvedValue({ publicMetadata: {} });
  mockCookies.mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
  });
});

afterEach(() => {
  setNodeEnv(originalNodeEnv);
  delete process.env.SQLITE_PATH;
  vi.restoreAllMocks();
  mockAuth.mockReset();
  mockCurrentUser.mockReset();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("app access", () => {
  it("defaults to user/free when no metadata or tier row exists", async () => {
    const access = await getCurrentUserAccess();

    expect(access.appRole).toBe("user");
    expect(access.subscriptionTier).toBe("free");
    expect(access.isAdmin).toBe(false);
    expect(access.isFree).toBe(true);
    expect(access.isPremium).toBe(false);
    expect(access.isUser).toBe(true);
  });

  it("reads admin role from Clerk metadata and premium tier from the database", async () => {
    mockCurrentUser.mockResolvedValue({ publicMetadata: { appRole: "admin" } });

    const { db, sqlite } = await openDatabase(sqlitePath);

    try {
      await db.insert(userAccessTiers)
        .values({
          clerkUserId: "user_123",
          subscriptionTier: "premium",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
    } finally {
      await sqlite.close();
    }

    const access = await getCurrentUserAccess();

    expect(access.appRole).toBe("admin");
    expect(access.subscriptionTier).toBe("premium");
    expect(access.isAdmin).toBe(true);
    expect(access.isFree).toBe(false);
    expect(access.isPremium).toBe(true);
    expect(access.isUser).toBe(false);
  });

  it("supports the owner app role", async () => {
    mockCurrentUser.mockResolvedValue({ publicMetadata: { appRole: "owner" } });

    const access = await getCurrentUserAccess();

    expect(access.appRole).toBe("owner");
    expect(access.actualAppRole).toBe("owner");
    expect(access.isOwner).toBe(true);
    expect(access.isAdmin).toBe(false);
    expect(access.isActualAdmin).toBe(false);
    expect(access.isUser).toBe(false);
  });

  it("lets admins preview the UI as another role without losing actual admin access", async () => {
    mockCurrentUser.mockResolvedValue({ publicMetadata: { appRole: "admin" } });
    mockCookies.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === ADMIN_ROLE_OVERRIDE_COOKIE ? { value: "user" } : undefined
      ),
    });

    const access = await getCurrentUserAccess();

    expect(access.appRole).toBe("user");
    expect(access.actualAppRole).toBe("admin");
    expect(access.roleOverride).toBe("user");
    expect(access.isUser).toBe(true);
    expect(access.isAdmin).toBe(false);
    expect(access.isActualAdmin).toBe(true);
  });

  it("upserts subscription tier changes so later reads see the new entitlement", async () => {
    await upsertUserSubscriptionTier({
      clerkUserId: "user_123",
      subscriptionTier: "premium",
    });

    let access = await getCurrentUserAccess();
    expect(access.subscriptionTier).toBe("premium");

    await upsertUserSubscriptionTier({
      clerkUserId: "user_123",
      subscriptionTier: "free",
    });

    access = await getCurrentUserAccess();
    expect(access.subscriptionTier).toBe("free");
  });

  it("sends feed cards to recipe pages for premium users", () => {
    expect(
      resolveFeedCardHref({
        recipeId: "recipe_1",
        pinId: "98765",
        subscriptionTier: "premium",
        fallbackUrl: "https://example.com/recipe",
      }),
    ).toBe("/recipe/recipe_1");
  });

  it("sends feed cards to recipe pages for free users too", () => {
    expect(
      resolveFeedCardHref({
        recipeId: "recipe_1",
        pinId: "98765",
        subscriptionTier: "free",
        fallbackUrl: "https://example.com/recipe",
      }),
    ).toBe("/recipe/recipe_1");
  });

  it("still sends feed cards to recipe pages when no external fallback exists", () => {
    expect(
      resolveFeedCardHref({
        recipeId: "recipe_1",
        pinId: "",
        subscriptionTier: "free",
        fallbackUrl: null,
      }),
    ).toBe("/recipe/recipe_1");
  });

  it("only allows AI configuration for premium household owners", () => {
    expect(canConfigureAi({ subscriptionTier: "premium", householdRole: "owner" })).toBe(true);
    expect(canConfigureAi({ subscriptionTier: "free", householdRole: "owner" })).toBe(false);
    expect(canConfigureAi({ subscriptionTier: "premium", householdRole: "member" })).toBe(false);
  });

  it("requires a premium subscription for premium-only features", async () => {
    await expect(requirePremiumSubscription()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("allows premium users through the premium subscription guard", async () => {
    await upsertUserSubscriptionTier({
      clerkUserId: "user_123",
      subscriptionTier: "premium",
    });

    const access = await requirePremiumSubscription();
    expect(access.subscriptionTier).toBe("premium");
  });

  it("allows household owners to view integration settings", async () => {
    const { db, sqlite } = await openDatabase(sqlitePath);

    try {
      await db.insert(households)
        .values({
          householdId: "household_1",
          name: "Kitchen",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
      await db.insert(householdMembers)
        .values({
          householdId: "household_1",
          clerkUserId: "user_123",
          role: "owner",
          joinedAt: new Date().toISOString(),
        })
        .run();
    } finally {
      await sqlite.close();
    }

    const result = await requireOwnerOrAdminIntegrationAccess();
    expect(result.household.householdId).toBe("household_1");
    expect(result.household.role).toBe("owner");
  });

  it("allows admins to view integration settings even when not household owners", async () => {
    mockCurrentUser.mockResolvedValue({ publicMetadata: { appRole: "admin" } });
    const { db, sqlite } = await openDatabase(sqlitePath);

    try {
      await db.insert(households)
        .values({
          householdId: "household_1",
          name: "Kitchen",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
      await db.insert(householdMembers)
        .values({
          householdId: "household_1",
          clerkUserId: "user_123",
          role: "member",
          joinedAt: new Date().toISOString(),
        })
        .run();
    } finally {
      await sqlite.close();
    }

    const result = await requireOwnerOrAdminIntegrationAccess();
    expect(result.household.role).toBe("member");
    expect(result.access.isActualAdmin).toBe(true);
  });

  it("blocks household members from viewing integration settings", async () => {
    const { db, sqlite } = await openDatabase(sqlitePath);

    try {
      await db.insert(households)
        .values({
          householdId: "household_1",
          name: "Kitchen",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
      await db.insert(householdMembers)
        .values({
          householdId: "household_1",
          clerkUserId: "user_123",
          role: "member",
          joinedAt: new Date().toISOString(),
        })
        .run();
    } finally {
      await sqlite.close();
    }

    await expect(requireOwnerOrAdminIntegrationAccess()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("provides reusable UI access helpers", () => {
    expect(isPremiumTier("premium")).toBe(true);
    expect(isPremiumTier("free")).toBe(false);
    expect(isFreeTier("free")).toBe(true);
    expect(isFreeTier("premium")).toBe(false);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("user")).toBe(false);
    expect(isAdminRole("owner")).toBe(false);
    expect(normalizeAppRole("owner")).toBe("owner");
    expect(normalizeRoleOverride("owner")).toBe("owner");
    expect(isUserRole("user")).toBe(true);
    expect(isUserRole("admin")).toBe(false);
    expect(isUserRole("owner")).toBe(false);
    expect(getTierFlags({ subscriptionTier: "premium" })).toEqual({
      isPremiumTier: true,
      isFreeTier: false,
    });
    expect(getRoleFlags({ appRole: "admin" })).toEqual({
      isAdminRole: true,
      isOwnerRole: false,
      isUserRole: false,
    });
    expect(getRoleFlags({ appRole: "owner" })).toEqual({
      isAdminRole: false,
      isOwnerRole: true,
      isUserRole: false,
    });
    expect(getAccessFlags({ appRole: "user", subscriptionTier: "free" })).toEqual({
      isAdminRole: false,
      isFreeTier: true,
      isOwnerRole: false,
      isPremiumTier: false,
      isUserRole: true,
    });
  });
});
