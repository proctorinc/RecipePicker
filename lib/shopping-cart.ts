import { formatIngredientUnit } from "@/lib/ingredient-units";

export type CartIngredientInput = {
  ingredientId: string;
  canonicalIngredientId: string | null;
  canonicalName: string | null;
  originalText: string;
  ingredientText: string | null;
  amountText: string | null;
  amountValue: number | null;
  amountMaxValue: number | null;
  unit: string | null;
  normalizationStatus: string;
  sourceMeal: { eventId: string; date: string; recipeId: string; recipeTitle: string };
  alternatives: CartIngredientAlternative[];
};

export type CartIngredientAlternative = {
  alternativeId: string;
  ingredientText: string;
  canonicalIngredientId: string | null;
  canonicalName: string | null;
  normalizationStatus: string;
};

const VOLUME_UNITS = [
  { unit: "cup", teaspoons: 48 },
  { unit: "tablespoon", teaspoons: 3 },
  { unit: "teaspoon", teaspoons: 1 },
] as const;

const VOLUME_TO_TEASPOONS = Object.fromEntries(
  VOLUME_UNITS.map(({ unit, teaspoons }) => [unit, teaspoons]),
) as Record<string, number>;

export type BuiltCartItem = {
  itemId: string;
  canonicalIngredientId: string | null;
  displayName: string;
  amountText: string | null;
  unit: string | null;
  sourceMeals: CartIngredientInput["sourceMeal"][];
  alternativeOptions: Array<{ canonicalIngredientId: string | null; displayName: string }> | null;
};

export function buildShoppingCartItems(inputs: CartIngredientInput[]): BuiltCartItem[] {
  const alternativeItems = inputs
    .filter((input) => input.alternatives.length > 0)
    .flatMap(buildAlternativeGroup);
  const grouped = new Map<string, CartIngredientInput[]>();
  for (const input of inputs) {
    if (input.alternatives.length > 0) continue;
    if (input.normalizationStatus === "not_ingredient") continue;
    const key = input.canonicalIngredientId ? `canonical:${input.canonicalIngredientId}` : `raw:${input.ingredientId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), input]);
  }

  return [...alternativeItems, ...[...grouped.entries()].flatMap(([key, entries]) => buildGroup(key, entries))]
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function buildAlternativeGroup(input: CartIngredientInput): BuiltCartItem[] {
  const choices = input.alternatives
    .filter((alternative) => alternative.normalizationStatus !== "not_ingredient")
    .map((alternative) => ({
      canonicalIngredientId: alternative.canonicalIngredientId,
      displayName: alternative.canonicalName ?? alternative.ingredientText,
    }));

  if (choices.length < 2) return [];

  return [{
    itemId: `alternative:${input.ingredientId}:${input.sourceMeal.eventId}`,
    canonicalIngredientId: null,
    displayName: choices.map((choice) => choice.displayName).join(" or "),
    amountText: input.amountText,
    unit: input.unit,
    sourceMeals: [input.sourceMeal],
    alternativeOptions: choices,
  }];
}

function buildGroup(key: string, entries: CartIngredientInput[]): BuiltCartItem[] {
  const first = entries[0]!;
  const displayName = first.canonicalName ?? first.ingredientText ?? first.originalText;
  const sources = uniqueSources(entries.map((entry) => entry.sourceMeal));
  if (!first.canonicalIngredientId) {
    return entries.map((entry) => ({ itemId: entry.ingredientId, canonicalIngredientId: null, displayName: entry.originalText, amountText: entry.amountText, unit: entry.unit, sourceMeals: [entry.sourceMeal], alternativeOptions: null }));
  }

  const numeric = entries.filter((entry) => entry.amountValue !== null && entry.amountMaxValue === null);
  const nonNumeric = entries.filter((entry) => entry.amountValue === null || entry.amountMaxValue !== null);
  const numericGroups = new Map<string, CartIngredientInput[]>();
  for (const entry of numeric) {
    const unit = entry.unit ?? "";
    const keyForUnit = VOLUME_TO_TEASPOONS[unit] ? "volume" : unit;
    numericGroups.set(keyForUnit, [...(numericGroups.get(keyForUnit) ?? []), entry]);
  }
  const items: BuiltCartItem[] = [];
  for (const [unitKey, values] of numericGroups) {
    const total = values.reduce((sum, entry) => sum + (entry.amountValue ?? 0) * (unitKey === "volume" ? VOLUME_TO_TEASPOONS[entry.unit ?? ""]! : 1), 0);
    const unit = unitKey === "volume" ? chooseVolumeUnit(total, values) : (values[0]!.unit ?? null);
    const amount = unitKey === "volume" ? total / VOLUME_TO_TEASPOONS[unit!]! : total;
    items.push({ itemId: `${key}:${unitKey}`, canonicalIngredientId: first.canonicalIngredientId, displayName, amountText: formatAmount(amount), unit, sourceMeals: uniqueSources(values.map((entry) => entry.sourceMeal)), alternativeOptions: null });
  }
  for (const entry of nonNumeric) {
    items.push({ itemId: entry.ingredientId, canonicalIngredientId: first.canonicalIngredientId, displayName, amountText: entry.amountText, unit: entry.unit, sourceMeals: [entry.sourceMeal], alternativeOptions: null });
  }
  return items.length ? items : [{ itemId: key, canonicalIngredientId: first.canonicalIngredientId, displayName, amountText: null, unit: null, sourceMeals: sources, alternativeOptions: null }];
}

function chooseVolumeUnit(teaspoons: number, entries: CartIngredientInput[]) {
  // Keep the largest original unit as the floor. This matches recipe scaling:
  // 1/2 cup remains a cup measurement instead of being demoted to 8 tbsp.
  const preferredUnit = VOLUME_UNITS.find((candidate) => entries.some((entry) => entry.unit === candidate.unit))!;

  return VOLUME_UNITS.find(
    (candidate) => candidate.teaspoons >= preferredUnit.teaspoons && teaspoons / candidate.teaspoons >= 1,
  )?.unit ?? preferredUnit.unit;
}

function formatAmount(amount: number) {
  const rounded = Math.round(amount * 1_000_000) / 1_000_000;
  const whole = Math.floor(rounded);
  const fraction = rounded - whole;
  const commonFractions: Array<[number, string]> = [
    [1 / 8, "⅛"],
    [1 / 4, "¼"],
    [1 / 3, "⅓"],
    [3 / 8, "⅜"],
    [1 / 2, "½"],
    [5 / 8, "⅝"],
    [2 / 3, "⅔"],
    [3 / 4, "¾"],
    [7 / 8, "⅞"],
  ];
  const commonFraction = commonFractions.find(([candidate]) => Math.abs(fraction - candidate) < 0.000001);

  if (commonFraction) {
    return whole ? `${whole}${commonFraction[1]}` : commonFraction[1];
  }

  return `${rounded}`;
}

function uniqueSources(sources: CartIngredientInput["sourceMeal"][]) {
  return [...new Map(sources.map((source) => [source.eventId, source])).values()];
}

export function formatCartQuantity(amountText: string | null, unit: string | null) {
  return [amountText, formatIngredientUnit(unit)].filter(Boolean).join(" ");
}
