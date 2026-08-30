const UNIT_ABBREVIATIONS: Record<string, string> = {
  cup: "c",
  tablespoon: "tbsp",
  teaspoon: "tsp",
  pound: "lb",
  ounce: "oz",
  gram: "g",
  kilogram: "kg",
  milliliter: "mL",
  liter: "L",
  quart: "qt",
  pint: "pt",
  package: "pkg",
};

export type IngredientUnitOption = {
  value: string;
  label: string;
  aliases: string[];
};

export const INGREDIENT_UNIT_OPTIONS: IngredientUnitOption[] = [
  { value: "cup", label: "Cup", aliases: ["c", "cups"] },
  { value: "tablespoon", label: "Tablespoon", aliases: ["tbsp", "tablespoons"] },
  { value: "teaspoon", label: "Teaspoon", aliases: ["tsp", "teaspoons"] },
  { value: "pound", label: "Pound", aliases: ["lb", "lbs", "pounds"] },
  { value: "ounce", label: "Ounce", aliases: ["oz", "ounces"] },
  { value: "clove", label: "Clove", aliases: ["cloves"] },
  { value: "can", label: "Can", aliases: ["cans"] },
  { value: "gram", label: "Gram", aliases: ["g", "grams"] },
  { value: "kilogram", label: "Kilogram", aliases: ["kg", "kilograms"] },
  { value: "milliliter", label: "Milliliter", aliases: ["ml", "milliliters"] },
  { value: "liter", label: "Liter", aliases: ["l", "liters"] },
  { value: "quart", label: "Quart", aliases: ["qt", "quarts"] },
  { value: "pint", label: "Pint", aliases: ["pt", "pints"] },
  { value: "package", label: "Package", aliases: ["pkg", "packages"] },
  { value: "pinch", label: "Pinch", aliases: ["pinches"] },
];

export function normalizeIngredientUnit(value: string) {
  const query = value.replace(/[().]/g, "").trim().toLowerCase();
  return INGREDIENT_UNIT_OPTIONS.find((option) =>
    option.value === query || option.aliases.includes(query),
  )?.value ?? null;
}

export function filterIngredientUnitOptions(query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return INGREDIENT_UNIT_OPTIONS;
  return INGREDIENT_UNIT_OPTIONS.filter((option) =>
    [option.label, option.value, ...option.aliases].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    ),
  );
}

export function formatIngredientUnit(unit: string | null) {
  return unit ? (UNIT_ABBREVIATIONS[unit] ?? unit) : null;
}
