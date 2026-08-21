export type ParsedIngredientLine = {
  originalText: string;
  amountText: string | null;
  amountValue: number | null;
  amountMaxValue: number | null;
  unit: string | null;
  ingredientText: string | null;
  notes: string | null;
  alternativeIngredientTexts: string[] | null;
};

const UNICODE_FRACTIONS: Record<string, string> = {
  "¼": "1/4", "½": "1/2", "¾": "3/4", "⅓": "1/3", "⅔": "2/3",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

export function parseIngredientLine(rawLine: string): ParsedIngredientLine {
  const normalized = rawLine.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /^((?:\d+\s+\d\/\d|\d+\/\d|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]+)(?:\s*-\s*(?:\d+\s+\d\/\d|\d+\/\d|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]+))?(?:\s*\([^)]+\))?)\s+(.+)$/u,
  );
  if (!match) {
    return emptyParsedIngredient(normalized);
  }

  const amountText = match[1].trim();
  const { amountValue, amountMaxValue } = parseAmountText(amountText);
  const parts = match[2].trim().split(/\s*,\s*/);
  const mainPart = parts.shift() ?? "";
  const tokens = mainPart.split(/\s+/);
  const unit = normalizeIngredientUnit(tokens[0] ?? "");
  const ingredientText = unit ? tokens.slice(1).join(" ") || null : mainPart || null;
  return {
    originalText: normalized,
    amountText,
    amountValue,
    amountMaxValue,
    unit,
    ingredientText,
    notes: parts.length ? parts.join(", ") : null,
    alternativeIngredientTexts: parseIngredientAlternatives(ingredientText),
  };
}

export function parseIngredientLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(parseIngredientLine);
}

export function normalizeIngredientUnit(token: string) {
  const cleaned = token.replace(/[().]/g, "").toLowerCase();
  const unitMap: Record<string, string> = {
    c: "cup", cup: "cup", cups: "cup", tbsp: "tablespoon", tablespoon: "tablespoon", tablespoons: "tablespoon",
    tsp: "teaspoon", teaspoon: "teaspoon", teaspoons: "teaspoon", lb: "pound", lbs: "pound", pound: "pound", pounds: "pound",
    oz: "ounce", ounce: "ounce", ounces: "ounce", clove: "clove", cloves: "clove", can: "can", cans: "can",
    g: "gram", gram: "gram", grams: "gram", kg: "kilogram", kilogram: "kilogram", kilograms: "kilogram",
    ml: "milliliter", milliliter: "milliliter", milliliters: "milliliter", l: "liter", liter: "liter", liters: "liter",
    qt: "quart", quart: "quart", quarts: "quart", pt: "pint", pint: "pint", pints: "pint",
    package: "package", packages: "package", pkg: "package", pinch: "pinch", pinches: "pinch",
  };
  return unitMap[cleaned] ?? null;
}

export function parseAmountText(amountText: string) {
  const cleaned = amountText.replace(/\([^)]+\)/g, "").trim();
  const [lowerRaw, upperRaw] = cleaned.split(/\s*-\s*/, 2);
  return { amountValue: parseSingleAmount(lowerRaw ?? ""), amountMaxValue: upperRaw ? parseSingleAmount(upperRaw) : null };
}

export function formatIngredientOriginalText({ amountText, unit, ingredientText, notes }: Pick<ParsedIngredientLine, "amountText" | "unit" | "ingredientText" | "notes">) {
  return [amountText?.trim(), unit?.trim(), ingredientText?.trim()].filter(Boolean).join(" ") + (notes?.trim() ? `, ${notes.trim()}` : "");
}

function emptyParsedIngredient(originalText: string): ParsedIngredientLine {
  return { originalText, amountText: null, amountValue: null, amountMaxValue: null, unit: null, ingredientText: originalText || null, notes: null, alternativeIngredientTexts: parseIngredientAlternatives(originalText) };
}

function parseIngredientAlternatives(ingredientText: string | null) {
  if (!ingredientText || !/\s+or\s+/i.test(ingredientText)) return null;
  const alternatives = ingredientText.split(/\s+or\s+/i).map((value) => value.trim()).filter(Boolean);
  return alternatives.length >= 2 && !alternatives.some((value) => /\d|\b(?:cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|oz|ounce|ounces|lb|lbs|pound|pounds)\b/i.test(value)) ? alternatives : null;
}

function parseSingleAmount(value: string) {
  const normalized = value.trim().replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (fraction) => ` ${UNICODE_FRACTIONS[fraction] ?? ""} `).replace(/\s+/g, " ");
  if (!normalized) return null;
  let total = 0;
  for (const part of normalized.split(" ")) {
    if (/^\d+\/\d+$/.test(part)) {
      const [numerator, denominator] = part.split("/").map(Number);
      if (!denominator) return null;
      total += numerator / denominator;
    } else {
      const numeric = Number(part);
      if (!Number.isFinite(numeric)) return null;
      total += numeric;
    }
  }
  return total > 0 ? total : null;
}
