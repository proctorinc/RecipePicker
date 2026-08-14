import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import { z } from "zod";

import { generateRecipeExtractionWithHouseholdAi } from "@/lib/server/ai-provider";
import type { DatabaseClient } from "@/src/db/client";

const RECIPE_TYPE = "recipe";
const HOW_TO_STEP_TYPE = "howtostep";
const HOW_TO_SECTION_TYPE = "howtosection";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const RECIPE_LINK_LABELS = [
  "jump to recipe",
  "go to recipe",
  "recipe card",
  "skip to recipe",
  "see recipe",
  "print recipe",
];
const CONSENT_LABELS = ["accept", "agree", "allow", "got it", "continue"];
const IMPERATIVE_VERBS = new Set([
  "add",
  "arrange",
  "bake",
  "beat",
  "blend",
  "boil",
  "bring",
  "broil",
  "brush",
  "chill",
  "combine",
  "cook",
  "cover",
  "cut",
  "drain",
  "fold",
  "garnish",
  "heat",
  "knead",
  "let",
  "marinate",
  "mix",
  "pour",
  "prepare",
  "reduce",
  "remove",
  "return",
  "roast",
  "saute",
  "season",
  "serve",
  "simmer",
  "sprinkle",
  "stir",
  "taste",
  "top",
  "transfer",
  "wash",
  "whisk",
]);
const FRAGMENTARY_STARTS = new Set(["a", "an", "and", "back", "for", "hot", "in", "into", "on", "over", "the", "to", "until", "with"]);
const UNICODE_FRACTIONS: Record<string, string> = {
  "¼": "1/4",
  "½": "1/2",
  "¾": "3/4",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Recipe extraction cancelled.", "AbortError");
  }
}

export type RecipeFetchStatus = "fetched" | "fetch_failed" | "not_html";

export type ExtractionStatus =
  | "recipe_extracted"
  | "not_recipe"
  | "unsupported_page"
  | "multiple_recipes_needs_review"
  | "extraction_failed";

export type ExtractionMethod = "jsonld" | "microdata" | "rdfa" | "dom" | "ai";
export type FetchStrategy =
  | "direct_http_html"
  | "recipe_anchor_follow"
  | "browser_rendered_html"
  | "browser_reader_text"
  | "ai_extraction";
export type ContentVariant = "raw_html" | "recipe_anchor_html" | "browser_rendered_html" | "browser_reader_text";
export type ExtractionStrategy = "schema_structured" | "dom_recipe_region" | "ai_structured";
export type ExtractionConfidence = "high" | "medium" | "low" | "none";

export type FetchResult = {
  originalUrl: string;
  finalUrl: string | null;
  fetchStatus: RecipeFetchStatus;
  contentType: string | null;
  fetchedAt: string;
  html: string | null;
  pagePreviewDataUrl?: string | null;
  errorMessage?: string;
  fetchStrategy?: FetchStrategy;
};

export type ExtractedIngredientLine = {
  originalText: string;
  amountText: string | null;
  amountValue: number | null;
  amountMaxValue: number | null;
  unit: string | null;
  ingredientText: string | null;
  notes: string | null;
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

export type QualitySignals = {
  titlePresent: boolean;
  titleLooksPlausible: boolean;
  ingredientCount: number;
  stepCount: number;
  averageStepLength: number;
  ingredientCompleteness: number;
  verbStartsRatio: number;
  fragmentaryStartsRatio: number;
  duplicateStepsRatio: number;
  visibleAgreement: number;
  looksRecipeLike: boolean;
};

export type ExtractionAttempt = {
  status: ExtractionStatus;
  method: ExtractionMethod | null;
  fetchStrategy: FetchStrategy;
  contentVariant: ContentVariant | null;
  extractionStrategy: ExtractionStrategy | null;
  warnings: string[];
  failureReason: string | null;
  qualityScore: number | null;
  confidence: ExtractionConfidence;
  qualitySignals: QualitySignals | null;
  candidateCount: number;
  payload: Record<string, unknown>;
  recipe: ExtractedRecipe | null;
  fetchedAt: string;
  sourceUrl: string | null;
  pagePreviewDataUrl?: string | null;
};

export type ExtractionResult = {
  status: ExtractionStatus;
  method: ExtractionMethod | null;
  fetchStrategy: FetchStrategy | null;
  contentVariant: ContentVariant | null;
  extractionStrategy: ExtractionStrategy | null;
  warnings: string[];
  candidateCount: number;
  payload: Record<string, unknown>;
  recipe: ExtractedRecipe | null;
  qualityScore: number | null;
  confidence: ExtractionConfidence;
  selected: boolean;
  lowConfidence: boolean;
  failureReason: string | null;
  qualitySignals: QualitySignals | null;
  sourceUrl: string | null;
  attempts: ExtractionAttempt[];
};

type Candidate = {
  method: ExtractionMethod;
  extractionStrategy: ExtractionStrategy;
  rawRecipe: Record<string, unknown>;
  recipe: Omit<ExtractedRecipe, "sourceMethod" | "rawRecipe">;
};

type BrowserFetchResult = FetchResult & {
  readerText: string | null;
};

export async function fetchRecipePage(url: string, signal?: AbortSignal): Promise<FetchResult> {
  return fetchRecipePageWithStrategy(url, "direct_http_html", signal);
}

export function extractRecipeFromHtml(html: string, pageUrl: string): ExtractionResult {
  const attempts = extractAttemptsFromHtml(html, pageUrl, "direct_http_html", "raw_html");
  return chooseBestExtraction(attempts);
}

export async function extractRecipeWithFallbacks(
  url: string,
  options?: { householdId?: string; signal?: AbortSignal; database?: DatabaseClient },
): Promise<ExtractionResult> {
  throwIfAborted(options?.signal);
  const attempts: ExtractionAttempt[] = [];

  const directFetch = await fetchRecipePageWithStrategy(url, "direct_http_html", options?.signal);
  throwIfAborted(options?.signal);
  attempts.push(...buildAttemptsFromFetch(directFetch, "direct_http_html"));

  let best = chooseBestExtraction(attempts);
  if (shouldStopAfter(best)) {
    return await ensureResultHasPreview(best, url, options?.signal);
  }

  const browserFetch = await fetchRecipePageWithBrowser(url, options?.signal);
  throwIfAborted(options?.signal);
  attempts.push(...buildAttemptsFromFetch(browserFetch, "browser_rendered_html", browserFetch.readerText));

  best = chooseBestExtraction(attempts);
  if (shouldStopAfter(best)) {
    return await ensureResultHasPreview(best, url, options?.signal);
  }

  const aiAttempt = await extractRecipeWithAi(
    best,
    directFetch,
    browserFetch,
    options?.householdId ?? null,
    options?.signal,
    options?.database,
  );
  if (aiAttempt) {
    attempts.push(aiAttempt);
  }

  return await ensureResultHasPreview(chooseBestExtraction(attempts), url, options?.signal);
}

async function fetchRecipePageWithStrategy(url: string, fetchStrategy: FetchStrategy, signal?: AbortSignal): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();
  const headers = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": DEFAULT_USER_AGENT,
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      });

      const contentType = response.headers.get("content-type");
      const finalUrl = response.url || url;

      if (!response.ok) {
        if (attempt === 0 && response.status >= 500) {
          continue;
        }
        return {
          originalUrl: url,
          finalUrl,
          fetchStatus: "fetch_failed",
          contentType,
          fetchedAt,
          html: null,
          errorMessage: `HTTP ${response.status} ${response.statusText}`,
          fetchStrategy,
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
          fetchStrategy,
        };
      }

      return {
        originalUrl: url,
        finalUrl,
        fetchStatus: "fetched",
        contentType,
        fetchedAt,
        html: await response.text(),
        fetchStrategy,
      };
    } catch (error: unknown) {
      throwIfAborted(signal);
      if (attempt === 0) {
        continue;
      }

      return {
        originalUrl: url,
        finalUrl: null,
        fetchStatus: "fetch_failed",
        contentType: null,
        fetchedAt,
        html: null,
        errorMessage: error instanceof Error ? error.message : String(error),
        fetchStrategy,
      };
    }
  }

  return {
    originalUrl: url,
    finalUrl: null,
    fetchStatus: "fetch_failed",
    contentType: null,
    fetchedAt,
    html: null,
    errorMessage: "Page fetch failed after retries.",
    fetchStrategy,
  };
}

