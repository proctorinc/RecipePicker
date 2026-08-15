import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";

import {
  householdCanonicalIngredients,
  householdIngredientAliases,
  householdIngredientPhraseMappings,
} from "@/lib/server/db";
import { getIngredientAiSuggestions } from "@/lib/server/ingredient-ai";
import type { CanonicalIngredientOption, IngredientReviewSuggestionView } from "@/types/view-models";

export type IngredientKind = "family" | "base" | "leaf";
export type IngredientNormalizationStatus = "auto_matched" | "needs_review" | "confirmed";

export type ParsedIngredientInput = {
  originalText: string;
  ingredientText: string | null;
};

export type IngredientNormalizationResult = {
  normalizedIngredientPhrase: string | null;
  canonicalIngredientId: string | null;
  canonicalDisplayName: string | null;
  parentCanonicalIngredientId: string | null;
  parentCanonicalDisplayName: string | null;
  ingredientKind: IngredientKind | null;
  attributes: string[];
  matchConfidence: number | null;
  matchedBy: string | null;
  normalizationStatus: IngredientNormalizationStatus;
  aiSuggestions: IngredientReviewSuggestionView[];
};

export type IngredientSearchResolution = {
  normalizedIngredientPhrase: string;
  canonicalIngredientId: string;
  canonicalDisplayName: string;
  parentCanonicalIngredientId: string | null;
  parentCanonicalDisplayName: string | null;
  ingredientKind: IngredientKind;
  catalogStatus?: "provisional" | "confirmed";
  descendantCanonicalIngredientIds: string[];
  searchCanonicalIngredientIds: string[];
  attributes: string[];
  matchConfidence: number | null;
  matchedBy: string | null;
  normalizationStatus: IngredientNormalizationStatus;
};

type CatalogSeed = {
  displayName: string;
  ingredientKind: IngredientKind;
  aliases?: string[];
  parentDisplayName?: string;
};

type ResolvedIngredient = {
  canonicalIngredientId: string | null;
  canonicalDisplayName: string | null;
  parentCanonicalIngredientId: string | null;
  parentCanonicalDisplayName: string | null;
  ingredientKind: IngredientKind | null;
  attributes: string[];
  matchConfidence: number | null;
  matchedBy: string | null;
  normalizationStatus: IngredientNormalizationStatus;
  aiSuggestions: IngredientReviewSuggestionView[];
};

type CanonicalWithParent = {
  canonicalIngredientId: string;
  householdId: string;
  displayName: string;
  normalizedKey: string;
  parentCanonicalIngredientId: string | null;
  ingredientKind: IngredientKind;
  catalogStatus: "provisional" | "confirmed";
  createdAt: string;
  updatedAt: string;
  parentCanonicalIngredient?: {
    canonicalIngredientId: string;
    displayName: string;
    normalizedKey: string;
    ingredientKind: IngredientKind;
    catalogStatus: "provisional" | "confirmed";
    parentCanonicalIngredientId: string | null;
    householdId: string;
    createdAt: string;
    updatedAt: string;
  } | null;
};

const DEFAULT_INGREDIENT_SEEDS: CatalogSeed[] = [
  {
    displayName: "All-purpose flour",
    ingredientKind: "leaf",
    aliases: ["all purpose flour"],
  },
  {
    displayName: "Bread flour",
    ingredientKind: "leaf",
  },
  {
    displayName: "Brown sugar",
    ingredientKind: "base",
  },
  {
    displayName: "Butter",
    ingredientKind: "base",
  },
  {
    displayName: "Chicken",
    ingredientKind: "family",
  },
  {
    displayName: "Chicken breast",
    ingredientKind: "leaf",
    parentDisplayName: "Chicken",
  },
  {
    displayName: "Chicken thigh",
    ingredientKind: "leaf",
    parentDisplayName: "Chicken",
  },
  {
    displayName: "Ground chicken",
    ingredientKind: "leaf",
    parentDisplayName: "Chicken",
  },
  {
    displayName: "Green onion",
    ingredientKind: "leaf",
    aliases: ["green onions", "scallion", "scallions", "spring onion", "spring onions"],
  },
  {
    displayName: "Paprika",
    ingredientKind: "leaf",
  },
];

