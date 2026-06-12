import { NextResponse } from "next/server";

import { requirePremiumSubscription } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";
import { toErrorResponse, withRouteLogging } from "@/lib/server/logger";
import { createRecipePickerConversation } from "@/lib/server/recipe-picker";

export const POST = withRouteLogging(
  "api.recipe_picker_conversations.create",
  async () => {
    const [context] = await Promise.all([
      requireHouseholdContext(),
      requirePremiumSubscription(),
    ]);
    const response = await createRecipePickerConversation({
      householdId: context.householdId,
      clerkUserId: context.clerkUserId,
    });

    return NextResponse.json(response);
  },
  {
    onError: (error) =>
      toErrorResponse(error, "Unable to create a new recipe picker conversation."),
  },
);
