import { createId } from "@paralleldrive/cuid2";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { z, type ZodTypeAny } from "zod";

import { requireOwnerOrAdminIntegrationAccess } from "@/lib/server/access";
import { openDatabase } from "@/lib/server/database";
import {
  householdAiConnections,
  type householdAiConnections as householdAiConnectionsTable,
} from "@/lib/server/db";
import { AuthorizationError } from "@/lib/server/errors";
import { logError } from "@/lib/server/logger";
import { decryptSecret, encryptSecret } from "@/lib/server/security";

export type AiProvider = "openai" | "anthropic" | "google" | "openrouter";
export type AiConnectionStatus =
  | "not_connected"
  | "active"
  | "test_failed"
  | "invalid";

export type AiModelOption = {
  id: string;
  label: string;
  description: string;
};

export type AiConnectionSummary = {
  status: AiConnectionStatus;
  provider: AiProvider | null;
  providerLabel: string | null;
  model: string | null;
  modelLabel: string | null;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  connectedByClerkUserId: string | null;
};

type ConnectionRow = typeof householdAiConnectionsTable.$inferSelect;

type StoredAiConfig = {
  provider: AiProvider;
  model: string;
  apiKey: string;
};

type StructuredGenerationArgs<TSchema extends ZodTypeAny> = {
  householdId: string;
  prompt: string;
  schema: TSchema;
  signal?: AbortSignal;
};

const AI_MODEL_CATALOG: Record<AiProvider, AiModelOption[]> = {
  openai: [
    {
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      description: "Fast and cost-efficient for structured parsing.",
    },
    {
      id: "gpt-4.1",
      label: "GPT-4.1",
      description: "Higher-quality parsing when you want extra accuracy.",
    },
  ],
  anthropic: [
    {
      id: "claude-3-5-sonnet-latest",
      label: "Claude 3.5 Sonnet",
      description: "Balanced quality and speed for extraction work.",
    },
    {
      id: "claude-3-7-sonnet-latest",
      label: "Claude 3.7 Sonnet",
      description: "Higher-quality reasoning for trickier recipe pages.",
    },
  ],
  google: [
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      description: "Fast structured parsing for routine imports.",
    },
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      description: "More capable parsing for harder extractions.",
    },
  ],
  openrouter: [
    {
      id: "openai/gpt-4o-mini",
      label: "OpenRouter · GPT-4o mini",
      description: "Reliable low-cost routed option.",
    },
    {
      id: "anthropic/claude-3.5-sonnet",
      label: "OpenRouter · Claude 3.5 Sonnet",
      description: "Balanced routed option for recipe parsing.",
    },
  ],
};

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  openrouter: "OpenRouter",
};

const TEST_SCHEMA = z.object({
  ok: z.boolean(),
  provider: z.string(),
  model: z.string(),
});

export function getAiModelCatalog() {
  return AI_MODEL_CATALOG;
}

export async function getHouseholdAiConnectionSummary(
  householdId: string,
): Promise<AiConnectionSummary> {
  const { household, access } = await requireOwnerOrAdminIntegrationAccess();

  if (household.householdId !== householdId && !access.isActualAdmin) {
    throw new AuthorizationError(
      "You do not have permission to view this integration.",
    );
  }

  return readHouseholdAiConnectionSummary(householdId);
}

export async function getHouseholdAiConnectionStatus(householdId: string) {
  const summary = await readHouseholdAiConnectionSummary(householdId);
  return summary.status;
}

async function readHouseholdAiConnectionSummary(
  householdId: string,
): Promise<AiConnectionSummary> {
  const { db, sqlite } = await openDatabase();

  try {
    const connection = await db.query.householdAiConnections.findFirst({
      where: (table, { eq }) => eq(table.householdId, householdId),
    });

    if (!connection) {
      return {
        status: "not_connected",
        provider: null,
        providerLabel: null,
        model: null,
        modelLabel: null,
        lastTestedAt: null,
        lastTestStatus: null,
        lastTestError: null,
        connectedByClerkUserId: null,
      };
    }

    const provider = isAiProvider(connection.provider) ? connection.provider : null;
    const modelOption = provider ? getModelOption(provider, connection.model) : null;

    return {
      status: toConnectionStatus(connection.connectionStatus),
      provider,
      providerLabel: provider ? PROVIDER_LABELS[provider] : connection.provider,
      model: connection.model,
      modelLabel: modelOption?.label ?? connection.model,
      lastTestedAt: connection.lastTestedAt,
      lastTestStatus: connection.lastTestStatus,
      lastTestError: connection.lastTestError,
      connectedByClerkUserId: connection.connectedByClerkUserId,
    };
  } finally {
    await sqlite.close();
  }
}

export async function upsertHouseholdAiConnection(args: {
  householdId: string;
  connectedByClerkUserId: string;
  provider: AiProvider;
  model: string;
  apiKey: string;
  connectionStatus: Exclude<AiConnectionStatus, "not_connected">;
  lastTestStatus: string;
  lastTestError: string | null;
}) {
  validateProviderModel(args.provider, args.model);

  const { db, sqlite } = await openDatabase();

  try {
    const now = new Date().toISOString();
    const values = {
      aiConnectionId: `ai:${args.householdId}`,
      householdId: args.householdId,
      provider: args.provider,
      model: args.model,
      apiKeyEncrypted: encryptSecret(args.apiKey),
      connectedByClerkUserId: args.connectedByClerkUserId,
      connectionStatus: args.connectionStatus,
      lastTestedAt: now,
      lastTestStatus: args.lastTestStatus,
      lastTestError: args.lastTestError,
      createdAt: now,
      updatedAt: now,
    } satisfies ConnectionRow;

    await db.insert(householdAiConnections)
      .values(values)
      .onConflictDoUpdate({
        target: [householdAiConnections.householdId],
        set: {
          provider: values.provider,
          model: values.model,
          apiKeyEncrypted: values.apiKeyEncrypted,
          connectedByClerkUserId: values.connectedByClerkUserId,
          connectionStatus: values.connectionStatus,
          lastTestedAt: values.lastTestedAt,
          lastTestStatus: values.lastTestStatus,
          lastTestError: values.lastTestError,
          updatedAt: values.updatedAt,
        },
      })
      .run();
  } finally {
    await sqlite.close();
  }
}

