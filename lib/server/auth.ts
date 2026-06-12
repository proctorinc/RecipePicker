import crypto from "node:crypto";
import { cache } from "react";

import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { openDatabase } from "@/lib/server/database";
import { householdMembers, households, type householdMembers as householdMembersTable } from "@/lib/server/db";
import {
  AuthenticationError,
  AuthorizationError,
} from "@/lib/server/errors";
import { logAudit, logWarn } from "@/lib/server/logger";
import { updateRequestContext } from "@/lib/server/request-context";

export type HouseholdRole = "owner" | "member";

export type HouseholdContext = {
  householdId: string;
  householdName: string;
  role: HouseholdRole;
  clerkUserId: string;
};

export type HouseholdMembership = {
  householdId: string;
  role: HouseholdRole;
  clerkUserId: string;
};

type MembershipRow = typeof householdMembersTable.$inferSelect;

export const requireHouseholdContext = cache(async function requireHouseholdContext(): Promise<HouseholdContext> {
  const { userId } = await auth();

  if (!userId) {
    logWarn("auth.authentication_required");
    throw new AuthenticationError();
  }

  updateRequestContext({
    actor: {
      clerkUserId: userId,
    },
  });

  const { db, sqlite } = await openDatabase();

  try {
    const membership = await db.query.householdMembers.findFirst({
      where: (table, { eq }) => eq(table.clerkUserId, userId),
      with: {
        household: true,
      },
    });

    if (membership) {
      updateRequestContext({
        actor: {
          clerkUserId: userId,
          householdId: membership.householdId,
          householdRole: membership.role,
        },
      });
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

    updateRequestContext({
      actor: {
        clerkUserId: userId,
        householdId,
        householdRole: "owner",
      },
    });
    logAudit("household.auto_created", {
      target: {
        householdId,
      },
    });

    return {
      householdId,
      householdName,
      role: "owner",
      clerkUserId: userId,
    };
  } finally {
    await sqlite.close();
  }
});

export async function requireHouseholdRole(role: HouseholdRole) {
  const context = await requireHouseholdContext();

  if (context.role !== role) {
    logWarn("auth.household_role_denied", {
      result: {
        requiredRole: role,
        actualRole: context.role,
      },
    });
    throw new AuthorizationError(`This action requires ${role} access.`);
  }

  return context;
}

export async function getHouseholdMembership(args: {
  householdId: string;
  clerkUserId: string;
}): Promise<HouseholdMembership | null> {
  const { db, sqlite } = await openDatabase();

  try {
    const membership = await db.query.householdMembers.findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.householdId, args.householdId),
          eq(table.clerkUserId, args.clerkUserId),
        ),
    });

    if (!membership) {
      return null;
    }

    return {
      householdId: membership.householdId,
      role: membership.role as HouseholdRole,
      clerkUserId: membership.clerkUserId,
    };
  } finally {
    await sqlite.close();
  }
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
