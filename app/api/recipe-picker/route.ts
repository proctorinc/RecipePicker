import { NextResponse } from "next/server";
import { z } from "zod";

import { requireHouseholdContext } from "@/lib/server/auth";
import { runRecipePicker } from "@/lib/server/recipe-picker";

const requestSchema = z.object({
  mode: z.enum(["v1", "v2"]),
  prompt: z.string(),
  conversationId: z.string().nullable().optional(),
  currentSetRecipeIds: z.array(z.string()),
  pinnedRecipeIds: z.array(z.string()),
  activeRecipeId: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = requestSchema.parse(json);
    const context = await requireHouseholdContext();
    const response = await runRecipePicker({
      householdId: context.householdId,
      clerkUserId: context.clerkUserId,
      request: parsed,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Invalid recipe picker request." }, { status: 400 });
    }

    if (error instanceof Error && error.message.includes("Authentication required")) {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    return NextResponse.json({ message: "Unable to load recipes for the picker." }, { status: 500 });
  }
}