async function fetchRecipePageWithBrowser(url: string, signal?: AbortSignal): Promise<BrowserFetchResult> {
  const fetchedAt = new Date().toISOString();
  throwIfAborted(signal);

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const closeOnAbort = () => void browser.close();
    signal?.addEventListener("abort", closeOnAbort, { once: true });
    const page = await browser.newPage({ userAgent: DEFAULT_USER_AGENT });

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(1500);
      await clickLikelyConsentButtons(page);
      await clickLikelyRecipeLink(page);
      await page.waitForTimeout(1000);

      const html = await page.content();
      const readerText = await page.locator("body").innerText().catch(() => null);
      const screenshot = await page.screenshot({
        fullPage: false,
        type: "jpeg",
        quality: 55,
      });

      return {
        originalUrl: url,
        finalUrl: page.url() || url,
        fetchStatus: "fetched",
        contentType: "text/html",
        fetchedAt,
        html,
        readerText,
        pagePreviewDataUrl: `data:image/jpeg;base64,${screenshot.toString("base64")}`,
        fetchStrategy: "browser_rendered_html",
      };
    } finally {
      signal?.removeEventListener("abort", closeOnAbort);
      await browser.close();
    }
  } catch (error: unknown) {
    throwIfAborted(signal);
    return {
      originalUrl: url,
      finalUrl: null,
      fetchStatus: "fetch_failed",
      contentType: null,
      fetchedAt,
      html: null,
      readerText: null,
      errorMessage: error instanceof Error ? error.message : String(error),
      fetchStrategy: "browser_rendered_html",
    };
  }
}

async function capturePagePreviewWithBrowser(url: string, signal?: AbortSignal): Promise<string | null> {
  throwIfAborted(signal);
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const closeOnAbort = () => void browser.close();
    signal?.addEventListener("abort", closeOnAbort, { once: true });
    const page = await browser.newPage({ userAgent: DEFAULT_USER_AGENT });

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(1500);
      await clickLikelyConsentButtons(page);
      await clickLikelyRecipeLink(page);
      await page.waitForTimeout(1000);
      const screenshot = await page.screenshot({
        fullPage: false,
        type: "jpeg",
        quality: 55,
      });
      return `data:image/jpeg;base64,${screenshot.toString("base64")}`;
    } finally {
      signal?.removeEventListener("abort", closeOnAbort);
      await browser.close();
    }
  } catch {
    throwIfAborted(signal);
    return null;
  }
}

async function ensureResultHasPreview(result: ExtractionResult, url: string, signal?: AbortSignal): Promise<ExtractionResult> {
  throwIfAborted(signal);
  if (result.status !== "recipe_extracted") {
    return result;
  }

  const existingPreview = result.attempts.find((attempt) => attempt.pagePreviewDataUrl)?.pagePreviewDataUrl ?? null;

  if (existingPreview) {
    return result;
  }

  const pagePreviewDataUrl = await capturePagePreviewWithBrowser(url, signal);
  throwIfAborted(signal);
  if (!pagePreviewDataUrl) {
    return result;
  }

  return {
    ...result,
    attempts: result.attempts.map((attempt) => ({
      ...attempt,
      pagePreviewDataUrl: attempt.pagePreviewDataUrl ?? pagePreviewDataUrl,
    })),
  };
}

function buildAttemptsFromFetch(fetchResult: FetchResult, fetchStrategy: FetchStrategy, readerText?: string | null): ExtractionAttempt[] {
  if (fetchResult.fetchStatus !== "fetched" || !fetchResult.html) {
    return [buildFetchFailureAttempt(fetchResult, fetchStrategy)];
  }

  const pageUrl = fetchResult.finalUrl ?? fetchResult.originalUrl;
  const attempts: ExtractionAttempt[] = extractAttemptsFromHtml(
    fetchResult.html,
    pageUrl,
    fetchStrategy,
    fetchStrategy === "browser_rendered_html" ? "browser_rendered_html" : "raw_html",
  ).map((attempt) => ({ ...attempt, fetchedAt: fetchResult.fetchedAt, pagePreviewDataUrl: fetchResult.pagePreviewDataUrl ?? null }));

  if (fetchStrategy === "browser_rendered_html" && readerText?.trim()) {
    attempts.push(buildReaderTextAttempt(readerText, pageUrl, fetchResult.fetchedAt, fetchResult.pagePreviewDataUrl ?? null));
  }

  return attempts;
}

function extractAttemptsFromHtml(
  html: string,
  pageUrl: string,
  fetchStrategy: FetchStrategy,
  baseContentVariant: ContentVariant,
): ExtractionAttempt[] {
  const attempts: ExtractionAttempt[] = [];

  attempts.push(extractSchemaOrDomAttempt(html, pageUrl, fetchStrategy, baseContentVariant, false));

  const anchorHtml = sliceRecipeAnchorHtml(html);
  if (anchorHtml) {
    attempts.push(extractSchemaOrDomAttempt(anchorHtml, pageUrl, "recipe_anchor_follow", "recipe_anchor_html", true));
  }

  return attempts;
}