export async function disconnectHouseholdAiConnection(householdId: string) {
  const { db, sqlite } = await openDatabase();

  try {
    await db.delete(householdAiConnections)
      .where(eq(householdAiConnections.householdId, householdId))
      .run();
  } finally {
    await sqlite.close();
  }
}

export async function testHouseholdAiConnection(args: {
  provider: AiProvider;
  model: string;
  apiKey: string;
}) {
  try {
    validateProviderModel(args.provider, args.model);
  } catch (error) {
    return {
      ok: false,
      status: "invalid" as const,
      error: error instanceof Error ? error.message : "The AI provider or model is invalid.",
    };
  }

  try {
    const { object } = await generateObject({
      model: getLanguageModel(args.provider, args.model, args.apiKey),
      schema: TEST_SCHEMA,
      prompt: [
        "Return a valid object that confirms the connection works.",
        "Set ok to true.",
        `Provider: ${args.provider}`,
        `Model: ${args.model}`,
      ].join("\n"),
    });

    if (!object.ok) {
      return {
        ok: false,
        status: "test_failed" as const,
        error: "The provider returned an unexpected test payload.",
      };
    }

    return {
      ok: true,
      status: "active" as const,
      error: null,
    };
  } catch (error) {
    logError("ai.connection_test_failed", error, {
      target: {
        provider: args.provider,
        model: args.model,
      },
    });
    return {
      ok: false,
      status: "test_failed" as const,
      error: "Unable to validate the AI connection. Check the provider, model, and API key, then try again.",
    };
  }
}

export async function generateRecipeExtractionWithHouseholdAi<
  TSchema extends ZodTypeAny,
>(args: StructuredGenerationArgs<TSchema>) {
  return generateHouseholdAiObject(args);
}

export async function generateRecipePickerWithHouseholdAi<
  TSchema extends ZodTypeAny,
>(args: StructuredGenerationArgs<TSchema>) {
  return generateHouseholdAiObject(args);
}

export async function generateIngredientSuggestionsWithHouseholdAi<
  TSchema extends ZodTypeAny,
>(args: StructuredGenerationArgs<TSchema>) {
  return generateHouseholdAiObject(args);
}

export async function getStoredHouseholdAiConfig(
  householdId: string,
): Promise<StoredAiConfig | null> {
  const { db, sqlite } = await openDatabase();

  try {
    const connection = await db.query.householdAiConnections.findFirst({
      where: (table, { eq }) => eq(table.householdId, householdId),
    });

    if (!connection || connection.connectionStatus !== "active") {
      return null;
    }

    if (!isAiProvider(connection.provider)) {
      return null;
    }

    return {
      provider: connection.provider,
      model: connection.model,
      apiKey: decryptSecret(connection.apiKeyEncrypted),
    };
  } finally {
    await sqlite.close();
  }
}

export async function getStoredHouseholdAiKey(householdId: string) {
  const { db, sqlite } = await openDatabase();

  try {
    const connection = await db.query.householdAiConnections.findFirst({
      where: (table, { eq }) => eq(table.householdId, householdId),
      columns: {
        apiKeyEncrypted: true,
      },
    });

    return connection ? decryptSecret(connection.apiKeyEncrypted) : null;
  } finally {
    await sqlite.close();
  }
}

async function generateHouseholdAiObject<TSchema extends ZodTypeAny>({
  householdId,
  prompt,
  schema,
  signal,
}: StructuredGenerationArgs<TSchema>): Promise<z.infer<TSchema> | null> {
  const config = await getStoredHouseholdAiConfig(householdId);

  if (!config) {
    return null;
  }

  try {
    const { object } = await generateObject({
      model: getLanguageModel(config.provider, config.model, config.apiKey),
      schema,
      prompt,
      abortSignal: signal,
    });

    return object as z.infer<TSchema>;
  } catch {
    return null;
  }
}

function getLanguageModel(provider: AiProvider, model: string, apiKey: string) {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(model);
    case "openrouter":
      return createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        headers: {
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
          "X-Title": "Food Picker",
        },
      })(model);
  }
}

function validateProviderModel(provider: AiProvider, model: string) {
  if (!getModelOption(provider, model)) {
    throw new Error("Choose a supported AI model for the selected provider.");
  }
}

function getModelOption(provider: AiProvider, model: string) {
  return AI_MODEL_CATALOG[provider].find((option) => option.id === model) ?? null;
}

function isAiProvider(value: string): value is AiProvider {
  return value === "openai" || value === "anthropic" || value === "google" || value === "openrouter";
}

function toConnectionStatus(value: string): AiConnectionStatus {
  if (value === "active" || value === "test_failed" || value === "invalid") {
    return value;
  }

  return "invalid";
}
