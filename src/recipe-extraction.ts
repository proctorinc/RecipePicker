import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

const RECIPE_TYPE = "recipe";
const HOW_TO_STEP_TYPE = "howtostep";
const HOW_TO_SECTION_TYPE = "howtosection";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; FoodPickerBot/0.1; +https://example.invalid/food-picker)";

export type RecipeFetchStatus = "fetched" | "fetch_failed" | "not_html";

export type ExtractionStatus =
  | "recipe_extracted"
  | "not_recipe"
  | "unsupported_page"
  | "multiple_recipes_needs_review"
  | "extraction_failed";

export type ExtractionMethod = "jsonld" | "microdata" | "rdfa";

export type FetchResult = {
  originalUrl: string;
  finalUrl: string | null;
  fetchStatus: RecipeFetchStatus;
  contentType: string | null;
  fetchedAt: string;
  html: string | null;
  errorMessage?: string;
};

export type ExtractedIngredientLine = {
  originalText: string;
  amountText: string | null;
  unit: string | null;
  ingredientText: string | null;
  notes: string | null;
  normalizationStatus: "pending" | "needs_review";
};

export type ExtractedStep = {
  position: number;
  rawText: string;
  text: string;
  section: string | null;
};

export type ExtractedRecipe = {
  title: string | null;
  description: string | null;
  author: string | null;
  canonicalUrl: string | null;
  siteName: string | null;
  imageUrl: string | null;
  yieldText: string | null;
  prepTime: string | null;
  cookTime: string | null;
  totalTime: string | null;
  categories: string[];
  cuisine: string | null;
  keywords: string[];
  nutrition: Record<string, unknown> | null;
  ingredients: ExtractedIngredientLine[];
  steps: ExtractedStep[];
  sourceMethod: ExtractionMethod;
  rawRecipe: Record<string, unknown>;
};

export type ExtractionResult = {
  status: ExtractionStatus;
  method: ExtractionMethod | null;
  warnings: string[];
  candidateCount: number;
  payload: Record<string, unknown>;
  recipe: ExtractedRecipe | null;
};

type JsonLdCandidate = {
  method: "jsonld";
  rawRecipe: Record<string, unknown>;
  score: number;
  recipe: Omit<ExtractedRecipe, "sourceMethod" | "rawRecipe">;
};

type DomCandidate = {
  method: "microdata" | "rdfa";
  rawRecipe: Record<string, unknown>;
  score: number;
  recipe: Omit<ExtractedRecipe, "sourceMethod" | "rawRecipe">;
};

export async function fetchRecipePage(url: string): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": DEFAULT_USER_AGENT,
      },
    });

    const contentType = response.headers.get("content-type");
    const finalUrl = response.url || url;

    if (!response.ok) {
      return {
        originalUrl: url,
        finalUrl,
        fetchStatus: "fetch_failed",
        contentType,
        fetchedAt,
        html: null,
        errorMessage: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    if (!contentType?.toLowerCase().includes("html")) {
      return {
        originalUrl: url,
        finalUrl,
        fetchStatus: "not_html",
        contentType,
        fetchedAt,
        html: null,
      };
    }

    const html = await response.text();

    return {
      originalUrl: url,
      finalUrl,
      fetchStatus: "fetched",
      contentType,
      fetchedAt,
      html,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      originalUrl: url,
      finalUrl: null,
      fetchStatus: "fetch_failed",
      contentType: null,
      fetchedAt,
      html: null,
      errorMessage: message,
    };
  }
}

export function extractRecipeFromHtml(html: string, pageUrl: string): ExtractionResult {
  const $ = load(html);
  const warnings: string[] = [];
  const jsonLdCandidates = extractJsonLdCandidates($, pageUrl, warnings);

  if (jsonLdCandidates.length > 0) {
    return selectBestCandidate(jsonLdCandidates, warnings);
  }

  const domCandidates = [
    ...extractMicrodataCandidates($, pageUrl),
    ...extractRdfaCandidates($, pageUrl),
  ];

  if (domCandidates.length > 0) {
    return selectBestCandidate(domCandidates, warnings);
  }

  const pageSignals = gatherPageSignals($);

  return {
    status: pageSignals.looksRecipeLike ? "unsupported_page" : "not_recipe",
    method: null,
    warnings,
    candidateCount: 0,
    payload: {
      pageTitle: pageSignals.pageTitle,
      canonicalUrl: pageSignals.canonicalUrl,
      looksRecipeLike: pageSignals.looksRecipeLike,
    },
    recipe: null,
  };
}

