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

export function formatIngredientUnit(unit: string | null) {
  return unit ? (UNIT_ABBREVIATIONS[unit] ?? unit) : null;
}
