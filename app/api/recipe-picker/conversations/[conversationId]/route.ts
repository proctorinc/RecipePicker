import { NextResponse } from "next/server";

import { requirePremiumSubscription } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";
import { toErrorResponse, withRouteLogging } from "@/lib/server/logger";
import { getRecipePickerConversationState } from "@/lib/server/recipe-picker";

export const GET = withRouteLogging(
  "api.recipe_picker_conversations.get",
  async (
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) => {
    const { conversationId } = await params;
    const [context] = await Promise.all([
      requireHouseholdContext(),
      requirePremiumSubscription(),
    ]);
    const response = await getRecipePickerConversationState({
      householdId: context.householdId,
      clerkUserId: context.clerkUserId,
      conversationId,
    });

    return NextResponse.json(response);
  },
  {
    onError: (error) =>
      toErrorResponse(error, "Unable to load recipe picker conversation."),
  },
);