const ATTRIBUTE_PREFIXES = new Set(["dark", "fresh", "light", "red", "salted", "smoked", "sweet", "unsalted"]);
const AMBIGUOUS_TOKENS = ["blend", "bouillon", "broth", "dressing", "marinade", "mix", "paste", "rub", "sauce", "seasoning", "soup", "stock"];
const AI_AUTO_MATCH_CONFIDENCE_THRESHOLD = 92;

export async function normalizeIngredientForHousehold(
  db: any,
  householdId: string,
  ingredient: ParsedIngredientInput,
): Promise<IngredientNormalizationResult> {
  await ensureDefaultIngredientCatalog(db, householdId);

  const normalizedIngredientPhrase = normalizeIngredientKey(ingredient.ingredientText ?? ingredient.originalText);

  if (!normalizedIngredientPhrase) {
    return {
      normalizedIngredientPhrase: null,
      canonicalIngredientId: null,
      canonicalDisplayName: null,
      parentCanonicalIngredientId: null,
      parentCanonicalDisplayName: null,
      ingredientKind: null,
      attributes: [],
      matchConfidence: null,
      matchedBy: null,
      normalizationStatus: "needs_review",
      aiSuggestions: [],
    };
  }

  const mapped = await findPhraseMapping(db, householdId, normalizedIngredientPhrase);

  if (mapped?.canonicalIngredientId) {
    return {
      normalizedIngredientPhrase,
      canonicalIngredientId: mapped.canonicalIngredientId,
      canonicalDisplayName: mapped.canonicalIngredient?.displayName ?? null,
      parentCanonicalIngredientId: mapped.canonicalIngredient?.parentCanonicalIngredientId ?? null,
      parentCanonicalDisplayName: mapped.canonicalIngredient?.parentCanonicalIngredient?.displayName ?? null,
      ingredientKind: toIngredientKind(mapped.canonicalIngredient?.ingredientKind),
      attributes: parseJsonArray(mapped.attributesJson),
      matchConfidence: mapped.matchConfidence,
      matchedBy: mapped.matchSource ?? "phrase_mapping",
      normalizationStatus: toNormalizationStatus(mapped.normalizationStatus),
      aiSuggestions: [],
    };
  }

  const exactCanonical = await findCanonicalByKey(db, householdId, normalizedIngredientPhrase);

  if (exactCanonical) {
    const result = resolvedIngredientFromCanonical(
      exactCanonical,
      [],
      98,
      "canonical_exact",
      mapped?.normalizationStatus === "confirmed" ? "confirmed" : "auto_matched",
    );
    await upsertPhraseMapping(db, householdId, normalizedIngredientPhrase, result);
    return {
      ...result,
      normalizedIngredientPhrase,
    };
  }

  const exactAlias = await findAliasByKey(db, householdId, normalizedIngredientPhrase);

  if (exactAlias) {
    const result = resolvedIngredientFromCanonical(
      exactAlias.canonicalIngredient,
      [],
      95,
      "alias",
      "auto_matched",
    );
    await upsertPhraseMapping(db, householdId, normalizedIngredientPhrase, result);
    return {
      ...result,
      normalizedIngredientPhrase,
    };
  }

  const variantMatch = await tryMatchVariantAttributes(db, householdId, normalizedIngredientPhrase);

  if (variantMatch) {
    await upsertPhraseMapping(db, householdId, normalizedIngredientPhrase, variantMatch);
    return {
      ...variantMatch,
      normalizedIngredientPhrase,
    };
  }

  const hierarchyMatch = await tryMatchHierarchyRule(db, householdId, normalizedIngredientPhrase);

  if (hierarchyMatch) {
    await upsertPhraseMapping(db, householdId, normalizedIngredientPhrase, hierarchyMatch);
    return {
      ...hierarchyMatch,
      normalizedIngredientPhrase,
    };
  }

  const aiSuggestions = await getIngredientAiSuggestions({
    householdId,
    originalText: ingredient.originalText,
    parsedIngredientText: ingredient.ingredientText,
    normalizedIngredientPhrase,
    canonicalIngredients: await getCanonicalIngredientOptionsForHousehold(db, householdId),
  });
  const aiResult = await applyAiSuggestion(db, householdId, normalizedIngredientPhrase, aiSuggestions);

  if (aiResult) {
    if (aiResult.normalizationStatus !== "needs_review") {
      await upsertPhraseMapping(db, householdId, normalizedIngredientPhrase, aiResult);
    }

    return {
      ...aiResult,
      normalizedIngredientPhrase,
    };
  }

  if (looksAmbiguousIngredientPhrase(normalizedIngredientPhrase)) {
    return {
      normalizedIngredientPhrase,
      ...resolvedIngredient(
        null,
        null,
        null,
        null,
        "needs_review",
        [],
        35,
        "heuristic_review",
        [],
      ),
    };
  }

  const canonicalIngredient = await createCanonicalIngredient(
    db,
    householdId,
    ingredient.ingredientText ?? ingredient.originalText,
    {
      ingredientKind: "leaf",
      catalogStatus: "provisional",
    },
  );
  const autoResult = resolvedIngredientFromCanonical(
    canonicalIngredient,
    [],
    76,
    "heuristic_exact",
    "auto_matched",
  );
  await upsertPhraseMapping(db, householdId, normalizedIngredientPhrase, autoResult);

  return {
    ...autoResult,
    normalizedIngredientPhrase,
  };
}

