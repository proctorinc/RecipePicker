import { NextResponse } from "next/server";
import { z } from "zod";

import {
  requirePremiumSubscription,
} from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";
import { logInfo, toErrorResponse, withRouteLogging } from "@/lib/server/logger";
import { runRecipePicker } from "@/lib/server/recipe-picker";

const requestSchema = z.object({
  mode: z.enum(["v1", "v2"]),
  prompt: z.string(),
  conversationId: z.string().nullable().optional(),
  currentSetRecipeIds: z.array(z.string()),
  pinnedRecipeIds: z.array(z.string()),
  activeRecipeId: z.string().nullable().optional(),
});

export const POST = withRouteLogging(
  "api.recipe_picker",
  async (request: Request) => {
    const json = await request.json();
    const parsed = requestSchema.parse(json);
    const [context] = await Promise.all([
      requireHouseholdContext(),
      requirePremiumSubscription(),
    ]);
    logInfo("recipe_picker.requested", {
      target: {
        conversationId: parsed.conversationId ?? null,
      },
      result: {
        mode: parsed.mode,
        currentSetCount: parsed.currentSetRecipeIds.length,
        pinnedCount: parsed.pinnedRecipeIds.length,
        hasActiveRecipe: Boolean(parsed.activeRecipeId),
      },
    });
    const response = await runRecipePicker({
      householdId: context.householdId,
      clerkUserId: context.clerkUserId,
      request: parsed,
    });

    return NextResponse.json(response);
  },
  {
    onError: (error) =>
      toErrorResponse(
        error,
        error instanceof z.ZodError
          ? "Invalid recipe picker request."
          : "Unable to load recipes for the picker.",
      ),
  },
);
