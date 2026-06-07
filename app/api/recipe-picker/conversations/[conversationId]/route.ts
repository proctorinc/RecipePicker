import { NextResponse } from "next/server";

import { requireHouseholdContext } from "@/lib/server/auth";
import { getRecipePickerConversationState } from "@/lib/server/recipe-picker";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await params;
    const context = await requireHouseholdContext();
    const response = await getRecipePickerConversationState({
      householdId: context.householdId,
      clerkUserId: context.clerkUserId,
      conversationId,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    return NextResponse.json({ message: "Unable to load recipe picker conversation." }, { status: 500 });
  }
}
