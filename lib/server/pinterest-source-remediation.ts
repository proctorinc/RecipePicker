import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import { openDatabase } from "@/lib/server/database";
import { normalizeRecipeSourceUrl } from "@/lib/recipe-source-url";

type RecipeRow = {
  recipe_id: string;
  pin_id: string;
  created_at: string;
};

type PinRow = {
  pin_id: string;
  household_id: string;
  pinterest_pin_id: string;
  pinterest_board_id: string;
  link: string | null;
  source_url_key: string | null;
};

export type PinterestSourceRemediationGroup = {
  normalizedSourceUrl: string;
  rawSourceUrls: string[];
  householdId: string;
  pinterestPinId: string;
  survivorRecipeId: string;
  survivorPinId: string;
  duplicateRecipeIds: string[];
  duplicatePinIds: string[];
  identityPinIds: string[];
  boardIds: string[];
  dependentRowCounts: Record<string, number>;
  actions: string[];
  blockedReason: string | null;
};

export type PinterestSourceRemediationReport = {
  version: 1;
  generatedAt: string;
  target: string;
  groups: PinterestSourceRemediationGroup[];
  blockingGroups: PinterestSourceRemediationGroup[];
  sourceUrlKeyBackfills: Array<{ pinId: string; sourceUrlKey: string }>;
  fingerprint: string;
};

const DEPENDENT_TABLES = [
  "household_recipe_ingredient_alternatives",
  "household_recipe_ingredients",
  "household_recipe_steps",
  "household_recipe_reviews",
  "household_recipe_events",
  "household_recipe_feedback",
  "household_recipe_extraction_feedback",
  "household_recipe_parse_job_items",
  "recipe_tag_memberships",
  "recipe_folder_memberships",
  "pinterest_sync_recipe_changes",
  "household_recipe_versions",
  "household_recipe_instructions",
  "household_recipe_extraction_attempts",
  "household_recipe_extractions",
  "household_recipe_sources",
] as const;

function valuesList(values: string[]) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

function reportFingerprint(args: {
  groups: PinterestSourceRemediationGroup[];
  sourceUrlKeyBackfills: Array<{ pinId: string; sourceUrlKey: string }>;
}) {
  return createHash("sha256").update(JSON.stringify(args)).digest("hex");
}

async function countRows(db: Awaited<ReturnType<typeof openDatabase>>["db"], query: ReturnType<typeof sql>) {
  const row = await db.get<{ count: number }>(query);
  return Number(row?.count ?? 0);
}

