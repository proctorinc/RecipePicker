import { NextResponse } from "next/server";

import { getCurrentUserAccess } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";
import {
  logInfo,
  logWarn,
  toErrorResponse,
  withRouteLogging,
} from "@/lib/server/logger";
import {
  planPinterestAutoSync,
  queuePinterestSync,
} from "@/lib/server/sync";
import { sendPinterestSyncRequestedEvent } from "@/src/inngest/events";

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
      const job = await queuePinterestSync({ householdId: household.householdId, trigger: "auto_feed_load", alreadyClaimed: true });
      await sendPinterestSyncRequestedEvent({ jobId: job.jobId, householdId: household.householdId });

      logInfo("pinterest.sync.claimed", {
        target: {
          householdId: household.householdId,
        },
      });
      return NextResponse.json({ status: "triggered", syncRunId: job.syncRunId });
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
