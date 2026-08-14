import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getCurrentUserAccess } from "@/lib/server/access";
import { getHouseholdMembership } from "@/lib/server/auth";
import { logAudit, logError, logWarn, withRouteLogging } from "@/lib/server/logger";
import { consumePinterestOauthState, exchangePinterestCode, upsertPinterestConnection } from "@/lib/server/pinterest";
import { updateRequestContext } from "@/lib/server/request-context";

const OAUTH_ERROR_REDIRECT = "/settings/pinterest?oauthError=";
const GENERIC_OAUTH_ERROR =
  "Pinterest could not complete the connection. Please try again.";

export const GET = withRouteLogging("api.pinterest_callback", async (request: Request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const { userId } = await auth();

  if (!userId) {
    logWarn("pinterest.oauth.authentication_required");
    return NextResponse.redirect(new URL("/sign-in", url.origin));
  }

  updateRequestContext({
    actor: {
      clerkUserId: userId,
    },
  });

  if (error) {
    logWarn("pinterest.oauth.callback_failed", {
      result: {
        reason: error,
      },
    });
    return NextResponse.redirect(
      new URL(`${OAUTH_ERROR_REDIRECT}${encodeURIComponent(GENERIC_OAUTH_ERROR)}`, url.origin),
    );
  }

  if (!state || !code) {
    logWarn("pinterest.oauth.callback_failed", {
      result: {
        reason: "missing_oauth_response",
      },
    });
    return NextResponse.redirect(
      new URL(`${OAUTH_ERROR_REDIRECT}${encodeURIComponent(GENERIC_OAUTH_ERROR)}`, url.origin),
    );
  }

  let callbackStage = "consume_state";

  try {
    const oauthState = await consumePinterestOauthState(state);

    if (oauthState.clerkUserId !== userId) {
      logWarn("pinterest.oauth.state_mismatch");
      return NextResponse.redirect(
        new URL(`${OAUTH_ERROR_REDIRECT}${encodeURIComponent(GENERIC_OAUTH_ERROR)}`, url.origin),
      );
    }

    updateRequestContext({
      actor: {
        clerkUserId: userId,
        householdId: oauthState.householdId,
      },
    });
    const [access, membership] = await Promise.all([
      getCurrentUserAccess(),
      getHouseholdMembership({
        householdId: oauthState.householdId,
        clerkUserId: userId,
      }),
    ]);

    if (membership?.role !== "owner" && !access.isActualAdmin) {
      logWarn("pinterest.oauth.authorization_denied", {
        target: {
          householdId: oauthState.householdId,
        },
      });
      return NextResponse.redirect(
        new URL(`${OAUTH_ERROR_REDIRECT}${encodeURIComponent(GENERIC_OAUTH_ERROR)}`, url.origin),
      );
    }

    callbackStage = "exchange_code";
    const token = await exchangePinterestCode(code);
    callbackStage = "save_connection";
    await upsertPinterestConnection({
      householdId: oauthState.householdId,
      connectedByClerkUserId: userId,
      token,
    });
    logAudit("pinterest.oauth.callback_succeeded", {
      target: {
        householdId: oauthState.householdId,
      },
    });

    return NextResponse.redirect(new URL(oauthState.returnTo ?? "/settings", url.origin));
  } catch (callbackError) {
    logError("pinterest.oauth.callback_failed", callbackError, {
      result: {
        reason: "callback_error",
        stage: callbackStage,
      },
    });
    return NextResponse.redirect(
      new URL(`${OAUTH_ERROR_REDIRECT}${encodeURIComponent(GENERIC_OAUTH_ERROR)}`, url.origin),
    );
  }
});
