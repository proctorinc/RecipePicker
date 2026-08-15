import { NextRequest, NextResponse } from "next/server";

import { searchCanonicalIngredients } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const kind = request.nextUrl.searchParams.get("kind");
  const items = await searchCanonicalIngredients(query);
  return NextResponse.json({ items: kind === "family" ? items.filter((item) => item.ingredientKind === "family") : items });
}
