import { NextResponse } from "next/server";

import { requireHouseholdContext } from "@/lib/server/auth";
import { getRecipeParseJobDetail } from "@/lib/server/queries";
import { toErrorResponse, withRouteLogging } from "@/lib/server/logger";

export const GET = withRouteLogging(
  "api.recipe_parse_jobs.detail",
  async (_request, context: { params: Promise<{ jobId: string }> }) => {
    await requireHouseholdContext();
    const { jobId } = await context.params;
    const job = await getRecipeParseJobDetail(jobId);

    if (!job) {
      return NextResponse.json({ message: "Parse job not found." }, { status: 404 });
    }

    return NextResponse.json({ job });
  },
  {
    onError: (error) => toErrorResponse(error, "Unable to load this parse job."),
  },
);
