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

  const { db, sqlite } = openDatabase();

  try {
    const membership = db.query.householdMembers.findFirst({
      where: (table, { eq }) => eq(table.clerkUserId, userId),
      with: {
        household: true,
      },
    }).sync();

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

    sqlite.transaction(() => {
      db.insert(households)
        .values({
          householdId,
          name: householdName,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(householdMembers)
        .values({
          householdId,
          clerkUserId: userId,
          role: "owner",
          joinedAt: now,
        })
        .run();
    })();

    return {
      householdId,
      householdName,
      role: "owner",
      clerkUserId: userId,
    };
  } finally {
    sqlite.close();
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
  const { db, sqlite } = openDatabase();

  try {
    return db.query.householdMembers.findMany({
      where: (table, { eq }) => eq(table.householdId, householdId),
      orderBy: (table, { asc }) => [asc(table.joinedAt)],
    }).sync();
  } finally {
    sqlite.close();
  }
}

export async function addMemberToHousehold(householdId: string, clerkUserId: string, role: HouseholdRole = "member") {
  const { db, sqlite } = openDatabase();

  try {
    const existing = db.query.householdMembers.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, householdId), eq(table.clerkUserId, clerkUserId)),
    }).sync();

    if (existing) {
      return existing;
    }

    const membership = {
      householdId,
      clerkUserId,
      role,
      joinedAt: new Date().toISOString(),
    } satisfies Omit<MembershipRow, "membershipId">;

    db.insert(householdMembers).values(membership).run();
    return membership;
  } finally {
    sqlite.close();
  }
}

function buildHouseholdName(firstName: string | null) {
  if (!firstName) {
    return "Shared kitchen";
  }

  return `${firstName}'s kitchen`;
}