export async function resolveIngredientSearchQuery(
  db: any,
  householdId: string,
  query: string,
): Promise<IngredientSearchResolution | null> {
  await ensureDefaultIngredientCatalog(db, householdId);

  const normalizedIngredientPhrase = normalizeIngredientKey(query);

  if (!normalizedIngredientPhrase) {
    return null;
  }

  const mapped = await findPhraseMapping(db, householdId, normalizedIngredientPhrase);

  if (mapped?.canonicalIngredientId && mapped.canonicalIngredient) {
    return buildSearchResolution(
      db,
      householdId,
      normalizedIngredientPhrase,
      mapped.canonicalIngredient,
      parseJsonArray(mapped.attributesJson),
      mapped.matchConfidence,
      mapped.matchSource ?? "phrase_mapping",
      toNormalizationStatus(mapped.normalizationStatus),
    );
  }

  const exactCanonical = await findCanonicalByKey(db, householdId, normalizedIngredientPhrase);

  if (exactCanonical) {
    return buildSearchResolution(
      db,
      householdId,
      normalizedIngredientPhrase,
      exactCanonical,
      [],
      98,
      "canonical_exact",
      "auto_matched",
    );
  }

  const exactAlias = await findAliasByKey(db, householdId, normalizedIngredientPhrase);

  if (exactAlias) {
    return buildSearchResolution(
      db,
      householdId,
      normalizedIngredientPhrase,
      exactAlias.canonicalIngredient,
      [],
      95,
      "alias",
      "auto_matched",
    );
  }

  const variantMatch = await tryMatchVariantAttributes(db, householdId, normalizedIngredientPhrase);

  if (variantMatch?.canonicalIngredientId) {
    const canonicalIngredient = await findCanonicalById(db, householdId, variantMatch.canonicalIngredientId);
    if (canonicalIngredient) {
      return buildSearchResolution(
        db,
        householdId,
        normalizedIngredientPhrase,
        canonicalIngredient,
        variantMatch.attributes,
        variantMatch.matchConfidence,
        variantMatch.matchedBy,
        variantMatch.normalizationStatus,
      );
    }
  }

  const hierarchyMatch = await tryMatchHierarchyRule(db, householdId, normalizedIngredientPhrase, { persist: false });

  if (hierarchyMatch?.canonicalIngredientId) {
    const canonicalIngredient = await findCanonicalById(db, householdId, hierarchyMatch.canonicalIngredientId);
    if (canonicalIngredient) {
      return buildSearchResolution(
        db,
        householdId,
        normalizedIngredientPhrase,
        canonicalIngredient,
        hierarchyMatch.attributes,
        hierarchyMatch.matchConfidence,
        hierarchyMatch.matchedBy,
        hierarchyMatch.normalizationStatus,
      );
    }
  }

  return null;
}

