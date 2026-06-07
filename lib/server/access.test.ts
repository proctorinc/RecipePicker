import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDatabase } from "@/lib/server/database";
import { userAccessTiers } from "@/lib/server/db";
import {
  canConfigureAi,
  getAppAccessContext,
  resolveFeedCardHref,
  upsertUserSubscriptionTier,
} from "@/lib/server/access";

const { mockAuth, mockCurrentUser } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCurrentUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  currentUser: mockCurrentUser,
}));

let tempDir: string;
let sqlitePath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "food-picker-access-"));
  sqlitePath = path.join(tempDir, "test.sqlite");
  process.env.SQLITE_PATH = sqlitePath;
  mockAuth.mockResolvedValue({ userId: "user_123" });
  mockCurrentUser.mockResolvedValue({ publicMetadata: {} });
});

afterEach(() => {
  delete process.env.SQLITE_PATH;
  vi.restoreAllMocks();
  mockAuth.mockReset();
  mockCurrentUser.mockReset();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("app access", () => {
  it("defaults to user/free when no metadata or tier row exists", async () => {
    const access = await getAppAccessContext();

    expect(access.appRole).toBe("user");
    expect(access.subscriptionTier).toBe("free");
    expect(access.isAdmin).toBe(false);
    expect(access.isPremium).toBe(false);
  });

  it("reads admin role from Clerk metadata and premium tier from the database", async () => {
    mockCurrentUser.mockResolvedValue({ publicMetadata: { appRole: "admin" } });

    const { db, sqlite } = openDatabase(sqlitePath);

    try {
      db.insert(userAccessTiers)
        .values({
          clerkUserId: "user_123",
          subscriptionTier: "premium",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
    } finally {
      sqlite.close();
    }

    const access = await getAppAccessContext();

    expect(access.appRole).toBe("admin");
    expect(access.subscriptionTier).toBe("premium");
    expect(access.isAdmin).toBe(true);
    expect(access.isPremium).toBe(true);
  });

  it("upserts subscription tier changes so later reads see the new entitlement", async () => {
    await upsertUserSubscriptionTier({
      clerkUserId: "user_123",
      subscriptionTier: "premium",
    });

    let access = await getAppAccessContext();
    expect(access.subscriptionTier).toBe("premium");

    await upsertUserSubscriptionTier({
      clerkUserId: "user_123",
      subscriptionTier: "free",
    });

    access = await getAppAccessContext();
    expect(access.subscriptionTier).toBe("free");
  });

  it("sends premium users to recipe pages from feed cards", () => {
    expect(
      resolveFeedCardHref({
        recipeId: "recipe_1",
        pinId: "98765",
        subscriptionTier: "premium",
        fallbackUrl: "https://example.com/recipe",
      }),
    ).toBe("/recipe/recipe_1");
  });

  it("sends free users to Pinterest pins from feed cards", () => {
    expect(
      resolveFeedCardHref({
        recipeId: "recipe_1",
        pinId: "98765",
        subscriptionTier: "free",
        fallbackUrl: "https://example.com/recipe",
      }),
    ).toBe("https://www.pinterest.com/pin/98765/");
  });

  it("falls back to the recipe page when a free-tier card cannot build an external link", () => {
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
});