async function getDependentRowCounts(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  recipeIds: string[],
  pinIds: string[],
) {
  if (recipeIds.length === 0 && pinIds.length === 0) {
    return Object.fromEntries(DEPENDENT_TABLES.map((table) => [table, 0]));
  }

  const recipes = recipeIds.length ? valuesList(recipeIds) : sql`NULL`;
  const pins = pinIds.length ? valuesList(pinIds) : sql`NULL`;
  const [alternatives, ingredients, steps, reviews, events, feedback, extractionFeedback, jobItems, tags, folders, changes, versions, instructions, attempts, extractions, sources] = await Promise.all([
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_ingredient_alternatives WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_ingredients WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_steps WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_reviews WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_events WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_feedback WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_extraction_feedback WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_parse_job_items WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM recipe_tag_memberships WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM recipe_folder_memberships WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM pinterest_sync_recipe_changes WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_versions WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_instructions WHERE recipe_id IN (${recipes})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_extraction_attempts WHERE pin_id IN (${pins})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_extractions WHERE pin_id IN (${pins})`),
    countRows(db, sql`SELECT count(*) AS count FROM household_recipe_sources WHERE pin_id IN (${pins})`),
  ]);
  return Object.fromEntries([
    ["household_recipe_ingredient_alternatives", alternatives], ["household_recipe_ingredients", ingredients],
    ["household_recipe_steps", steps], ["household_recipe_reviews", reviews], ["household_recipe_events", events],
    ["household_recipe_feedback", feedback], ["household_recipe_extraction_feedback", extractionFeedback],
    ["household_recipe_parse_job_items", jobItems], ["recipe_tag_memberships", tags], ["recipe_folder_memberships", folders],
    ["pinterest_sync_recipe_changes", changes], ["household_recipe_versions", versions],
    ["household_recipe_instructions", instructions], ["household_recipe_extraction_attempts", attempts],
    ["household_recipe_extractions", extractions], ["household_recipe_sources", sources],
  ]);
}

export async function planPinterestSourceRemediation(sqlitePath?: string): Promise<PinterestSourceRemediationReport> {
  const { db, sqlite, targetLabel } = await openDatabase(sqlitePath);
  try {
    const rows = await db.all<RecipeRow & PinRow>(sql`
      SELECT r.recipe_id, r.pin_id, r.created_at, p.household_id, p.pinterest_pin_id, p.pinterest_board_id,
             p.link, p.source_url_key
      FROM household_recipes r
      INNER JOIN household_pins p ON p.pin_id = r.pin_id
      WHERE p.pinterest_pin_id NOT LIKE 'personal:%'
      ORDER BY p.household_id, r.created_at, r.recipe_id
    `);
    const recipesByIdentity = new Map<string, (RecipeRow & PinRow)[]>();
    for (const row of rows) {
      const sourceUrlKey = row.source_url_key ?? normalizeRecipeSourceUrl(row.link);
      if (!sourceUrlKey) continue;
      const key = `${row.household_id}\u0000${sourceUrlKey}`;
      recipesByIdentity.set(key, [...(recipesByIdentity.get(key) ?? []), row]);
    }

    const groups: PinterestSourceRemediationGroup[] = [];
    for (const [identity, recipes] of recipesByIdentity) {
      const [householdId, normalizedSourceUrl] = identity.split("\u0000");
      const survivor = recipes[0]!;
      const duplicates = recipes.slice(1);
      if (duplicates.length === 0) continue;

      const tied = duplicates.some((recipe) => recipe.created_at === survivor.created_at);
      const duplicatePinIds = [...new Set(duplicates.map((recipe) => recipe.pin_id))];
      const identityPinIds = [...new Set(recipes.map((recipe) => recipe.pin_id))];
      const removedPinIds = duplicatePinIds;
      const counts = await getDependentRowCounts(db, duplicates.map((recipe) => recipe.recipe_id), removedPinIds);
      groups.push({
        normalizedSourceUrl: normalizedSourceUrl!, rawSourceUrls: [...new Set(recipes.map((recipe) => recipe.link).filter((link): link is string => Boolean(link)))],
        householdId: householdId!, pinterestPinId: survivor.pinterest_pin_id, survivorRecipeId: survivor.recipe_id,
        survivorPinId: survivor.pin_id,
        duplicateRecipeIds: duplicates.map((recipe) => recipe.recipe_id), duplicatePinIds, identityPinIds,
        boardIds: [...new Set(recipes.map((recipe) => recipe.pinterest_board_id))],
        dependentRowCounts: counts,
        actions: [
          ...(duplicates.length ? ["delete later duplicate recipes and dependent records"] : []),
          "backfill the retained Pin source URL key",
        ],
        blockedReason: tied ? "Multiple recipes have the earliest created_at; choose the original manually." : null,
      });
    }
    const duplicatePinIds = new Set(groups.flatMap((group) => group.duplicatePinIds));
    const sourceUrlKeyBackfills = rows.flatMap((row) => {
      const sourceUrlKey = normalizeRecipeSourceUrl(row.link);
      return !duplicatePinIds.has(row.pin_id) && sourceUrlKey && sourceUrlKey !== row.source_url_key
        ? [{ pinId: row.pin_id, sourceUrlKey }]
        : [];
    });
    const blockingGroups = groups.filter((group) => group.blockedReason);
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      target: targetLabel,
      groups,
      blockingGroups,
      sourceUrlKeyBackfills,
      fingerprint: reportFingerprint({ groups, sourceUrlKeyBackfills }),
    };
  } finally {
    await sqlite.close();
  }
}

async function run(db: { run: (query: ReturnType<typeof sql>) => unknown }, query: ReturnType<typeof sql>) {
  await db.run(query);
}

async function deleteDuplicateData(
  db: { run: (query: ReturnType<typeof sql>) => unknown },
  recipeIds: string[],
  pinIds: string[],
) {
  if (recipeIds.length) {
    const recipes = valuesList(recipeIds);
    await run(db, sql`DELETE FROM household_recipe_ingredient_alternatives WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM household_recipe_ingredients WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM household_recipe_steps WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM household_recipe_reviews WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM household_recipe_events WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM household_recipe_feedback WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM household_recipe_extraction_feedback WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM household_recipe_parse_job_items WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM recipe_tag_memberships WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM recipe_folder_memberships WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM pinterest_sync_recipe_changes WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM household_recipe_versions WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM household_recipe_instructions WHERE recipe_id IN (${recipes})`);
    await run(db, sql`DELETE FROM household_recipes WHERE recipe_id IN (${recipes})`);
  }
  if (pinIds.length) {
    const pins = valuesList(pinIds);
    const extractionIds = await (db as unknown as { all: <T>(query: ReturnType<typeof sql>) => Promise<T[]> }).all<{ extraction_id: string }>(
      sql`SELECT extraction_id FROM household_recipe_extractions WHERE pin_id IN (${pins})`,
    );
    const sourceIds = await (db as unknown as { all: <T>(query: ReturnType<typeof sql>) => Promise<T[]> }).all<{ source_id: string }>(
      sql`SELECT source_id FROM household_recipe_sources WHERE pin_id IN (${pins})`,
    );
    if (extractionIds.length) {
      const extractions = valuesList(extractionIds.map((row) => row.extraction_id));
      await run(db, sql`DELETE FROM household_recipe_extraction_feedback WHERE extraction_id IN (${extractions})`);
      await run(db, sql`DELETE FROM household_recipe_parse_job_items WHERE last_extraction_id IN (${extractions})`);
    }
    if (sourceIds.length) {
      const sources = valuesList(sourceIds.map((row) => row.source_id));
      await run(db, sql`DELETE FROM household_recipe_extraction_attempts WHERE source_id IN (${sources})`);
    }
    await run(db, sql`DELETE FROM household_recipe_extraction_attempts WHERE pin_id IN (${pins})`);
    await run(db, sql`DELETE FROM household_recipe_extractions WHERE pin_id IN (${pins})`);
    await run(db, sql`DELETE FROM household_recipe_sources WHERE pin_id IN (${pins})`);
    await run(db, sql`DELETE FROM household_pins WHERE pin_id IN (${pins})`);
  }
}

function deleteDuplicateDataSync(
  db: { run: (query: ReturnType<typeof sql>) => unknown; all: <T>(query: ReturnType<typeof sql>) => T[] },
  recipeIds: string[],
  pinIds: string[],
) {
  if (recipeIds.length) {
    const recipes = valuesList(recipeIds);
    db.run(sql`DELETE FROM household_recipe_ingredient_alternatives WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM household_recipe_ingredients WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM household_recipe_steps WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM household_recipe_reviews WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM household_recipe_events WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM household_recipe_feedback WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM household_recipe_extraction_feedback WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM household_recipe_parse_job_items WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM recipe_tag_memberships WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM recipe_folder_memberships WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM pinterest_sync_recipe_changes WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM household_recipe_versions WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM household_recipe_instructions WHERE recipe_id IN (${recipes})`);
    db.run(sql`DELETE FROM household_recipes WHERE recipe_id IN (${recipes})`);
  }
  if (pinIds.length) {
    const pins = valuesList(pinIds);
    const extractionIds = db.all<{ extraction_id: string }>(sql`SELECT extraction_id FROM household_recipe_extractions WHERE pin_id IN (${pins})`);
    const sourceIds = db.all<{ source_id: string }>(sql`SELECT source_id FROM household_recipe_sources WHERE pin_id IN (${pins})`);
    if (extractionIds.length) {
      const extractions = valuesList(extractionIds.map((row) => row.extraction_id));
      db.run(sql`DELETE FROM household_recipe_extraction_feedback WHERE extraction_id IN (${extractions})`);
      db.run(sql`DELETE FROM household_recipe_parse_job_items WHERE last_extraction_id IN (${extractions})`);
    }
    if (sourceIds.length) db.run(sql`DELETE FROM household_recipe_extraction_attempts WHERE source_id IN (${valuesList(sourceIds.map((row) => row.source_id))})`);
    db.run(sql`DELETE FROM household_recipe_extraction_attempts WHERE pin_id IN (${pins})`);
    db.run(sql`DELETE FROM household_recipe_extractions WHERE pin_id IN (${pins})`);
    db.run(sql`DELETE FROM household_recipe_sources WHERE pin_id IN (${pins})`);
    db.run(sql`DELETE FROM household_pins WHERE pin_id IN (${pins})`);
  }
}

export async function applyPinterestSourceRemediation(args: {
  reviewedReport: PinterestSourceRemediationReport;
  sqlitePath?: string;
}) {
  const current = await planPinterestSourceRemediation(args.sqlitePath);
  if (current.fingerprint !== args.reviewedReport.fingerprint) {
    throw new Error("The reviewed report no longer matches the database. Run a new dry run and review it before applying cleanup.");
  }
  if (current.blockingGroups.length) {
    throw new Error("Cleanup is blocked because one or more duplicate groups have an ambiguous earliest recipe.");
  }
  const { db, sqlite, driver } = await openDatabase(args.sqlitePath);
  try {
    if (driver === "sqlite") {
      const sqliteDb = db as unknown as {
        transaction: (callback: (transaction: {
          run: (query: ReturnType<typeof sql>) => unknown;
          all: <T>(query: ReturnType<typeof sql>) => T[];
        }) => void) => void;
      };
      sqliteDb.transaction((tx) => {
        tx.run(sql`PRAGMA defer_foreign_keys = ON`);
        for (const group of current.groups) {
          deleteDuplicateDataSync(tx, group.duplicateRecipeIds, group.duplicatePinIds);
        }
        for (const backfill of current.sourceUrlKeyBackfills) {
          tx.run(sql`UPDATE household_pins SET source_url_key = ${backfill.sourceUrlKey} WHERE pin_id = ${backfill.pinId}`);
        }
      });
      return { appliedGroups: current.groups.length, backfilledPins: current.sourceUrlKeyBackfills.length, fingerprint: current.fingerprint };
    }
    const transactionDb = db as unknown as {
      transaction: (callback: (transaction: typeof db) => Promise<void>) => Promise<void>;
    };
    await transactionDb.transaction(async (tx) => {
      await tx.run(sql`PRAGMA defer_foreign_keys = ON`);
      for (const group of current.groups) {
        await deleteDuplicateData(tx, group.duplicateRecipeIds, group.duplicatePinIds);
      }
      for (const backfill of current.sourceUrlKeyBackfills) {
        await tx.run(sql`UPDATE household_pins SET source_url_key = ${backfill.sourceUrlKey} WHERE pin_id = ${backfill.pinId}`);
      }
    });
    return { appliedGroups: current.groups.length, backfilledPins: current.sourceUrlKeyBackfills.length, fingerprint: current.fingerprint };
  } finally {
    await sqlite.close();
  }
}