function selectBestCandidate(candidates: Array<JsonLdCandidate | DomCandidate>, warnings: string[]): ExtractionResult {
  const sorted = [...candidates].sort((left, right) => right.score - left.score);
  const best = sorted[0];
  const second = sorted[1];

  if (!best) {
    return {
      status: "extraction_failed",
      method: null,
      warnings: [...warnings, "No recipe candidate could be selected."],
      candidateCount: 0,
      payload: {},
      recipe: null,
    };
  }

  const clearlyDominant = !second || best.score >= second.score + 3;

  if (!clearlyDominant) {
    return {
      status: "multiple_recipes_needs_review",
      method: null,
      warnings: [...warnings, "Multiple recipe candidates were found without a clear winner."],
      candidateCount: sorted.length,
      payload: {
        candidates: sorted.map((candidate) => ({
          title: candidate.recipe.title,
          method: candidate.method,
          score: candidate.score,
          ingredientCount: candidate.recipe.ingredients.length,
          stepCount: candidate.recipe.steps.length,
        })),
      },
      recipe: null,
    };
  }

  return {
    status: "recipe_extracted",
    method: best.method,
    warnings,
    candidateCount: sorted.length,
    payload: {
      title: best.recipe.title,
      method: best.method,
      score: best.score,
      ingredientCount: best.recipe.ingredients.length,
      stepCount: best.recipe.steps.length,
    },
    recipe: {
      ...best.recipe,
      sourceMethod: best.method,
      rawRecipe: best.rawRecipe,
    },
  };
}

