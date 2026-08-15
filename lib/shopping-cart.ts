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
};

const VOLUME_TO_TEASPOONS: Record<string, number> = { cup: 48, tablespoon: 3, teaspoon: 1 };

export type BuiltCartItem = {
  itemId: string;
  canonicalIngredientId: string | null;
  displayName: string;
  amountText: string | null;
  unit: string | null;
  sourceMeals: CartIngredientInput["sourceMeal"][];
};

export function buildShoppingCartItems(inputs: CartIngredientInput[]): BuiltCartItem[] {
  const grouped = new Map<string, CartIngredientInput[]>();
  for (const input of inputs) {
    if (input.normalizationStatus === "not_ingredient") continue;
    const key = input.canonicalIngredientId ? `canonical:${input.canonicalIngredientId}` : `raw:${input.ingredientId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), input]);
  }

  return [...grouped.entries()].flatMap(([key, entries]) => buildGroup(key, entries)).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function buildGroup(key: string, entries: CartIngredientInput[]): BuiltCartItem[] {
  const first = entries[0]!;
  const displayName = first.canonicalName ?? first.ingredientText ?? first.originalText;
  const sources = uniqueSources(entries.map((entry) => entry.sourceMeal));
  if (!first.canonicalIngredientId) {
    return entries.map((entry) => ({ itemId: entry.ingredientId, canonicalIngredientId: null, displayName: entry.originalText, amountText: entry.amountText, unit: entry.unit, sourceMeals: [entry.sourceMeal] }));
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
    const unit = unitKey === "volume" ? chooseVolumeUnit(total) : (values[0]!.unit ?? null);
    const amount = unitKey === "volume" ? total / VOLUME_TO_TEASPOONS[unit!]! : total;
    items.push({ itemId: `${key}:${unitKey}`, canonicalIngredientId: first.canonicalIngredientId, displayName, amountText: formatAmount(amount), unit, sourceMeals: uniqueSources(values.map((entry) => entry.sourceMeal)) });
  }
  for (const entry of nonNumeric) {
    items.push({ itemId: entry.ingredientId, canonicalIngredientId: first.canonicalIngredientId, displayName, amountText: entry.amountText, unit: entry.unit, sourceMeals: [entry.sourceMeal] });
  }
  return items.length ? items : [{ itemId: key, canonicalIngredientId: first.canonicalIngredientId, displayName, amountText: null, unit: null, sourceMeals: sources }];
}

function chooseVolumeUnit(teaspoons: number) {
  if (teaspoons >= 48) return "cup";
  if (teaspoons >= 3) return "tablespoon";
  return "teaspoon";
}

function formatAmount(amount: number) {
  const rounded = Math.round(amount * 1_000_000) / 1_000_000;
  return `${rounded}`;
}

function uniqueSources(sources: CartIngredientInput["sourceMeal"][]) {
  return [...new Map(sources.map((source) => [source.eventId, source])).values()];
}

export function formatCartQuantity(amountText: string | null, unit: string | null) {
  return [amountText, formatIngredientUnit(unit)].filter(Boolean).join(" ");
}
