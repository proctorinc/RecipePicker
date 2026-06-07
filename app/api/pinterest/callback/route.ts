import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { consumePinterestOauthState, exchangePinterestCode, upsertPinterestConnection } from "@/lib/server/pinterest";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", url.origin));
  }

  if (error) {
    const message = errorDescription ? `${error}: ${errorDescription}` : error;
    return NextResponse.redirect(new URL(`/settings?oauthError=${encodeURIComponent(message)}`, url.origin));
  }

  if (!state || !code) {
    return NextResponse.redirect(new URL("/settings?oauthError=Missing%20OAuth%20response", url.origin));
  }

  try {
    const oauthState = await consumePinterestOauthState(state);

    if (oauthState.clerkUserId !== userId) {
      return NextResponse.redirect(new URL("/settings?oauthError=OAuth%20state%20mismatch", url.origin));
    }

    const token = await exchangePinterestCode(code);
    await upsertPinterestConnection({
      householdId: oauthState.householdId,
      connectedByClerkUserId: userId,
      token,
    });

    return NextResponse.redirect(new URL(oauthState.returnTo ?? "/settings", url.origin));
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : String(callbackError);
    return NextResponse.redirect(new URL(`/settings?oauthError=${encodeURIComponent(message)}`, url.origin));
  }
}