export async function resolveIngredientSearchQueries(
  db: any,
  householdId: string,
  queries: string[],
) {
  const resolutions = await Promise.all(
    queries.map((query) => resolveIngredientSearchQuery(db, householdId, query)),
  );

  return resolutions
    .filter((value): value is IngredientSearchResolution => Boolean(value));
}

export function normalizeIngredientKey(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[()[\]{}.,;:!?]/g, " ")
    .replace(/[-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((token, index, tokens) => (index === tokens.length - 1 ? singularizeToken(token) : token))
    .join(" ")
    .trim();
}

export function normalizeAttributes(value: string[] | null | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? [])
        .map((entry) => normalizeIngredientKey(entry))
        .filter(Boolean),
    ),
  ).sort();
}

export function mergeIngredientsForShopping<T extends {
  canonicalIngredientId: string | null;
  canonicalDisplayName: string | null;
  normalizedIngredientPhrase: string | null;
  attributes: string[];
}>(items: T[]) {
  const groups = new Map<string, { key: string; displayName: string; items: T[]; attributes: string[] }>();

  for (const item of items) {
    const key = item.canonicalIngredientId ?? `phrase:${item.normalizedIngredientPhrase ?? createId()}`;
    const existing = groups.get(key);
    const nextAttributes = normalizeAttributes(item.attributes);

    if (existing) {
      existing.items.push(item);
      existing.attributes = normalizeAttributes([...existing.attributes, ...nextAttributes]);
      continue;
    }

    groups.set(key, {
      key,
      displayName: item.canonicalDisplayName ?? item.normalizedIngredientPhrase ?? "Unmapped ingredient",
      items: [item],
      attributes: nextAttributes,
    });
  }

  return [...groups.values()];
}

export async function upsertReviewedIngredientMapping(args: {
  db: any;
  householdId: string;
  normalizedPhrase: string;
  canonicalIngredientId: string;
  aliasText?: string | null;
  attributes?: string[];
  savePhraseMapping?: boolean;
  saveAlias?: boolean;
}) {
  const attributes = normalizeAttributes(args.attributes);
  const canonical = await findCanonicalById(args.db, args.householdId, args.canonicalIngredientId);

  if (!canonical) {
    throw new Error("Canonical ingredient was not found.");
  }

  const result = resolvedIngredientFromCanonical(
    canonical,
    attributes,
    100,
    "confirmed_review",
    "confirmed",
  );

  if (args.savePhraseMapping !== false) {
    await upsertPhraseMapping(args.db, args.householdId, normalizeIngredientKey(args.normalizedPhrase), result);
  }

  const aliasText = normalizeWhitespace(args.aliasText ?? "");

  if (aliasText && args.saveAlias !== false) {
    await upsertAlias(args.db, args.householdId, aliasText, args.canonicalIngredientId, "reviewed_mapping");
  }
}