function extractSchemaOrDomAttempt(
  html: string,
  pageUrl: string,
  fetchStrategy: FetchStrategy,
  contentVariant: ContentVariant,
  anchorFocused: boolean,
): ExtractionAttempt {
  const $ = load(html);
  const warnings: string[] = [];
  const pageSignals = gatherPageSignals($);
  const visibleSignals = gatherVisibleRecipeSignals($);
  const jsonLdCandidates = extractJsonLdCandidates($, pageUrl, warnings);
  const domCandidates = [...extractMicrodataCandidates($, pageUrl), ...extractRdfaCandidates($, pageUrl)];
  const schemaCandidates = [...jsonLdCandidates, ...domCandidates];
  const domRegionCandidate = buildVisibleDomRecipeCandidate($, pageUrl, visibleSignals);

  const attemptCandidates: Candidate[] = [];
  if (schemaCandidates.length > 0) {
    const selectedSchema = pickBestCandidate(schemaCandidates, visibleSignals);
    if (selectedSchema) {
      attemptCandidates.push(selectedSchema);
    }
  }
  if (domRegionCandidate) {
    attemptCandidates.push(domRegionCandidate);
  }

  const bestCandidate = pickBestCandidate(attemptCandidates, visibleSignals);
  if (!bestCandidate) {
    return {
      status: pageSignals.looksRecipeLike ? "unsupported_page" : "not_recipe",
      method: null,
      fetchStrategy,
      contentVariant,
      extractionStrategy: null,
      warnings,
      failureReason: pageSignals.looksRecipeLike ? "Recipe-like page lacked extractable structured content." : "Page did not look like a recipe.",
      qualityScore: null,
      confidence: "none",
      qualitySignals: null,
      candidateCount: attemptCandidates.length,
      payload: {
        pageTitle: pageSignals.pageTitle,
        canonicalUrl: pageSignals.canonicalUrl,
        looksRecipeLike: pageSignals.looksRecipeLike,
        anchorFocused,
      },
      recipe: null,
      fetchedAt: new Date().toISOString(),
      sourceUrl: pageUrl,
    };
  }

  const signals = scoreRecipeQuality(bestCandidate.recipe, visibleSignals);
  const confidence = classifyConfidence(signals.score);
  const competingCandidates = attemptCandidates
    .map((candidate) => ({
      method: candidate.method,
      extractionStrategy: candidate.extractionStrategy,
      title: candidate.recipe.title,
      qualityScore: scoreRecipeQuality(candidate.recipe, visibleSignals).score,
      ingredientCount: candidate.recipe.ingredients.length,
      stepCount: candidate.recipe.steps.length,
    }))
    .sort((left, right) => right.qualityScore - left.qualityScore);

  return {
    status: "recipe_extracted",
    method: bestCandidate.method,
    fetchStrategy,
    contentVariant,
    extractionStrategy: bestCandidate.extractionStrategy,
    warnings,
    failureReason: null,
    qualityScore: signals.score,
    confidence,
    qualitySignals: signals.signals,
    candidateCount: attemptCandidates.length,
    payload: {
      anchorFocused,
      candidates: competingCandidates,
      pageTitle: pageSignals.pageTitle,
      visibleIngredientCount: visibleSignals.ingredients.length,
      visibleStepCount: visibleSignals.steps.length,
    },
    recipe: {
      ...bestCandidate.recipe,
      sourceMethod: bestCandidate.method,
      rawRecipe: bestCandidate.rawRecipe,
    },
    fetchedAt: new Date().toISOString(),
    sourceUrl: pageUrl,
  };
}

function buildFetchFailureAttempt(fetchResult: FetchResult, fetchStrategy: FetchStrategy): ExtractionAttempt {
  const notHtml = fetchResult.fetchStatus === "not_html";

  return {
    status: notHtml ? "not_recipe" : "extraction_failed",
    method: null,
    fetchStrategy,
    contentVariant: null,
    extractionStrategy: null,
    warnings: fetchResult.errorMessage ? [fetchResult.errorMessage] : [],
    failureReason: notHtml ? "Linked content was not HTML." : "Page fetch failed.",
    qualityScore: null,
    confidence: "none",
    qualitySignals: null,
    candidateCount: 0,
    payload: {
      fetchStatus: fetchResult.fetchStatus,
      errorMessage: fetchResult.errorMessage ?? null,
    },
    recipe: null,
    fetchedAt: fetchResult.fetchedAt,
    sourceUrl: fetchResult.finalUrl ?? fetchResult.originalUrl,
    pagePreviewDataUrl: fetchResult.pagePreviewDataUrl ?? null,
  };
}

function buildReaderTextAttempt(
  readerText: string,
  pageUrl: string,
  fetchedAt: string,
  pagePreviewDataUrl: string | null,
): ExtractionAttempt {
  const lines = splitMultilineText(readerText);
  const ingredientLines = collectLinesFromHeadings(lines, ["ingredients"]);
  const stepLines = collectLinesFromHeadings(lines, ["instructions", "directions", "method", "preparation"]);

  const recipe = ingredientLines.length >= 2 && stepLines.length >= 2
    ? {
        title: null,
        description: null,
        author: null,
        canonicalUrl: pageUrl,
        siteName: null,
        imageUrl: null,
        yieldText: null,
        prepTime: null,
        cookTime: null,
        totalTime: null,
        categories: [],
        cuisine: null,
        keywords: [],
        nutrition: null,
        ingredients: ingredientLines.map(parseIngredientLine),
        steps: stepLines.map((step, index) => ({
          position: index + 1,
          rawText: step,
          text: normalizeWhitespace(step),
          section: null,
        })),
      }
    : null;

  if (!recipe) {
    return {
      status: "unsupported_page",
      method: null,
      fetchStrategy: "browser_reader_text",
      contentVariant: "browser_reader_text",
      extractionStrategy: null,
      warnings: [],
      failureReason: "Rendered page text did not contain enough recognizable recipe structure.",
      qualityScore: null,
      confidence: "none",
      qualitySignals: null,
      candidateCount: 0,
      payload: {
        ingredientLineCount: ingredientLines.length,
        stepLineCount: stepLines.length,
      },
      recipe: null,
      fetchedAt,
      sourceUrl: pageUrl,
    };
  }

  const visibleSignals = {
    ingredients: ingredientLines,
    steps: stepLines,
    title: null,
  };
  const quality = scoreRecipeQuality(recipe, visibleSignals);

  return {
    status: "recipe_extracted",
    method: "dom",
    fetchStrategy: "browser_reader_text",
    contentVariant: "browser_reader_text",
    extractionStrategy: "dom_recipe_region",
    warnings: [],
    failureReason: null,
    qualityScore: quality.score,
    confidence: classifyConfidence(quality.score),
    qualitySignals: quality.signals,
    candidateCount: 1,
    payload: {
      ingredientLineCount: ingredientLines.length,
      stepLineCount: stepLines.length,
    },
    recipe: {
      ...recipe,
      sourceMethod: "dom",
      rawRecipe: {
        ingredients: ingredientLines,
        steps: stepLines,
      },
    },
    fetchedAt,
    sourceUrl: pageUrl,
    pagePreviewDataUrl,
  };
}

