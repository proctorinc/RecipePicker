import { and, eq } from "drizzle-orm";

import { recipeTagMemberships, recipeTags } from "@/lib/server/db";
import {
  LEGACY_SAVE_FOR_LATER_TAG_NORMALIZED_NAME,
  SAVE_FOR_LATER_TAG_NAME,
  SAVE_FOR_LATER_TAG_NORMALIZED_NAME,
} from "@/lib/recipe-tags";
import type { openDatabase } from "@/lib/server/database";

type DatabaseHandle = Awaited<ReturnType<typeof openDatabase>>["db"];

/** Renames the original built-in collection without losing its recipe memberships. */
export async function ensureSavedForLaterTag(db: DatabaseHandle, householdId: string) {
  const now = new Date().toISOString();
  const tags = await db.query.recipeTags.findMany({
    where: (table, { and, eq, inArray }) => and(
      eq(table.householdId, householdId),
      inArray(table.normalizedName, [
        SAVE_FOR_LATER_TAG_NORMALIZED_NAME,
        LEGACY_SAVE_FOR_LATER_TAG_NORMALIZED_NAME,
      ]),
    ),
  });
  const currentTag = tags.find((tag) => tag.normalizedName === SAVE_FOR_LATER_TAG_NORMALIZED_NAME);
  const legacyTag = tags.find((tag) => tag.normalizedName === LEGACY_SAVE_FOR_LATER_TAG_NORMALIZED_NAME);

  if (!currentTag && legacyTag) {
    await db.update(recipeTags)
      .set({ name: SAVE_FOR_LATER_TAG_NAME, normalizedName: SAVE_FOR_LATER_TAG_NORMALIZED_NAME, updatedAt: now })
      .where(eq(recipeTags.tagId, legacyTag.tagId))
      .run();
    return;
  }

  if (currentTag && legacyTag) {
    const legacyMemberships = await db.query.recipeTagMemberships.findMany({
      where: (table, { and, eq }) => and(
        eq(table.householdId, householdId),
        eq(table.tagId, legacyTag.tagId),
      ),
    });
    if (legacyMemberships.length > 0) {
      await db.insert(recipeTagMemberships)
        .values(legacyMemberships.map((membership) => ({
          householdId,
          recipeId: membership.recipeId,
          tagId: currentTag.tagId,
          createdAt: now,
          updatedAt: now,
        })))
        .onConflictDoNothing()
        .run();
      await db.delete(recipeTagMemberships)
        .where(and(eq(recipeTagMemberships.householdId, householdId), eq(recipeTagMemberships.tagId, legacyTag.tagId)))
        .run();
    }
    await db.delete(recipeTags).where(eq(recipeTags.tagId, legacyTag.tagId)).run();
    return;
  }

  if (!currentTag) {
    await db.insert(recipeTags)
      .values({ householdId, name: SAVE_FOR_LATER_TAG_NAME, normalizedName: SAVE_FOR_LATER_TAG_NORMALIZED_NAME, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
  }
}
