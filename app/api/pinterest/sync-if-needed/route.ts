import { after } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserAccess } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";
import {
  logInfo,
  logWarn,
  runBackgroundJob,
  toErrorResponse,
  withRouteLogging,
} from "@/lib/server/logger";
import {
  planPinterestAutoSync,
  runClaimedPinterestAutoSync,
} from "@/lib/server/sync";

export const POST = withRouteLogging(
  "api.pinterest_sync_if_needed",
  async () => {
    const [household, appAccess] = await Promise.all([
      requireHouseholdContext(),
      getCurrentUserAccess(),
    ]);
    const plan = await planPinterestAutoSync({
      householdId: household.householdId,
      subscriptionTier: appAccess.subscriptionTier,
    });

    if (plan.status === "claimed") {
      after(async () => {
        await runBackgroundJob({
          name: "background.pinterest_auto_sync",
          target: {
            householdId: household.householdId,
          },
          fn: async () =>
            runClaimedPinterestAutoSync({
              householdId: household.householdId,
            }),
        });
      });

      logInfo("pinterest.sync.claimed", {
        target: {
          householdId: household.householdId,
        },
      });
      return NextResponse.json({ status: "triggered" });
    }

    logWarn("pinterest.sync.skipped", {
      target: {
        householdId: household.householdId,
      },
      result: {
        status: plan.status,
      },
    });
    return NextResponse.json({ status: plan.status });
  },
  {
    onError: (error) => toErrorResponse(error, "Unable to evaluate Pinterest sync."),
  },
);