function chooseBestExtraction(attempts: ExtractionAttempt[]): ExtractionResult {
  const sorted = [...attempts].sort(compareAttempts);
  const best = sorted[0];

  if (!best) {
    return {
      status: "extraction_failed",
      method: null,
      fetchStrategy: null,
      contentVariant: null,
      extractionStrategy: null,
      warnings: ["No extraction attempts were produced."],
      candidateCount: 0,
      payload: {},
      recipe: null,
      qualityScore: null,
      confidence: "none",
      selected: false,
      lowConfidence: true,
      failureReason: "No extraction attempts were produced.",
      qualitySignals: null,
      sourceUrl: null,
      attempts: [],
    };
  }

  const second = sorted[1];
  const lowConfidence = best.status !== "recipe_extracted" || best.confidence === "low" || best.confidence === "none" || Boolean(second && closeCompetingAttempts(best, second));

  return {
    status: best.status,
    method: best.method,
    fetchStrategy: best.fetchStrategy,
    contentVariant: best.contentVariant,
    extractionStrategy: best.extractionStrategy,
    warnings: best.warnings,
    candidateCount: best.candidateCount,
    payload: {
      ...best.payload,
      selectedAttemptSummary: summarizeAttempt(best),
      comparison: sorted.slice(0, 5).map(summarizeAttempt),
    },
    recipe: best.recipe,
    qualityScore: best.qualityScore,
    confidence: best.confidence,
    selected: best.status === "recipe_extracted",
    lowConfidence,
    failureReason: best.failureReason,
    qualitySignals: best.qualitySignals,
    sourceUrl: best.sourceUrl,
    attempts: sorted.map((attempt, index) => ({
      ...attempt,
      payload: {
        ...attempt.payload,
        rank: index + 1,
      },
    })),
  };
}

function compareAttempts(left: ExtractionAttempt, right: ExtractionAttempt) {
  const leftScore = left.status === "recipe_extracted" ? left.qualityScore ?? -1 : -1;
  const rightScore = right.status === "recipe_extracted" ? right.qualityScore ?? -1 : -1;

  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  if (left.status === "recipe_extracted" && right.status !== "recipe_extracted") {
    return -1;
  }
  if (right.status === "recipe_extracted" && left.status !== "recipe_extracted") {
    return 1;
  }

  const leftStatusRank = nonRecipeStatusRank(left.status);
  const rightStatusRank = nonRecipeStatusRank(right.status);
  if (leftStatusRank !== rightStatusRank) {
    return rightStatusRank - leftStatusRank;
  }

  return strategyCost(left.fetchStrategy) - strategyCost(right.fetchStrategy);
}

function nonRecipeStatusRank(status: ExtractionStatus) {
  switch (status) {
    case "recipe_extracted":
      return 4;
    case "multiple_recipes_needs_review":
      return 3;
    case "not_recipe":
    case "unsupported_page":
      return 2;
    case "extraction_failed":
    default:
      return 1;
  }
}

function strategyCost(strategy: FetchStrategy) {
  switch (strategy) {
    case "direct_http_html":
      return 1;
    case "recipe_anchor_follow":
      return 2;
    case "browser_rendered_html":
      return 3;
    case "browser_reader_text":
      return 4;
    case "ai_extraction":
      return 5;
  }
}

function shouldStopAfter(result: ExtractionResult) {
  return result.status === "recipe_extracted" && result.confidence === "high";
}

function closeCompetingAttempts(left: ExtractionAttempt, right: ExtractionAttempt) {
  if (left.status !== "recipe_extracted" || right.status !== "recipe_extracted") {
    return false;
  }
  return Math.abs((left.qualityScore ?? 0) - (right.qualityScore ?? 0)) <= 4;
}

function summarizeAttempt(attempt: ExtractionAttempt) {
  return {
    status: attempt.status,
    method: attempt.method,
    fetchStrategy: attempt.fetchStrategy,
    contentVariant: attempt.contentVariant,
    extractionStrategy: attempt.extractionStrategy,
    qualityScore: attempt.qualityScore,
    confidence: attempt.confidence,
    title: attempt.recipe?.title ?? null,
    ingredientCount: attempt.recipe?.ingredients.length ?? 0,
    stepCount: attempt.recipe?.steps.length ?? 0,
    failureReason: attempt.failureReason,
  };
}

async function extractRecipeWithAi(
  bestResult: ExtractionResult,
  directFetch: FetchResult,
  browserFetch: BrowserFetchResult,
  householdId: string | null,
  signal?: AbortSignal,
  database?: DatabaseClient,
): Promise<ExtractionAttempt | null> {
  if (!householdId) {
    return null;
  }

  const inputText =
    browserFetch.readerText?.trim() ||
    browserFetch.html?.slice(0, 25000) ||
    directFetch.html?.slice(0, 25000) ||
    "";

  if (!inputText) {
    return null;
  }

  const fetchedAt = new Date().toISOString();
  const prompt = [
    "Extract a recipe from the provided page content.",
    "Return nulls for unknown fields.",
    "Use concise complete instruction steps.",
    "Do not invent ingredients or steps that are not present.",
    "",
    `URL: ${browserFetch.finalUrl ?? directFetch.finalUrl ?? directFetch.originalUrl}`,
    "",
    inputText,
  ].join("\n");

  try {
    const parsed = await generateRecipeExtractionWithHouseholdAi({
      householdId,
      prompt,
      schema: aiRecipeSchema,
      signal,
      database,
    });
    throwIfAborted(signal);
    if (!parsed) {
      return null;
    }

    const recipe = toRecipeFromAi(parsed, browserFetch.finalUrl ?? directFetch.finalUrl ?? directFetch.originalUrl);
    if (!recipe) {
      return null;
    }

    const visibleSignals = browserFetch.readerText?.trim()
      ? {
          ingredients: collectLinesFromHeadings(splitMultilineText(browserFetch.readerText), ["ingredients"]),
          steps: collectLinesFromHeadings(splitMultilineText(browserFetch.readerText), ["instructions", "directions", "method"]),
          title: null,
        }
      : {
          ingredients: bestResult.recipe?.ingredients.map((ingredient) => ingredient.originalText) ?? [],
          steps: bestResult.recipe?.steps.map((step) => step.text) ?? [],
          title: bestResult.recipe?.title ?? null,
        };
    const quality = scoreRecipeQuality(recipe, visibleSignals);

    return {
      status: "recipe_extracted",
      method: "ai",
      fetchStrategy: "ai_extraction",
      contentVariant: browserFetch.readerText ? "browser_reader_text" : "browser_rendered_html",
      extractionStrategy: "ai_structured",
      warnings: [],
      failureReason: null,
      qualityScore: quality.score,
      confidence: classifyConfidence(quality.score - 6),
      qualitySignals: quality.signals,
      candidateCount: 1,
      payload: {
        model: "household-configured",
      },
      recipe: {
        ...recipe,
        sourceMethod: "ai",
        rawRecipe: parsed,
      },
      fetchedAt,
      sourceUrl: browserFetch.finalUrl ?? directFetch.finalUrl ?? directFetch.originalUrl,
      pagePreviewDataUrl: browserFetch.pagePreviewDataUrl ?? null,
    };
  } catch (error: unknown) {
    throwIfAborted(signal);
    return {
      status: "extraction_failed",
      method: null,
      fetchStrategy: "ai_extraction",
      contentVariant: browserFetch.readerText ? "browser_reader_text" : "browser_rendered_html",
      extractionStrategy: "ai_structured",
      warnings: [error instanceof Error ? error.message : String(error)],
      failureReason: "AI extraction request failed.",
      qualityScore: null,
      confidence: "none",
      qualitySignals: null,
      candidateCount: 0,
      payload: {},
      recipe: null,
      fetchedAt,
      sourceUrl: browserFetch.finalUrl ?? directFetch.finalUrl ?? directFetch.originalUrl,
      pagePreviewDataUrl: browserFetch.pagePreviewDataUrl ?? null,
    };
  }
}

const aiRecipeSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  author: z.string().nullable(),
  yieldText: z.string().nullable(),
  prepTime: z.string().nullable(),
  cookTime: z.string().nullable(),
  totalTime: z.string().nullable(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
});

function toRecipeFromAi(parsed: z.infer<typeof aiRecipeSchema>, pageUrl: string) {
  const ingredientLines = toStringEntries(parsed.ingredients);
  const stepLines = toStringEntries(parsed.steps);
  if (ingredientLines.length < 2 || stepLines.length < 2) {
    return null;
  }

  return {
    title: stringOrNull(parsed.title),
    description: stringOrNull(parsed.description),
    author: stringOrNull(parsed.author),
    canonicalUrl: pageUrl,
    siteName: null,
    imageUrl: null,
    yieldText: stringOrNull(parsed.yieldText),
    prepTime: stringOrNull(parsed.prepTime),
    cookTime: stringOrNull(parsed.cookTime),
    totalTime: stringOrNull(parsed.totalTime),
    categories: [],
    cuisine: null,
    keywords: [],
    nutrition: null,
    ingredients: ingredientLines.map(parseIngredientLine),
    steps: stepLines.map((step, index) => ({
      position: index + 1,
      rawText: step,
      text: normalizeWhitespace(step),
      section: null,
    })),
  };
}

