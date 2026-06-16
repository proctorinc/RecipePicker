import { NextResponse } from "next/server";

import { requireHouseholdContext } from "@/lib/server/auth";
import { cancelRecipeParseJob } from "@/lib/server/recipe-parse-jobs";
import { toErrorResponse, withRouteLogging } from "@/lib/server/logger";

export const POST = withRouteLogging(
  "api.recipe_parse_jobs.cancel",
  async (_request, context: { params: Promise<{ jobId: string }> }) => {
    const household = await requireHouseholdContext();
    const { jobId } = await context.params;
    const result = await cancelRecipeParseJob({
      householdId: household.householdId,
      jobId,
    });

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 409 });
    }

    return NextResponse.json({ status: "ok", message: result.message });
  },
  {
    onError: (error) => toErrorResponse(error, "Unable to cancel this parse job."),
  },
);
