import { redirect } from "next/navigation";

import { requireHouseholdRole } from "@/lib/server/auth";
import { buildPinterestAuthorizeUrl, createPinterestOauthState } from "@/lib/server/pinterest";

export async function GET(request: Request) {
  const context = await requireHouseholdRole("owner");
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo");
  const state = await createPinterestOauthState({
    householdId: context.householdId,
    clerkUserId: context.clerkUserId,
    returnTo: returnTo?.startsWith("/settings") ? returnTo : "/settings",
  });

  redirect(buildPinterestAuthorizeUrl(state));
}