function extractJsonLdCandidates($: CheerioAPI, pageUrl: string, warnings: string[]): JsonLdCandidate[] {
  const roots: unknown[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const rawText = $(element).contents().text().trim();

    if (!rawText) {
      return;
    }

    try {
      roots.push(JSON.parse(rawText));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Skipped invalid JSON-LD block: ${message}`);
    }
  });

  const objects = roots.flatMap((root) => flattenJsonLd(root));

  return objects
    .filter((node): node is Record<string, unknown> => isRecord(node) && hasSchemaType(node, RECIPE_TYPE))
    .map((node) => buildJsonLdCandidate(node, $, pageUrl))
    .filter((candidate): candidate is JsonLdCandidate => candidate !== null);
}

function extractMicrodataCandidates($: CheerioAPI, pageUrl: string): DomCandidate[] {
  const candidates: DomCandidate[] = [];

  $('[itemscope][itemtype]').each((_, element) => {
    const itemType = ($(element).attr("itemtype") ?? "").toLowerCase();

    if (!itemType.includes("schema.org/recipe")) {
      return;
    }

    const candidate = buildDomCandidate($, $(element), pageUrl, "microdata");

    if (candidate) {
      candidates.push(candidate);
    }
  });

  return candidates;
}

function extractRdfaCandidates($: CheerioAPI, pageUrl: string): DomCandidate[] {
  const candidates: DomCandidate[] = [];

  $('[typeof]').each((_, element) => {
    const typeofValue = ($(element).attr("typeof") ?? "").toLowerCase();

    if (!typeofValue.includes("recipe")) {
      return;
    }

    const candidate = buildDomCandidate($, $(element), pageUrl, "rdfa");

    if (candidate) {
      candidates.push(candidate);
    }
  });

  return candidates;
}

function buildJsonLdCandidate(node: Record<string, unknown>, $: CheerioAPI, pageUrl: string): JsonLdCandidate | null {
  const ingredients = toStringArray(node.recipeIngredient ?? node.ingredients).map(parseIngredientLine);
  const steps = parseInstructionList(node.recipeInstructions);
  const imageUrl = firstImageUrl(node.image);
  const recipe = {
    title: stringOrNull(node.name),
    description: stringOrNull(node.description),
    author: authorName(node.author),
    canonicalUrl: stringOrNull(node.url) ?? gatherPageSignals($).canonicalUrl ?? pageUrl,
    siteName: publisherName(node.publisher) ?? gatherPageSignals($).siteName,
    imageUrl,
    yieldText: firstString(node.recipeYield),
    prepTime: stringOrNull(node.prepTime),
    cookTime: stringOrNull(node.cookTime),
    totalTime: stringOrNull(node.totalTime),
    categories: toStringArray(node.recipeCategory),
    cuisine: firstString(node.recipeCuisine),
    keywords: toStringArray(node.keywords),
    nutrition: isRecord(node.nutrition) ? node.nutrition : null,
    ingredients,
    steps,
  };

  const score = scoreRecipeCandidate(recipe);

  if (score === 0) {
    return null;
  }

  return {
    method: "jsonld",
    rawRecipe: node,
    score,
    recipe,
  };
}

function buildDomCandidate(
  $: CheerioAPI,
  root: Cheerio<Element>,
  pageUrl: string,
  method: "microdata" | "rdfa",
): DomCandidate | null {
  const scope = descendantsWithinScope($, root);
  const propertyAttribute = method === "microdata" ? "itemprop" : "property";
  const pageSignals = gatherPageSignals($);

  const ingredientNodes = scope.filter((_, element) => {
    const name = getAttribute(element, propertyAttribute);
    return name === "recipeIngredient" || name === "ingredients";
  });
  const instructionNodes = scope.filter((_, element) => {
    const name = getAttribute(element, propertyAttribute);
    return name === "recipeInstructions";
  });

  const ingredients = ingredientNodes
    .map((_, element) => nodeValue($, $(element)))
    .get()
    .flatMap(splitIngredientValue)
    .map(parseIngredientLine)
    .filter((ingredient) => ingredient.originalText.length > 0);
  const steps = instructionNodes.length > 0 ? parseInstructionNodes($, instructionNodes, method) : [];
  const rawRecipe: Record<string, unknown> = {
    name: nodeValue($, firstProperty(scope, propertyAttribute, "name")),
    description: nodeValue($, firstProperty(scope, propertyAttribute, "description")),
    author: nodeValue($, firstProperty(scope, propertyAttribute, "author")),
    url: nodeValue($, firstProperty(scope, propertyAttribute, "url")) ?? pageUrl,
    recipeYield: nodeValue($, firstProperty(scope, propertyAttribute, "recipeYield")),
    prepTime: nodeValue($, firstProperty(scope, propertyAttribute, "prepTime")),
    cookTime: nodeValue($, firstProperty(scope, propertyAttribute, "cookTime")),
    totalTime: nodeValue($, firstProperty(scope, propertyAttribute, "totalTime")),
    recipeCategory: scope
      .filter((_, element) => getAttribute(element, propertyAttribute) === "recipeCategory")
      .map((_, element) => nodeValue($, $(element)))
      .get()
      .filter(Boolean),
    recipeCuisine: scope
      .filter((_, element) => getAttribute(element, propertyAttribute) === "recipeCuisine")
      .map((_, element) => nodeValue($, $(element)))
      .get()
      .find(Boolean),
    keywords: scope
      .filter((_, element) => getAttribute(element, propertyAttribute) === "keywords")
      .map((_, element) => nodeValue($, $(element)))
      .get()
      .flatMap((value) => toStringArray(value)),
    recipeIngredient: ingredients.map((ingredient) => ingredient.originalText),
    recipeInstructions: steps.map((step) => step.rawText),
  };

  const recipe = {
    title: stringOrNull(rawRecipe.name),
    description: stringOrNull(rawRecipe.description),
    author: stringOrNull(rawRecipe.author),
    canonicalUrl: stringOrNull(rawRecipe.url) ?? pageSignals.canonicalUrl ?? pageUrl,
    siteName: pageSignals.siteName,
    imageUrl: nodeValue($, firstProperty(scope, propertyAttribute, "image")) ?? pageSignals.imageUrl,
    yieldText: stringOrNull(rawRecipe.recipeYield),
    prepTime: stringOrNull(rawRecipe.prepTime),
    cookTime: stringOrNull(rawRecipe.cookTime),
    totalTime: stringOrNull(rawRecipe.totalTime),
    categories: toStringArray(rawRecipe.recipeCategory),
    cuisine: stringOrNull(rawRecipe.recipeCuisine),
    keywords: toStringArray(rawRecipe.keywords),
    nutrition: null,
    ingredients,
    steps,
  };

  const score = scoreRecipeCandidate(recipe);

  if (score === 0) {
    return null;
  }

  return {
    method,
    rawRecipe,
    score,
    recipe,
  };
}

function parseInstructionNodes(
  $: CheerioAPI,
  nodes: Cheerio<Element>,
  method: "microdata" | "rdfa",
): ExtractedStep[] {
  const steps: ExtractedStep[] = [];
  const propertyAttribute = method === "microdata" ? "itemprop" : "property";

  nodes.each((_, element) => {
    const node = $(element);
    const text = nodeValue($, node);

    if (text) {
      const splitSteps = splitInstructionValue(text);

      for (const value of splitSteps) {
        steps.push({
          position: steps.length + 1,
          rawText: value,
          text: normalizeWhitespace(value),
          section: null,
        });
      }
      return;
    }

    const nestedSteps = node.find(`[${propertyAttribute}="text"]`);

    nestedSteps.each((__, nestedElement) => {
      const nestedText = nodeValue($, $(nestedElement));

      if (!nestedText) {
        return;
      }

      steps.push({
        position: steps.length + 1,
        rawText: nestedText,
        text: normalizeWhitespace(nestedText),
        section: null,
      });
    });
  });

  return steps;
}

function parseInstructionList(input: unknown, currentSection: string | null = null): ExtractedStep[] {
  const steps: ExtractedStep[] = [];

  for (const value of toArray(input)) {
    if (typeof value === "string") {
      for (const part of splitInstructionValue(value)) {
        steps.push({
          position: steps.length + 1,
          rawText: part,
          text: normalizeWhitespace(part),
          section: currentSection,
        });
      }
      continue;
    }

    if (!isRecord(value)) {
      continue;
    }

    if (hasSchemaType(value, HOW_TO_SECTION_TYPE)) {
      const sectionName = stringOrNull(value.name) ?? currentSection;
      const nestedSteps = parseInstructionList(value.itemListElement ?? value.recipeInstructions, sectionName);

      for (const step of nestedSteps) {
        steps.push({
          ...step,
          position: steps.length + 1,
        });
      }

      continue;
    }

    if (hasSchemaType(value, HOW_TO_STEP_TYPE)) {
      const stepText = stringOrNull(value.text) ?? stringOrNull(value.name);

      if (!stepText) {
        continue;
      }

      steps.push({
        position: steps.length + 1,
        rawText: stepText,
        text: normalizeWhitespace(stepText),
        section: currentSection,
      });
      continue;
    }

    const nestedSteps = parseInstructionList(value.text ?? value.itemListElement ?? value.name, currentSection);

    for (const step of nestedSteps) {
      steps.push({
        ...step,
        position: steps.length + 1,
      });
    }
  }

  return steps;
}

function parseIngredientLine(rawLine: string): ExtractedIngredientLine {
  const normalized = normalizeWhitespace(rawLine);
  const match = normalized.match(
    /^((?:\d+\s+\d\/\d|\d+\/\d|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]+)(?:\s*-\s*(?:\d+\s+\d\/\d|\d+\/\d|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]+))?(?:\s*\([^)]+\))?)\s+(.+)$/u,
  );

  if (!match) {
    return {
      originalText: normalized,
      amountText: null,
      unit: null,
      ingredientText: normalized || null,
      notes: null,
      normalizationStatus: "needs_review",
    };
  }

  const amountText = match[1].trim();
  const remainder = match[2].trim();
  const parts = remainder.split(/\s*,\s*/);
  const mainPart = parts.shift() ?? remainder;
  const noteText = parts.length > 0 ? parts.join(", ") : null;
  const tokens = mainPart.split(/\s+/);
  const firstToken = tokens[0]?.toLowerCase() ?? "";
  const normalizedUnit = normalizeUnit(firstToken);
  const ingredientText = normalizedUnit ? tokens.slice(1).join(" ") : mainPart;

  return {
    originalText: normalized,
    amountText,
    unit: normalizedUnit,
    ingredientText: ingredientText || null,
    notes: noteText,
    normalizationStatus: normalizedUnit || amountText ? "pending" : "needs_review",
  };
}

function normalizeUnit(token: string): string | null {
  const cleaned = token.replace(/[().]/g, "").toLowerCase();

  const unitMap: Record<string, string> = {
    c: "cup",
    cup: "cup",
    cups: "cup",
    tbsp: "tablespoon",
    tablespoon: "tablespoon",
    tablespoons: "tablespoon",
    tsp: "teaspoon",
    teaspoon: "teaspoon",
    teaspoons: "teaspoon",
    lb: "pound",
    lbs: "pound",
    pound: "pound",
    pounds: "pound",
    oz: "ounce",
    ounce: "ounce",
    ounces: "ounce",
    clove: "clove",
    cloves: "clove",
    can: "can",
    cans: "can",
    package: "package",
    packages: "package",
    pkg: "package",
    pinch: "pinch",
    pinches: "pinch",
    gram: "gram",
    grams: "gram",
    g: "gram",
    kg: "kilogram",
    kilogram: "kilogram",
    kilograms: "kilogram",
    ml: "milliliter",
    milliliter: "milliliter",
    milliliters: "milliliter",
    l: "liter",
    liter: "liter",
    liters: "liter",
    qt: "quart",
    quart: "quart",
    quarts: "quart",
    pt: "pint",
    pint: "pint",
    pints: "pint",
  };

  return unitMap[cleaned] ?? null;
}

function splitIngredientValue(value: string): string[] {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return [];
  }

  if (normalized.includes("\n")) {
    return normalized
      .split("\n")
      .map((entry) => normalizeWhitespace(entry))
      .filter(Boolean);
  }

  return [normalized];
}

function splitInstructionValue(value: string): string[] {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return [];
  }

  const lineSplit = value
    .split(/\n+/)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);

  return lineSplit.length > 1 ? lineSplit : [normalized];
}

function scoreRecipeCandidate(recipe: Omit<ExtractedRecipe, "sourceMethod" | "rawRecipe">): number {
  let score = 0;

  if (recipe.title) {
    score += 2;
  }
  if (recipe.ingredients.length >= 2) {
    score += 3;
  }
  if (recipe.steps.length >= 2) {
    score += 3;
  }
  if (recipe.imageUrl) {
    score += 1;
  }
  if (recipe.author) {
    score += 1;
  }
  if (recipe.totalTime || recipe.prepTime || recipe.cookTime) {
    score += 1;
  }
  if (recipe.yieldText) {
    score += 1;
  }

  return score;
}

function gatherPageSignals($: CheerioAPI) {
  const pageTitle = normalizeWhitespace($("title").first().text()) || null;
  const canonicalUrl = $('link[rel="canonical"]').attr("href") ?? $('meta[property="og:url"]').attr("content") ?? null;
  const siteName = $('meta[property="og:site_name"]').attr("content") ?? null;
  const imageUrl = $('meta[property="og:image"]').attr("content") ?? null;
  const bodyText = normalizeWhitespace($("body").text()).toLowerCase();
  const titleText = (pageTitle ?? "").toLowerCase();
  const looksRecipeLike =
    bodyText.includes("ingredients") ||
    bodyText.includes("instructions") ||
    bodyText.includes("directions") ||
    titleText.includes("recipe");

  return {
    pageTitle,
    canonicalUrl,
    siteName,
    imageUrl,
    looksRecipeLike,
  };
}

function descendantsWithinScope($: CheerioAPI, root: Cheerio<Element>): Cheerio<Element> {
  return root.find("*").filter((_, element) => {
    const parentScopes = $(element).parents('[itemscope], [typeof]');
    const rootElement = root.get(0);

    if (!rootElement) {
      return false;
    }

    return parentScopes.get().every((scopeElement) => scopeElement === rootElement || !$(scopeElement).is('[itemscope], [typeof]'));
  });
}

function firstProperty(scope: Cheerio<Element>, attributeName: string, propertyName: string): Cheerio<Element> {
  return scope.filter((_, element) => getAttribute(element, attributeName) === propertyName).first();
}

function getAttribute(element: Element, attributeName: string): string | null {
  const attribute = element.attribs?.[attributeName];

  return attribute ? attribute.trim() : null;
}

function nodeValue($: CheerioAPI, node: Cheerio<Element>): string | null {
  const element = node.get(0);

  if (!element) {
    return null;
  }

  const tagName = element.tagName?.toLowerCase();

  if (tagName === "meta") {
    return normalizeWhitespace(node.attr("content") ?? "") || null;
  }

  if (tagName === "img") {
    return normalizeWhitespace(node.attr("src") ?? node.attr("data-src") ?? "") || null;
  }

  if (tagName === "a" || tagName === "link") {
    return normalizeWhitespace(node.attr("href") ?? "") || null;
  }

  if (tagName === "time") {
    return normalizeWhitespace(node.attr("datetime") ?? node.text()) || null;
  }

  if (tagName === "input") {
    return normalizeWhitespace(node.attr("value") ?? "") || null;
  }

  return normalizeWhitespace(node.text()) || null;
}

function flattenJsonLd(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input.flatMap((entry) => flattenJsonLd(entry));
  }

  if (!isRecord(input)) {
    return [];
  }

  const flattened: unknown[] = [input];

  const graph = input["@graph"];

  if (Array.isArray(graph)) {
    flattened.push(...graph.flatMap((entry) => flattenJsonLd(entry)));
  }

  const mainEntity = input.mainEntity;

  if (mainEntity) {
    flattened.push(...flattenJsonLd(mainEntity));
  }

  const itemListElement = input.itemListElement;

  if (itemListElement) {
    flattened.push(...flattenJsonLd(itemListElement));
  }

  return flattened;
}

function hasSchemaType(input: Record<string, unknown>, type: string): boolean {
  return toStringArray(input["@type"])
    .map((value) => value.toLowerCase())
    .includes(type);
}

function firstImageUrl(input: unknown): string | null {
  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const imageUrl = firstImageUrl(item);

      if (imageUrl) {
        return imageUrl;
      }
    }
    return null;
  }

  if (isRecord(input)) {
    return stringOrNull(input.url) ?? stringOrNull(input.contentUrl);
  }

  return null;
}

function authorName(input: unknown): string | null {
  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    const names = input.map((entry) => authorName(entry)).filter((value): value is string => Boolean(value));
    return names.length > 0 ? names.join(", ") : null;
  }

  if (isRecord(input)) {
    return stringOrNull(input.name);
  }

  return null;
}

function publisherName(input: unknown): string | null {
  if (typeof input === "string") {
    return input;
  }

  if (isRecord(input)) {
    return stringOrNull(input.name);
  }

  return null;
}

function stringOrNull(input: unknown): string | null {
  return typeof input === "string" ? normalizeWhitespace(input) || null : null;
}

function firstString(input: unknown): string | null {
  const values = toStringArray(input);
  return values[0] ?? null;
}

function toStringArray(input: unknown): string[] {
  if (typeof input === "string") {
    return input
      .split(",")
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean);
  }

  if (Array.isArray(input)) {
    return input.flatMap((entry) => toStringArray(entry));
  }

  if (isRecord(input) && typeof input.name === "string") {
    return [normalizeWhitespace(input.name)].filter(Boolean);
  }

  return [];
}

function toArray<T>(input: T | T[] | null | undefined): T[] {
  if (input === null || input === undefined) {
    return [];
  }

  return Array.isArray(input) ? input : [input];
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