function extractJsonLdCandidates($: CheerioAPI, pageUrl: string, warnings: string[]): Candidate[] {
  const roots: unknown[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const rawText = $(element).contents().text().trim();
    if (!rawText) {
      return;
    }

    try {
      roots.push(JSON.parse(rawText));
    } catch (error: unknown) {
      warnings.push(`Skipped invalid JSON-LD block: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  return roots
    .flatMap((root) => flattenJsonLd(root))
    .filter((node): node is Record<string, unknown> => isRecord(node) && hasSchemaType(node, RECIPE_TYPE))
    .map((node) => buildJsonLdCandidate(node, $, pageUrl))
    .filter((candidate): candidate is Candidate => candidate !== null);
}

function extractMicrodataCandidates($: CheerioAPI, pageUrl: string): Candidate[] {
  const candidates: Candidate[] = [];
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

function extractRdfaCandidates($: CheerioAPI, pageUrl: string): Candidate[] {
  const candidates: Candidate[] = [];
  $('[typeof]').each((_, element) => {
    const typeOfValue = ($(element).attr("typeof") ?? "").toLowerCase();
    if (!typeOfValue.includes("recipe")) {
      return;
    }
    const candidate = buildDomCandidate($, $(element), pageUrl, "rdfa");
    if (candidate) {
      candidates.push(candidate);
    }
  });
  return candidates;
}

function buildJsonLdCandidate(node: Record<string, unknown>, $: CheerioAPI, pageUrl: string): Candidate | null {
  const pageSignals = gatherPageSignals($);
  const recipe = {
    title: stringOrNull(node.name),
    description: stringOrNull(node.description),
    author: authorName(node.author),
    canonicalUrl: stringOrNull(node.url) ?? pageSignals.canonicalUrl ?? pageUrl,
    siteName: publisherName(node.publisher) ?? pageSignals.siteName,
    imageUrl: firstImageUrl(node.image),
    yieldText: firstString(node.recipeYield),
    prepTime: stringOrNull(node.prepTime),
    cookTime: stringOrNull(node.cookTime),
    totalTime: stringOrNull(node.totalTime),
    categories: toStringArray(node.recipeCategory),
    cuisine: firstString(node.recipeCuisine),
    keywords: toStringArray(node.keywords),
    nutrition: isRecord(node.nutrition) ? node.nutrition : null,
    ingredients: toStringEntries(node.recipeIngredient ?? node.ingredients).map(parseIngredientLine),
    steps: parseInstructionList(node.recipeInstructions),
  };

  if (recipe.ingredients.length < 1 || recipe.steps.length < 1) {
    return null;
  }

  return {
    method: "jsonld",
    extractionStrategy: "schema_structured",
    rawRecipe: node,
    recipe,
  };
}

function buildDomCandidate(
  $: CheerioAPI,
  root: Cheerio<Element>,
  pageUrl: string,
  method: "microdata" | "rdfa",
): Candidate | null {
  const scope = descendantsWithinScope($, root);
  const propertyAttribute = method === "microdata" ? "itemprop" : "property";
  const pageSignals = gatherPageSignals($);

  const ingredients = scope
    .filter((_, element) => {
      const name = getAttribute(element, propertyAttribute);
      return name === "recipeIngredient" || name === "ingredients";
    })
    .map((_, element) => nodeValue($, $(element)))
    .get()
    .flatMap(splitIngredientValue)
    .map(parseIngredientLine)
    .filter((ingredient) => ingredient.originalText.length > 0);

  const steps = parseInstructionNodes(
    $,
    scope.filter((_, element) => getAttribute(element, propertyAttribute) === "recipeInstructions"),
    method,
  );

  if (ingredients.length < 1 || steps.length < 1) {
    return null;
  }

  const rawRecipe: Record<string, unknown> = {
    name: nodeValue($, firstProperty(scope, propertyAttribute, "name")),
    description: nodeValue($, firstProperty(scope, propertyAttribute, "description")),
    author: nodeValue($, firstProperty(scope, propertyAttribute, "author")),
    url: nodeValue($, firstProperty(scope, propertyAttribute, "url")) ?? pageUrl,
    recipeYield: nodeValue($, firstProperty(scope, propertyAttribute, "recipeYield")),
    prepTime: nodeValue($, firstProperty(scope, propertyAttribute, "prepTime")),
    cookTime: nodeValue($, firstProperty(scope, propertyAttribute, "cookTime")),
    totalTime: nodeValue($, firstProperty(scope, propertyAttribute, "totalTime")),
    recipeIngredient: ingredients.map((ingredient) => ingredient.originalText),
    recipeInstructions: steps.map((step) => step.rawText),
  };

  return {
    method,
    extractionStrategy: "schema_structured",
    rawRecipe,
    recipe: {
      title: stringOrNull(rawRecipe.name),
      description: stringOrNull(rawRecipe.description),
      author: stringOrNull(rawRecipe.author),
      canonicalUrl: stringOrNull(rawRecipe.url) ?? pageSignals.canonicalUrl ?? pageUrl,
      siteName: pageSignals.siteName,
      imageUrl: pageSignals.imageUrl,
      yieldText: stringOrNull(rawRecipe.recipeYield),
      prepTime: stringOrNull(rawRecipe.prepTime),
      cookTime: stringOrNull(rawRecipe.cookTime),
      totalTime: stringOrNull(rawRecipe.totalTime),
      categories: [],
      cuisine: null,
      keywords: [],
      nutrition: null,
      ingredients,
      steps,
    },
  };
}

function buildVisibleDomRecipeCandidate(
  $: CheerioAPI,
  pageUrl: string,
  visibleSignals: { ingredients: string[]; steps: string[]; title: string | null },
): Candidate | null {
  if (visibleSignals.ingredients.length < 2 || visibleSignals.steps.length < 2) {
    return null;
  }

  const pageSignals = gatherPageSignals($);
  return {
    method: "dom",
    extractionStrategy: "dom_recipe_region",
    rawRecipe: {
      ingredients: visibleSignals.ingredients,
      steps: visibleSignals.steps,
    },
    recipe: {
      title: visibleSignals.title ?? pageSignals.pageTitle,
      description: null,
      author: null,
      canonicalUrl: pageSignals.canonicalUrl ?? pageUrl,
      siteName: pageSignals.siteName,
      imageUrl: pageSignals.imageUrl,
      yieldText: null,
      prepTime: null,
      cookTime: null,
      totalTime: null,
      categories: [],
      cuisine: null,
      keywords: [],
      nutrition: null,
      ingredients: visibleSignals.ingredients.map(parseIngredientLine),
      steps: visibleSignals.steps.map((step, index) => ({
        position: index + 1,
        rawText: step,
        text: normalizeWhitespace(step),
        section: null,
      })),
    },
  };
}

function pickBestCandidate(candidates: Candidate[], visibleSignals: { ingredients: string[]; steps: string[]; title: string | null }) {
  return [...candidates].sort((left, right) => scoreRecipeQuality(right.recipe, visibleSignals).score - scoreRecipeQuality(left.recipe, visibleSignals).score)[0] ?? null;
}

function parseInstructionNodes($: CheerioAPI, nodes: Cheerio<Element>, method: "microdata" | "rdfa"): ExtractedStep[] {
  const steps: ExtractedStep[] = [];
  const propertyAttribute = method === "microdata" ? "itemprop" : "property";

  nodes.each((_, element) => {
    const node = $(element);
    const text = nodeValue($, node);

    if (text) {
      for (const value of splitInstructionValue(text)) {
        steps.push({ position: steps.length + 1, rawText: value, text: normalizeWhitespace(value), section: null });
      }
      return;
    }

    node.find(`[${propertyAttribute}="text"]`).each((__, nestedElement) => {
      const nestedText = nodeValue($, $(nestedElement));
      if (!nestedText) {
        return;
      }
      steps.push({ position: steps.length + 1, rawText: nestedText, text: normalizeWhitespace(nestedText), section: null });
    });
  });

  return steps;
}

function parseInstructionList(input: unknown, currentSection: string | null = null): ExtractedStep[] {
  const steps: ExtractedStep[] = [];

  for (const value of toArray(input)) {
    if (typeof value === "string") {
      for (const part of splitInstructionValue(value)) {
        steps.push({ position: steps.length + 1, rawText: part, text: normalizeWhitespace(part), section: currentSection });
      }
      continue;
    }

    if (!isRecord(value)) {
      continue;
    }

    if (hasSchemaType(value, HOW_TO_SECTION_TYPE)) {
      const sectionName = stringOrNull(value.name) ?? currentSection;
      for (const step of parseInstructionList(value.itemListElement ?? value.recipeInstructions, sectionName)) {
        steps.push({ ...step, position: steps.length + 1 });
      }
      continue;
    }

    if (hasSchemaType(value, HOW_TO_STEP_TYPE)) {
      const repairedStep = repairHowToStep(value);
      if (repairedStep) {
        steps.push({ position: steps.length + 1, rawText: repairedStep, text: normalizeWhitespace(repairedStep), section: currentSection });
      }
      continue;
    }

    for (const step of parseInstructionList(value.text ?? value.itemListElement ?? value.name, currentSection)) {
      steps.push({ ...step, position: steps.length + 1 });
    }
  }

  return steps;
}

function repairHowToStep(step: Record<string, unknown>) {
  const stepText = stringOrNull(step.text);
  const stepName = stringOrNull(step.name);
  if (!stepText && !stepName) {
    return null;
  }
  if (!stepText) {
    return stepName;
  }
  if (!stepName) {
    return stepText;
  }

  const nameWord = normalizeWhitespace(stepName).split(/\s+/)[0]?.toLowerCase() ?? "";
  const firstTextWord = normalizeWhitespace(stepText).split(/\s+/)[0]?.toLowerCase() ?? "";
  if (IMPERATIVE_VERBS.has(nameWord) && FRAGMENTARY_STARTS.has(firstTextWord)) {
    return `${capitalize(nameWord)} ${stepText}`;
  }

  if (IMPERATIVE_VERBS.has(nameWord) && stepText.toLowerCase() !== stepName.toLowerCase()) {
    return `${capitalize(nameWord)} ${stepText}`;
  }

  return stepText;
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
      amountValue: null,
      amountMaxValue: null,
      unit: null,
      ingredientText: normalized || null,
      notes: null,
    };
  }

  const amountText = match[1].trim();
  const parsedAmount = parseAmountText(amountText);
  const remainder = match[2].trim();
  const parts = remainder.split(/\s*,\s*/);
  const mainPart = parts.shift() ?? remainder;
  const noteText = parts.length > 0 ? parts.join(", ") : null;
  const tokens = mainPart.split(/\s+/);
  const unit = normalizeUnit(tokens[0] ?? "");

  return {
    originalText: normalized,
    amountText,
    amountValue: parsedAmount.amountValue,
    amountMaxValue: parsedAmount.amountMaxValue,
    unit,
    ingredientText: unit ? tokens.slice(1).join(" ") || null : mainPart || null,
    notes: noteText,
  };
}

function normalizeUnit(token: string) {
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
    oz: "ounce",
    clove: "clove",
    cloves: "clove",
    can: "can",
    cans: "can",
    g: "gram",
    gram: "gram",
    grams: "gram",
    kg: "kilogram",
    ml: "milliliter",
    l: "liter",
    qt: "quart",
    pt: "pint",
    package: "package",
    packages: "package",
    pkg: "package",
    pinch: "pinch",
    pinches: "pinch",
  };
  return unitMap[cleaned] ?? null;
}

function parseAmountText(amountText: string) {
  const cleaned = amountText.replace(/\([^)]+\)/g, "").trim();
  const [lowerRaw, upperRaw] = cleaned.split(/\s*-\s*/, 2);
  return {
    amountValue: parseSingleAmount(lowerRaw ?? ""),
    amountMaxValue: upperRaw ? parseSingleAmount(upperRaw) : null,
  };
}

function parseSingleAmount(value: string) {
  const normalized = value
    .trim()
    .replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (fraction) => ` ${UNICODE_FRACTIONS[fraction] ?? ""} `)
    .replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  let total = 0;
  for (const part of normalized.split(" ")) {
    if (/^\d+\/\d+$/.test(part)) {
      const [numerator, denominator] = part.split("/").map(Number);
      if (!denominator) {
        return null;
      }
      total += numerator / denominator;
      continue;
    }
    const numeric = Number(part);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    total += numeric;
  }
  return total > 0 ? total : null;
}

function splitIngredientValue(value: string) {
  return preserveLines(value);
}

function splitInstructionValue(value: string) {
  const lines = preserveLines(value);
  return lines.length > 0 ? lines : [];
}

function preserveLines(value: string) {
  const raw = value.replace(/\r\n/g, "\n");
  const lines = raw
    .split(/\n+/)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
  if (lines.length > 1) {
    return lines;
  }
  const normalized = normalizeWhitespace(raw);
  return normalized ? [normalized] : [];
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
    bodyText.includes("recipe") ||
    titleText.includes("recipe");

  return { pageTitle, canonicalUrl, siteName, imageUrl, looksRecipeLike };
}

function gatherVisibleRecipeSignals($: CheerioAPI) {
  const title =
    normalizeWhitespace($("h1").first().text()) ||
    normalizeWhitespace($("[class*='recipe']").first().find("h1,h2").first().text()) ||
    null;
  const ingredients = collectSectionItems($, ["ingredients"]);
  const steps = collectSectionItems($, ["instructions", "directions", "method", "preparation"]);
  return { title, ingredients, steps };
}

function collectSectionItems($: CheerioAPI, headings: string[]) {
  const results: string[] = [];

  $("h1,h2,h3,h4,h5,h6").each((_, element) => {
    const headingText = normalizeWhitespace($(element).text()).toLowerCase();
    if (!headings.some((heading) => headingText.includes(heading))) {
      return;
    }

    const candidates = $(element).nextAll().slice(0, 6);
    candidates.each((__, sibling) => {
      const siblingNode = $(sibling);
      const tagName = sibling.tagName?.toLowerCase() ?? "";
      if (/^h[1-6]$/.test(tagName)) {
        return false;
      }
      if (tagName === "ul" || tagName === "ol") {
        siblingNode
          .find("li")
          .each((___, li) => pushUnique(results, normalizeWhitespace($(li).text())));
      } else {
        const blockLines = siblingNode
          .find("p,li")
          .map((___, child) => normalizeWhitespace($(child).text()))
          .get()
          .filter(Boolean);
        if (blockLines.length > 0) {
          blockLines.forEach((line) => pushUnique(results, line));
        } else {
          preserveLines(siblingNode.text()).forEach((line) => pushUnique(results, line));
        }
      }
    });
  });

  return results;
}

function scoreRecipeQuality(
  recipe: Omit<ExtractedRecipe, "sourceMethod" | "rawRecipe">,
  visibleSignals: { ingredients: string[]; steps: string[]; title: string | null },
) {
  const stepTexts = recipe.steps.map((step) => normalizeWhitespace(step.text)).filter(Boolean);
  const ingredientTexts = recipe.ingredients.map((ingredient) => ingredient.originalText).filter(Boolean);
  const averageStepLength =
    stepTexts.length > 0 ? Math.round(stepTexts.reduce((total, step) => total + step.length, 0) / stepTexts.length) : 0;
  const verbStartsRatio = ratio(
    stepTexts.filter((step) => IMPERATIVE_VERBS.has(firstWord(step))),
    stepTexts,
  );
  const fragmentaryStartsRatio = ratio(
    stepTexts.filter((step) => FRAGMENTARY_STARTS.has(firstWord(step))),
    stepTexts,
  );
  const duplicateStepsRatio = ratio(
    stepTexts.length - new Set(stepTexts.map((step) => step.toLowerCase())).size,
    stepTexts.length || 1,
  );
  const visibleAgreement = calculateVisibleAgreement(recipe, visibleSignals);
  const ingredientCompleteness = ratio(
    recipe.ingredients.filter((ingredient) => Boolean(ingredient.ingredientText ?? ingredient.originalText)),
    recipe.ingredients,
  );

  let score = 0;
  if (recipe.title) {
    score += 8;
  }
  if (recipe.title && recipe.title.length >= 6) {
    score += 4;
  }
  if (recipe.ingredients.length >= 2) {
    score += 16;
  }
  if (recipe.steps.length >= 2) {
    score += 18;
  }
  if (averageStepLength >= 35 && averageStepLength <= 260) {
    score += 10;
  }
  score += Math.round(ingredientCompleteness * 8);
  score += Math.round(verbStartsRatio * 12);
  score += Math.round(visibleAgreement * 14);
  score -= Math.round(fragmentaryStartsRatio * 18);
  score -= Math.round(duplicateStepsRatio * 16);
  if (recipe.imageUrl) {
    score += 2;
  }
  if (recipe.author) {
    score += 2;
  }
  if (recipe.yieldText) {
    score += 2;
  }
  if (recipe.totalTime || recipe.prepTime || recipe.cookTime) {
    score += 2;
  }

  return {
    score,
    signals: {
      titlePresent: Boolean(recipe.title),
      titleLooksPlausible: Boolean(recipe.title && recipe.title.length >= 6),
      ingredientCount: recipe.ingredients.length,
      stepCount: recipe.steps.length,
      averageStepLength,
      ingredientCompleteness,
      verbStartsRatio,
      fragmentaryStartsRatio,
      duplicateStepsRatio,
      visibleAgreement,
      looksRecipeLike: visibleSignals.ingredients.length > 0 || visibleSignals.steps.length > 0,
    } satisfies QualitySignals,
  };
}

function classifyConfidence(score: number | null): ExtractionConfidence {
  if (score === null || score <= 0) {
    return "none";
  }
  if (score >= 58) {
    return "high";
  }
  if (score >= 40) {
    return "medium";
  }
  return "low";
}

function calculateVisibleAgreement(
  recipe: Omit<ExtractedRecipe, "sourceMethod" | "rawRecipe">,
  visibleSignals: { ingredients: string[]; steps: string[]; title: string | null },
) {
  let matches = 0;
  let checks = 0;

  if (visibleSignals.title && recipe.title) {
    checks += 1;
    if (normalizeWhitespace(visibleSignals.title).toLowerCase().includes(normalizeWhitespace(recipe.title).toLowerCase()) ||
      normalizeWhitespace(recipe.title).toLowerCase().includes(normalizeWhitespace(visibleSignals.title).toLowerCase())) {
      matches += 1;
    }
  }

  if (visibleSignals.ingredients.length > 0) {
    checks += 1;
    const diff = Math.abs(visibleSignals.ingredients.length - recipe.ingredients.length);
    if (diff <= 2) {
      matches += 1;
    }
  }

  if (visibleSignals.steps.length > 0) {
    checks += 1;
    const diff = Math.abs(visibleSignals.steps.length - recipe.steps.length);
    if (diff <= 2) {
      matches += 1;
    }
  }

  return checks > 0 ? matches / checks : 0;
}

function sliceRecipeAnchorHtml(html: string) {
  const $ = load(html);
  const href = findRecipeAnchorHref($);
  if (!href || !href.startsWith("#") || href === "#") {
    return null;
  }
  const fragment = decodeFragmentIdentifier(href.slice(1));
  if (!fragment) {
    return null;
  }
  const target = $("[id]").filter((_, element) => $(element).attr("id") === fragment).first();
  if (!target.length) {
    return null;
  }

  const wrapper = load("<div></div>");
  wrapper("div").append(target.clone());
  return wrapper.html() ?? null;
}

function decodeFragmentIdentifier(value: string) {
  try {
    return decodeURIComponent(value).trim() || null;
  } catch {
    return null;
  }
}

function findRecipeAnchorHref($: CheerioAPI): string | null {
  let href: string | null = null;
  $("a,button").each((_, element) => {
    const text = normalizeWhitespace($(element).text()).toLowerCase();
    const candidateHref = $(element).attr("href") ?? $(element).attr("data-href") ?? null;
    if (RECIPE_LINK_LABELS.some((label) => text.includes(label)) || (candidateHref && candidateHref.toLowerCase().includes("#recipe"))) {
      href = candidateHref;
      return false;
    }
  });
  return href;
}

async function clickLikelyConsentButtons(page: { locator: (selector: string) => { allInnerTexts: () => Promise<string[]>; nth: (index: number) => { click: (opts?: { timeout?: number }) => Promise<void> } } }) {
  const buttonTexts = await page.locator("button").allInnerTexts().catch(() => []);
  for (const [index, text] of buttonTexts.entries()) {
    const normalized = normalizeWhitespace(text).toLowerCase();
    if (CONSENT_LABELS.some((label) => normalized === label || normalized.includes(label))) {
      await page.locator("button").nth(index).click({ timeout: 1000 }).catch(() => undefined);
    }
  }
}

async function clickLikelyRecipeLink(page: {
  locator: (selector: string) => {
    allInnerTexts: () => Promise<string[]>;
    nth: (index: number) => { click: (opts?: { timeout?: number }) => Promise<void> };
  };
}) {
  const linkTexts = await page.locator("a,button").allInnerTexts().catch(() => []);
  for (const [index, text] of linkTexts.entries()) {
    const normalized = normalizeWhitespace(text).toLowerCase();
    if (RECIPE_LINK_LABELS.some((label) => normalized.includes(label))) {
      await page.locator("a,button").nth(index).click({ timeout: 1500 }).catch(() => undefined);
      return;
    }
  }
}

function collectLinesFromHeadings(lines: string[], headings: string[]) {
  const collected: string[] = [];
  let active = false;
  for (const line of lines) {
    const normalized = normalizeWhitespace(line);
    const lower = normalized.toLowerCase();
    if (headings.some((heading) => lower === heading || lower.startsWith(`${heading}:`) || lower.includes(heading))) {
      active = true;
      continue;
    }
    if (active && lower.length < 40 && /ingredients|instructions|directions|method|notes|nutrition/.test(lower)) {
      break;
    }
    if (active && normalized) {
      pushUnique(collected, normalized.replace(/^\d+[.)]\s*/, ""));
    }
  }
  return collected;
}

function splitMultilineText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function descendantsWithinScope($: CheerioAPI, root: Cheerio<Element>) {
  return root.find("*").filter((_, element) => {
    const parentScopes = $(element).parents('[itemscope], [typeof]');
    const rootElement = root.get(0);
    if (!rootElement) {
      return false;
    }
    return parentScopes.get().every((scopeElement) => scopeElement === rootElement || !$(scopeElement).is('[itemscope], [typeof]'));
  });
}

function firstProperty(scope: Cheerio<Element>, attributeName: string, propertyName: string) {
  return scope.filter((_, element) => getAttribute(element, attributeName) === propertyName).first();
}

function getAttribute(element: Element, attributeName: string) {
  const attribute = element.attribs?.[attributeName];
  return attribute ? attribute.trim() : null;
}

function nodeValue($: CheerioAPI, node: Cheerio<Element>) {
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
  if (Array.isArray(input["@graph"])) {
    flattened.push(...input["@graph"].flatMap((entry) => flattenJsonLd(entry)));
  }
  if (input.mainEntity) {
    flattened.push(...flattenJsonLd(input.mainEntity));
  }
  if (input.itemListElement) {
    flattened.push(...flattenJsonLd(input.itemListElement));
  }
  return flattened;
}

function hasSchemaType(input: Record<string, unknown>, type: string) {
  return toStringArray(input["@type"]).map((value) => value.toLowerCase()).includes(type);
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
    return input.map((entry) => authorName(entry)).filter((value): value is string => Boolean(value)).join(", ") || null;
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

function stringOrNull(input: unknown) {
  return typeof input === "string" ? normalizeWhitespace(input) || null : null;
}

function firstString(input: unknown) {
  return toStringArray(input)[0] ?? null;
}

function toStringArray(input: unknown): string[] {
  if (typeof input === "string") {
    return input.split(",").map((value) => normalizeWhitespace(value)).filter(Boolean);
  }
  if (Array.isArray(input)) {
    return input.flatMap((entry) => toStringArray(entry));
  }
  if (isRecord(input) && typeof input.name === "string") {
    return [normalizeWhitespace(input.name)].filter(Boolean);
  }
  return [];
}

function toStringEntries(input: unknown): string[] {
  if (typeof input === "string") {
    const normalized = normalizeWhitespace(input);
    return normalized ? [normalized] : [];
  }
  if (Array.isArray(input)) {
    return input.flatMap((entry) => toStringEntries(entry));
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

function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function firstWord(input: string) {
  return normalizeWhitespace(input).split(/\s+/)[0]?.toLowerCase() ?? "";
}

function ratio(numerator: unknown[] | number, denominator: unknown[] | number) {
  const left = Array.isArray(numerator) ? numerator.length : numerator;
  const right = Array.isArray(denominator) ? denominator.length : denominator;
  return right > 0 ? left / right : 0;
}

function capitalize(input: string) {
  return input ? `${input[0]?.toUpperCase() ?? ""}${input.slice(1)}` : input;
}

function pushUnique(values: string[], candidate: string) {
  if (!candidate || values.includes(candidate)) {
    return;
  }
  values.push(candidate);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
