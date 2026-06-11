import { after } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserAccess } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";
import {
  planPinterestAutoSync,
  runClaimedPinterestAutoSync,
} from "@/lib/server/sync";

export async function POST() {
  try {
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
        try {
          await runClaimedPinterestAutoSync({
            householdId: household.householdId,
          });
        } catch (error) {
          console.error(
            `Background Pinterest sync failed for household ${household.householdId}`,
            error,
          );
        }
      });

      return NextResponse.json({ status: "triggered" });
    }

    return NextResponse.json({ status: plan.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to evaluate Pinterest sync.";
    return NextResponse.json(
      { status: "error", message },
      { status: 500 },
    );
  }
}
