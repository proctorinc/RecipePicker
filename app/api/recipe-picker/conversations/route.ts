import { NextResponse } from "next/server";

import { requireHouseholdContext } from "@/lib/server/auth";
import { createRecipePickerConversation } from "@/lib/server/recipe-picker";

export async function POST() {
  try {
    const context = await requireHouseholdContext();
    const response = await createRecipePickerConversation({
      householdId: context.householdId,
      clerkUserId: context.clerkUserId,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    return NextResponse.json({ message: "Unable to create a new recipe picker conversation." }, { status: 500 });
  }
}