export async function createCanonicalIngredient(
  db: any,
  householdId: string,
  displayName: string,
  options?: {
    parentCanonicalIngredientId?: string | null;
    ingredientKind?: IngredientKind;
    catalogStatus?: "provisional" | "confirmed";
  },
) {
  const normalizedKey = normalizeIngredientKey(displayName);
  const existing = await findCanonicalByKey(db, householdId, normalizedKey);

  if (existing) {
    if (
      options &&
      (existing.parentCanonicalIngredientId !== (options.parentCanonicalIngredientId ?? null) ||
        existing.ingredientKind !== (options.ingredientKind ?? existing.ingredientKind))
    ) {
      await db.update(householdCanonicalIngredients)
        .set({
          parentCanonicalIngredientId: options.parentCanonicalIngredientId ?? null,
          ingredientKind: options.ingredientKind ?? existing.ingredientKind,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(householdCanonicalIngredients.canonicalIngredientId, existing.canonicalIngredientId))
        .run();

      return await findCanonicalById(db, householdId, existing.canonicalIngredientId) ?? existing;
    }

    return existing;
  }

  const now = new Date().toISOString();
  const row = {
    canonicalIngredientId: createId(),
    householdId,
    displayName: normalizeWhitespace(displayName),
    normalizedKey,
    parentCanonicalIngredientId: options?.parentCanonicalIngredientId ?? null,
    ingredientKind: options?.ingredientKind ?? "leaf",
    catalogStatus: options?.catalogStatus ?? "confirmed",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(householdCanonicalIngredients).values(row).run();
  return await findCanonicalById(db, householdId, row.canonicalIngredientId) ?? row;
}

export async function getCanonicalIngredientOptionsForHousehold(
  db: any,
  householdId: string,
): Promise<CanonicalIngredientOption[]> {
  await ensureDefaultIngredientCatalog(db, householdId);

  return (await db.query.householdCanonicalIngredients.findMany({
    where: (table: typeof householdCanonicalIngredients) => and(eq(table.householdId, householdId)),
    orderBy: (table: typeof householdCanonicalIngredients, operators: { asc: (column: unknown) => unknown }) => [
      operators.asc(table.displayName),
    ],
    with: {
      parentCanonicalIngredient: true,
    },
  })).map((ingredient: CanonicalWithParent) => ({
    canonicalIngredientId: ingredient.canonicalIngredientId,
    displayName: ingredient.displayName,
    ingredientKind: ingredient.ingredientKind,
    catalogStatus: ingredient.catalogStatus === "provisional" ? "provisional" : "confirmed",
    parentCanonicalIngredientId: ingredient.parentCanonicalIngredientId,
    parentDisplayName: ingredient.parentCanonicalIngredient?.displayName ?? null,
  }));
}

async function ensureDefaultIngredientCatalog(db: any, householdId: string) {
  const now = new Date().toISOString();
  const canonicalByName = new Map<string, CanonicalWithParent>();

  for (const seed of DEFAULT_INGREDIENT_SEEDS) {
    const parent = seed.parentDisplayName ? canonicalByName.get(seed.parentDisplayName) ?? null : null;
    const canonical = await createCanonicalIngredient(db, householdId, seed.displayName, {
      parentCanonicalIngredientId: parent?.canonicalIngredientId ?? null,
      ingredientKind: seed.ingredientKind,
    });
    canonicalByName.set(seed.displayName, canonical);

    for (const alias of seed.aliases ?? []) {
      await db.insert(householdIngredientAliases)
        .values({
          aliasId: createId(),
          householdId,
          aliasText: alias,
          normalizedAlias: normalizeIngredientKey(alias),
          canonicalIngredientId: canonical.canonicalIngredientId,
          aliasType: "seed",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [householdIngredientAliases.householdId, householdIngredientAliases.normalizedAlias],
        })
        .run();
    }
  }
}

async function tryMatchVariantAttributes(db: any, householdId: string, normalizedPhrase: string): Promise<ResolvedIngredient | null> {
  const tokens = normalizedPhrase.split(" ").filter(Boolean);
  const attributes: string[] = [];
  let index = 0;

  while (ATTRIBUTE_PREFIXES.has(tokens[index] ?? "")) {
    attributes.push(tokens[index]!);
    index += 1;
  }

  if (attributes.length === 0 || index >= tokens.length) {
    return null;
  }

  const basePhrase = tokens.slice(index).join(" ");
  const exactCanonical = await findCanonicalByKey(db, householdId, basePhrase);

  if (exactCanonical) {
    return resolvedIngredientFromCanonical(
      exactCanonical,
      attributes,
      90,
      "attribute_rule",
      "auto_matched",
    );
  }

  const exactAlias = await findAliasByKey(db, householdId, basePhrase);

  if (exactAlias) {
    return resolvedIngredientFromCanonical(
      exactAlias.canonicalIngredient,
      attributes,
      88,
      "attribute_rule",
      "auto_matched",
    );
  }

  return null;
}

async function tryMatchHierarchyRule(
  db: any,
  householdId: string,
  normalizedPhrase: string,
  options?: { persist?: boolean },
): Promise<ResolvedIngredient | null> {
  const familyCanonical = await findHierarchyFamilyCandidate(db, householdId, normalizedPhrase);

  if (!familyCanonical) {
    return null;
  }

  if (options?.persist === false) {
    return null;
  }

  const leafCanonical = await createCanonicalIngredient(db, householdId, normalizedPhrase, {
    parentCanonicalIngredientId: familyCanonical.canonicalIngredientId,
    ingredientKind: "leaf",
    catalogStatus: "provisional",
  });

  return resolvedIngredientFromCanonical(
    leafCanonical,
    [],
    84,
    "hierarchy_rule",
    "auto_matched",
  );
}

async function findHierarchyFamilyCandidate(db: any, householdId: string, normalizedPhrase: string) {
  const families = await db.query.householdCanonicalIngredients.findMany({
    where: (table: typeof householdCanonicalIngredients) =>
      and(eq(table.householdId, householdId), eq(table.ingredientKind, "family")),
    with: {
      parentCanonicalIngredient: true,
    },
  }) as CanonicalWithParent[];

  for (const family of families) {
    if (
      normalizedPhrase === family.normalizedKey ||
      normalizedPhrase.startsWith(`${family.normalizedKey} `) ||
      normalizedPhrase.endsWith(` ${family.normalizedKey}`)
    ) {
      return family;
    }
  }

  return null;
}

async function applyAiSuggestion(
  db: any,
  householdId: string,
  normalizedIngredientPhrase: string,
  aiSuggestions: IngredientReviewSuggestionView[],
): Promise<ResolvedIngredient | null> {
  const bestSuggestion = aiSuggestions[0];

  if (!bestSuggestion) {
    return null;
  }

  if (
    bestSuggestion.action === "match_existing" &&
    bestSuggestion.canonicalIngredientId &&
    bestSuggestion.confidence >= AI_AUTO_MATCH_CONFIDENCE_THRESHOLD
  ) {
    const canonicalIngredient = await findCanonicalById(db, householdId, bestSuggestion.canonicalIngredientId);

    if (!canonicalIngredient) {
      return null;
    }

    return resolvedIngredientFromCanonical(
      canonicalIngredient,
      bestSuggestion.attributes,
      bestSuggestion.confidence,
      "ai_fallback",
      "auto_matched",
    );
  }

  if (
    bestSuggestion.action === "create_new" &&
    bestSuggestion.newCanonicalName &&
    bestSuggestion.parentCanonicalIngredientId &&
    bestSuggestion.confidence >= AI_AUTO_MATCH_CONFIDENCE_THRESHOLD
  ) {
    const canonicalIngredient = await createCanonicalIngredient(db, householdId, bestSuggestion.newCanonicalName, {
      parentCanonicalIngredientId: bestSuggestion.parentCanonicalIngredientId,
      ingredientKind: bestSuggestion.ingredientKind ?? "leaf",
    });

    return resolvedIngredientFromCanonical(
      canonicalIngredient,
      bestSuggestion.attributes,
      bestSuggestion.confidence,
      "ai_fallback",
      "auto_matched",
    );
  }

  return resolvedIngredient(
    bestSuggestion.canonicalIngredientId,
    bestSuggestion.canonicalName,
    bestSuggestion.parentCanonicalIngredientId,
    bestSuggestion.parentCanonicalName,
    "needs_review",
    bestSuggestion.attributes,
    bestSuggestion.confidence,
    "ai_fallback",
    aiSuggestions,
    bestSuggestion.ingredientKind,
  );
}

async function buildSearchResolution(
  db: any,
  householdId: string,
  normalizedIngredientPhrase: string,
  canonicalIngredient: CanonicalWithParent,
  attributes: string[],
  matchConfidence: number | null,
  matchedBy: string | null,
  normalizationStatus: IngredientNormalizationStatus,
): Promise<IngredientSearchResolution> {
  const descendantCanonicalIngredientIds = await getDescendantCanonicalIngredientIds(db, householdId, canonicalIngredient.canonicalIngredientId);
  const searchCanonicalIngredientIds = [
    canonicalIngredient.canonicalIngredientId,
    ...descendantCanonicalIngredientIds,
  ];

  return {
    normalizedIngredientPhrase,
    canonicalIngredientId: canonicalIngredient.canonicalIngredientId,
    canonicalDisplayName: canonicalIngredient.displayName,
    parentCanonicalIngredientId: canonicalIngredient.parentCanonicalIngredientId,
    parentCanonicalDisplayName: canonicalIngredient.parentCanonicalIngredient?.displayName ?? null,
    ingredientKind: canonicalIngredient.ingredientKind,
    catalogStatus: canonicalIngredient.catalogStatus,
    descendantCanonicalIngredientIds,
    searchCanonicalIngredientIds,
    attributes: normalizeAttributes(attributes),
    matchConfidence,
    matchedBy,
    normalizationStatus,
  };
}

async function getDescendantCanonicalIngredientIds(
  db: any,
  householdId: string,
  canonicalIngredientId: string,
) {
  const canonicals = await db.query.householdCanonicalIngredients.findMany({
    where: (table: typeof householdCanonicalIngredients) => and(eq(table.householdId, householdId)),
    columns: {
      canonicalIngredientId: true,
      parentCanonicalIngredientId: true,
    },
  }) as Array<{
    canonicalIngredientId: string;
    parentCanonicalIngredientId: string | null;
  }>;

  const childrenByParent = new Map<string, string[]>();

  for (const canonical of canonicals) {
    if (!canonical.parentCanonicalIngredientId) {
      continue;
    }

    const existing = childrenByParent.get(canonical.parentCanonicalIngredientId) ?? [];
    existing.push(canonical.canonicalIngredientId);
    childrenByParent.set(canonical.parentCanonicalIngredientId, existing);
  }

  const queue = [...(childrenByParent.get(canonicalIngredientId) ?? [])];
  const descendants: string[] = [];

  while (queue.length > 0) {
    const nextId = queue.shift();

    if (!nextId || descendants.includes(nextId)) {
      continue;
    }

    descendants.push(nextId);
    queue.push(...(childrenByParent.get(nextId) ?? []));
  }

  return descendants;
}

async function findPhraseMapping(db: any, householdId: string, normalizedPhrase: string) {
  return await db.query.householdIngredientPhraseMappings.findFirst({
    where: (table: typeof householdIngredientPhraseMappings) =>
      and(eq(table.householdId, householdId), eq(table.normalizedPhrase, normalizedPhrase)),
    with: {
      canonicalIngredient: {
        with: {
          parentCanonicalIngredient: true,
        },
      },
    },
  });
}

async function findCanonicalById(db: any, householdId: string, canonicalIngredientId: string) {
  return await db.query.householdCanonicalIngredients.findFirst({
    where: (table: typeof householdCanonicalIngredients) =>
      and(eq(table.householdId, householdId), eq(table.canonicalIngredientId, canonicalIngredientId)),
    with: {
      parentCanonicalIngredient: true,
    },
  }) as CanonicalWithParent | undefined;
}

async function findCanonicalByKey(db: any, householdId: string, normalizedKey: string) {
  return await db.query.householdCanonicalIngredients.findFirst({
    where: (table: typeof householdCanonicalIngredients) =>
      and(eq(table.householdId, householdId), eq(table.normalizedKey, normalizedKey)),
    with: {
      parentCanonicalIngredient: true,
    },
  }) as CanonicalWithParent | undefined;
}

async function findAliasByKey(db: any, householdId: string, normalizedAlias: string) {
  return await db.query.householdIngredientAliases.findFirst({
    where: (table: typeof householdIngredientAliases) =>
      and(eq(table.householdId, householdId), eq(table.normalizedAlias, normalizedAlias)),
    with: {
      canonicalIngredient: {
        with: {
          parentCanonicalIngredient: true,
        },
      },
    },
  }) as
    | {
        aliasId: string;
        canonicalIngredientId: string;
        aliasText: string;
        normalizedAlias: string;
        aliasType: string;
        householdId: string;
        createdAt: string;
        updatedAt: string;
        catalogStatus: "provisional" | "confirmed";
        canonicalIngredient: CanonicalWithParent;
      }
    | undefined;
}

async function upsertPhraseMapping(
  db: any,
  householdId: string,
  normalizedPhrase: string,
  result: ResolvedIngredient,
) {
  const now = new Date().toISOString();

  await db.insert(householdIngredientPhraseMappings)
    .values({
      mappingId: createId(),
      householdId,
      normalizedPhrase,
      canonicalIngredientId: result.canonicalIngredientId,
      attributesJson: JSON.stringify(normalizeAttributes(result.attributes)),
      matchConfidence: result.matchConfidence,
      normalizationStatus: result.normalizationStatus,
      matchSource: result.matchedBy,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [householdIngredientPhraseMappings.householdId, householdIngredientPhraseMappings.normalizedPhrase],
      set: {
        canonicalIngredientId: result.canonicalIngredientId,
        attributesJson: JSON.stringify(normalizeAttributes(result.attributes)),
        matchConfidence: result.matchConfidence,
        normalizationStatus: result.normalizationStatus,
        matchSource: result.matchedBy,
        updatedAt: now,
      },
    })
    .run();
}

async function upsertAlias(
  db: any,
  householdId: string,
  aliasText: string,
  canonicalIngredientId: string,
  aliasType: string,
) {
  const now = new Date().toISOString();

  await db.insert(householdIngredientAliases)
    .values({
      aliasId: createId(),
      householdId,
      aliasText,
      normalizedAlias: normalizeIngredientKey(aliasText),
      canonicalIngredientId,
      aliasType,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [householdIngredientAliases.householdId, householdIngredientAliases.normalizedAlias],
      set: {
        canonicalIngredientId,
        aliasType,
        updatedAt: now,
      },
    })
    .run();
}

function resolvedIngredientFromCanonical(
  canonicalIngredient: CanonicalWithParent,
  attributes: string[],
  matchConfidence: number | null,
  matchedBy: string | null,
  normalizationStatus: IngredientNormalizationStatus,
): ResolvedIngredient {
  return resolvedIngredient(
    canonicalIngredient.canonicalIngredientId,
    canonicalIngredient.displayName,
    canonicalIngredient.parentCanonicalIngredientId,
    canonicalIngredient.parentCanonicalIngredient?.displayName ?? null,
    normalizationStatus,
    attributes,
    matchConfidence,
    matchedBy,
    [],
    canonicalIngredient.ingredientKind,
  );
}

function resolvedIngredient(
  canonicalIngredientId: string | null,
  canonicalDisplayName: string | null,
  parentCanonicalIngredientId: string | null,
  parentCanonicalDisplayName: string | null,
  normalizationStatus: IngredientNormalizationStatus,
  attributes: string[],
  matchConfidence: number | null,
  matchedBy: string | null,
  aiSuggestions: IngredientReviewSuggestionView[],
  ingredientKind: IngredientKind | null = null,
): ResolvedIngredient {
  return {
    canonicalIngredientId,
    canonicalDisplayName,
    parentCanonicalIngredientId,
    parentCanonicalDisplayName,
    ingredientKind,
    attributes: normalizeAttributes(attributes),
    matchConfidence,
    matchedBy,
    normalizationStatus,
    aiSuggestions,
  };
}

function looksAmbiguousIngredientPhrase(normalizedPhrase: string): boolean {
  return (
    normalizedPhrase.includes("/") ||
    normalizedPhrase.split(" ").length > 4 ||
    AMBIGUOUS_TOKENS.some((token) => normalizedPhrase.includes(token))
  );
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeAttributes(parsed.filter((entry): entry is string => typeof entry === "string")) : [];
  } catch {
    return [];
  }
}

function singularizeToken(token: string): string {
  if (token.endsWith("ies") && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("oes") && token.length > 3) {
    return token.slice(0, -2);
  }

  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toNormalizationStatus(value: string): IngredientNormalizationStatus {
  if (value === "confirmed") {
    return "confirmed";
  }

  if (value === "needs_review") {
    return "needs_review";
  }

  return "auto_matched";
}

function toIngredientKind(value: string | null | undefined): IngredientKind | null {
  if (value === "family" || value === "base" || value === "leaf") {
    return value;
  }

  return null;
}
