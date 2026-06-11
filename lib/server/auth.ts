import crypto from "node:crypto";

import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { openDatabase } from "@/lib/server/database";
import { householdMembers, households, type householdMembers as householdMembersTable } from "@/lib/server/db";

export type HouseholdRole = "owner" | "member";

export type HouseholdContext = {
  householdId: string;
  householdName: string;
  role: HouseholdRole;
  clerkUserId: string;
};

type MembershipRow = typeof householdMembersTable.$inferSelect;

export async function requireHouseholdContext(): Promise<HouseholdContext> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Authentication required.");
  }

  const { db, sqlite } = await openDatabase();

  try {
    const membership = await db.query.householdMembers.findFirst({
      where: (table, { eq }) => eq(table.clerkUserId, userId),
      with: {
        household: true,
      },
    });

    if (membership) {
      return {
        householdId: membership.householdId,
        householdName: membership.household.name,
        role: membership.role as HouseholdRole,
        clerkUserId: userId,
      };
    }

    const user = await currentUser();
    const now = new Date().toISOString();
    const householdId = crypto.randomUUID();
    const householdName = buildHouseholdName(user?.firstName ?? user?.username ?? null);

    await db.insert(households)
      .values({
        householdId,
        name: householdName,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    await db.insert(householdMembers)
      .values({
        householdId,
        clerkUserId: userId,
        role: "owner",
        joinedAt: now,
      })
      .run();

    return {
      householdId,
      householdName,
      role: "owner",
      clerkUserId: userId,
    };
  } finally {
    await sqlite.close();
  }
}

export async function requireHouseholdRole(role: HouseholdRole) {
  const context = await requireHouseholdContext();

  if (context.role !== role) {
    throw new Error(`This action requires ${role} access.`);
  }

  return context;
}

export async function listHouseholdMembers(householdId: string) {
  const { db, sqlite } = await openDatabase();

  try {
    return await db.query.householdMembers.findMany({
      where: (table, { eq }) => eq(table.householdId, householdId),
      orderBy: (table, { asc }) => [asc(table.joinedAt)],
    });
  } finally {
    await sqlite.close();
  }
}

export async function addMemberToHousehold(householdId: string, clerkUserId: string, role: HouseholdRole = "member") {
  const { db, sqlite } = await openDatabase();

  try {
    const existing = await db.query.householdMembers.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, householdId), eq(table.clerkUserId, clerkUserId)),
    });

    if (existing) {
      return existing;
    }

    const membership = {
      householdId,
      clerkUserId,
      role,
      joinedAt: new Date().toISOString(),
    } satisfies Omit<MembershipRow, "membershipId">;

    await db.insert(householdMembers).values(membership).run();
    return membership;
  } finally {
    await sqlite.close();
  }
}

function buildHouseholdName(firstName: string | null) {
  if (!firstName) {
    return "Shared kitchen";
  }

  return `${firstName}'s kitchen`;
}
