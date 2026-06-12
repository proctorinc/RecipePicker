import { NextResponse } from "next/server";

import { requireHouseholdRole } from "@/lib/server/auth";
import { logAudit, withRouteLogging } from "@/lib/server/logger";
import { buildPinterestAuthorizeUrl, createPinterestOauthState } from "@/lib/server/pinterest";

export const GET = withRouteLogging("api.pinterest_connect", async (request: Request) => {
  const context = await requireHouseholdRole("owner");
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo");
  const safeReturnTo = returnTo?.startsWith("/settings") ? returnTo : "/settings";
  const state = await createPinterestOauthState({
    householdId: context.householdId,
    clerkUserId: context.clerkUserId,
    returnTo: safeReturnTo,
  });
  logAudit("pinterest.oauth.start", {
    target: {
      householdId: context.householdId,
      returnTo: safeReturnTo,
    },
  });

  return NextResponse.redirect(buildPinterestAuthorizeUrl(state));
});
