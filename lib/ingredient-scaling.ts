import { formatIngredientUnit } from "@/lib/ingredient-units";

export type ScalableIngredient = {
  originalText: string;
  measurements?: Array<{
    amountText: string;
    amountValue: number | null;
    amountMaxValue: number | null;
    unit: string;
  }>;
  amount: string | null;
  amountValue: number | null;
  amountMaxValue: number | null;
  unit: string | null;
  parsedText: string | null;
  notes: string | null;
};

const VOLUME_UNITS = [
  { unit: "cup", teaspoons: 48 },
  { unit: "tablespoon", teaspoons: 3 },
  { unit: "teaspoon", teaspoons: 1 },
] as const;

const UNIT_LABELS: Record<string, { singular: string; plural: string }> = {
  cup: { singular: "cup", plural: "cups" },
  tablespoon: { singular: "tablespoon", plural: "tablespoons" },
  teaspoon: { singular: "teaspoon", plural: "teaspoons" },
  pound: { singular: "pound", plural: "pounds" },
  ounce: { singular: "ounce", plural: "ounces" },
  clove: { singular: "clove", plural: "cloves" },
  can: { singular: "can", plural: "cans" },
  gram: { singular: "gram", plural: "grams" },
  kilogram: { singular: "kilogram", plural: "kilograms" },
  milliliter: { singular: "milliliter", plural: "milliliters" },
  liter: { singular: "liter", plural: "liters" },
  quart: { singular: "quart", plural: "quarts" },
  pint: { singular: "pint", plural: "pints" },
  package: { singular: "package", plural: "packages" },
  pinch: { singular: "pinch", plural: "pinches" },
};

export function formatScaledIngredient(
  ingredient: ScalableIngredient,
  multiplier: 1 | 2 | 3,
) {
  const parts = formatScaledIngredientParts(ingredient, multiplier);
  return [parts.amount, parts.description].filter(Boolean).join(" ");
}

export function formatScaledIngredientParts(
  ingredient: ScalableIngredient,
  multiplier: 1 | 2 | 3,
) {
  const measurements = ingredient.measurements ?? (ingredient.amount !== null && ingredient.unit !== null ? [{ amountText: ingredient.amount, amountValue: ingredient.amountValue, amountMaxValue: ingredient.amountMaxValue, unit: ingredient.unit }] : []);
  if (!ingredient.parsedText || measurements.length === 0) {
    return { amount: null, description: ingredient.originalText };
  }
  const amount = measurements.map((measurement) => formatScaledMeasurement(measurement, multiplier)).join(" · ");
  const notes = ingredient.notes ? `, ${ingredient.notes}` : "";

  return {
    amount,
    description: `${ingredient.parsedText}${notes}`,
  };
}

function formatScaledMeasurement(measurement: NonNullable<ScalableIngredient["measurements"]>[number], multiplier: 1 | 2 | 3) {
  if (measurement.amountValue === null) return [measurement.amountText, formatIngredientUnit(measurement.unit)].filter(Boolean).join(" ");
  const minimum = measurement.amountValue * multiplier;
  const maximum = measurement.amountMaxValue === null ? null : measurement.amountMaxValue * multiplier;
  const normalized = normalizeVolumeUnit(minimum, maximum, measurement.unit);
  const amount = formatAmountRange(normalized.minimum, normalized.maximum);
  const unit = normalized.unit ? ` ${formatUnit(normalized.unit, normalized.minimum, normalized.maximum)}` : "";
  const qualifier = getAmountQualifier(measurement.amountText);
  return `${amount}${qualifier}${unit}`.replace(/\s+/g, " ").trim();
}

function normalizeVolumeUnit(minimum: number, maximum: number | null, unit: string | null) {
  const sourceUnit = VOLUME_UNITS.find((entry) => entry.unit === unit);
  if (!sourceUnit) {
    return { minimum, maximum, unit };
  }

  const minimumTeaspoons = minimum * sourceUnit.teaspoons;
  const maximumTeaspoons = maximum === null ? null : maximum * sourceUnit.teaspoons;
  const targetUnit = VOLUME_UNITS.find(
    (entry) =>
      entry.teaspoons >= sourceUnit.teaspoons &&
      minimumTeaspoons / entry.teaspoons >= 1 &&
      (maximumTeaspoons === null || maximumTeaspoons / entry.teaspoons >= 1),
  ) ?? sourceUnit;

  return {
    minimum: minimumTeaspoons / targetUnit.teaspoons,
    maximum: maximumTeaspoons === null ? null : maximumTeaspoons / targetUnit.teaspoons,
    unit: targetUnit.unit,
  };
}

function formatAmountRange(minimum: number, maximum: number | null) {
  return maximum === null ? formatAmount(minimum) : `${formatAmount(minimum)}–${formatAmount(maximum)}`;
}

function formatAmount(value: number) {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
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

  return String(rounded);
}

function formatUnit(unit: string, minimum: number, maximum: number | null) {
  if (unit === "cup") {
    return (maximum ?? minimum) <= 1 ? "cup" : "cups";
  }
  const abbreviated = formatIngredientUnit(unit);
  if (abbreviated !== unit) {
    return abbreviated;
  }
  const labels = UNIT_LABELS[unit];
  if (!labels) {
    return unit;
  }
  return (maximum ?? minimum) <= 1 ? labels.singular : labels.plural;
}

function getAmountQualifier(amount: string | null) {
  const qualifier = amount?.match(/\s*(\([^)]+\))\s*$/)?.[1];
  return qualifier ? ` ${qualifier}` : "";
}
