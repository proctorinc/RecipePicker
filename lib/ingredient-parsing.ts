import { normalizeIngredientUnit as normalizeKnownIngredientUnit } from "@/lib/ingredient-units";

export type ParsedIngredientLine = {
  originalText: string;
  measurements: IngredientMeasurement[];
  amountText: string | null;
  amountValue: number | null;
  amountMaxValue: number | null;
  unit: string | null;
  ingredientText: string | null;
  notes: string | null;
  alternativeIngredientTexts: string[] | null;
};

export type IngredientMeasurement = {
  amountText: string;
  amountValue: number | null;
  amountMaxValue: number | null;
  unit: string;
};

const UNICODE_FRACTIONS: Record<string, string> = {
  "¼": "1/4", "½": "1/2", "¾": "3/4", "⅓": "1/3", "⅔": "2/3",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

export function parseIngredientLine(rawLine: string): ParsedIngredientLine {
  const normalized = rawLine.replace(/\s+/g, " ").trim();
  const first = parseMeasurementPrefix(normalized);
  if (!first) {
    return emptyParsedIngredient(normalized);
  }

  const measurements = [first.measurement];
  let remainder = first.remainder;
  while (true) {
    const parenthetical = remainder.match(/^\s*\(\s*([^)]+?)\s*\)\s*/);
    const slash = remainder.match(/^\s*\/\s*/);
    const candidate = parenthetical?.[1] ?? (slash ? remainder.slice(slash[0].length) : null);
    if (!candidate) break;
    const parsed = parseMeasurementPrefix(candidate);
    if (!parsed) break;
    measurements.push(parsed.measurement);
    remainder = parenthetical ? remainder.slice(parenthetical[0].length) : parsed.remainder;
  }

  const parts = remainder.trim().split(/\s*,\s*/);
  const mainPart = parts.shift() ?? "";
  const ingredientText = mainPart || null;
  const primary = measurements[0]!;
  return {
    originalText: normalized,
    measurements,
    amountText: primary.amountText,
    amountValue: primary.amountValue,
    amountMaxValue: primary.amountMaxValue,
    unit: primary.unit,
    ingredientText,
    notes: parts.length ? parts.join(", ") : null,
    alternativeIngredientTexts: parseIngredientAlternatives(ingredientText),
  };
}

export function parseIngredientLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(parseIngredientLine);
}

export function normalizeIngredientUnit(token: string) {
  return normalizeKnownIngredientUnit(token);
}

export function parseAmountText(amountText: string) {
  const cleaned = amountText.replace(/\([^)]+\)/g, "").trim();
  const [lowerRaw, upperRaw] = cleaned.split(/\s*-\s*/, 2);
  return { amountValue: parseSingleAmount(lowerRaw ?? ""), amountMaxValue: upperRaw ? parseSingleAmount(upperRaw) : null };
}

export function formatIngredientOriginalText({ amountText, unit, ingredientText, notes }: Pick<ParsedIngredientLine, "amountText" | "unit" | "ingredientText" | "notes">) {
  return [amountText?.trim(), unit?.trim(), ingredientText?.trim()].filter(Boolean).join(" ") + (notes?.trim() ? `, ${notes.trim()}` : "");
}

export function formatIngredientMeasurements(measurements: IngredientMeasurement[]) {
  return measurements.map((measurement) => [measurement.amountText.trim(), measurement.unit.trim()].filter(Boolean).join(" ")).filter(Boolean).join(" · ");
}

function emptyParsedIngredient(originalText: string): ParsedIngredientLine {
  return { originalText, measurements: [], amountText: null, amountValue: null, amountMaxValue: null, unit: null, ingredientText: originalText || null, notes: null, alternativeIngredientTexts: parseIngredientAlternatives(originalText) };
}

function parseMeasurementPrefix(value: string): { measurement: IngredientMeasurement; remainder: string } | null {
  const match = value.match(/^((?:\d+\s+\d\/\d|\d+\/\d|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]+)(?:\s*-\s*(?:\d+\s+\d\/\d|\d+\/\d|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]+))?)\s+([^\s,()/]+)(?:\s+|$)([\s\S]*)$/u);
  if (!match) return null;
  const unit = normalizeIngredientUnit(match[2] ?? "");
  if (!unit) return null;
  const amountText = match[1].trim();
  const { amountValue, amountMaxValue } = parseAmountText(amountText);
  return { measurement: { amountText, amountValue, amountMaxValue, unit }, remainder: match[3] ?? "" };
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
