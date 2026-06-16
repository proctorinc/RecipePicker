import { after } from "next/server";
import { NextResponse } from "next/server";

import { requireHouseholdContext } from "@/lib/server/auth";
import { getRecipeParseJobSummaries } from "@/lib/server/queries";
import {
  createRecipeParseJob,
  runRecipeParseJobWorker,
} from "@/lib/server/recipe-parse-jobs";
import {
  runBackgroundJob,
  toErrorResponse,
  withRouteLogging,
} from "@/lib/server/logger";

export const GET = withRouteLogging(
  "api.recipe_parse_jobs.list",
  async () => {
    await requireHouseholdContext();
    const jobs = await getRecipeParseJobSummaries();
    return NextResponse.json({ jobs });
  },
  {
    onError: (error) => toErrorResponse(error, "Unable to load parse jobs."),
  },
);

export const POST = withRouteLogging(
  "api.recipe_parse_jobs.create",
  async (request) => {
    const context = await requireHouseholdContext();
    const body = await request.json().catch(() => null) as
      | { recipeIds?: unknown; rerun?: unknown; filters?: Record<string, unknown> | null }
      | null;

    const recipeIds = Array.isArray(body?.recipeIds)
      ? body.recipeIds.filter((value): value is string => typeof value === "string")
      : [];
    const rerun = body?.rerun === false ? false : true;
    const result = await createRecipeParseJob({
      householdId: context.householdId,
      requestedByClerkUserId: context.clerkUserId,
      recipeIds,
      rerun,
      filters: body?.filters ?? null,
      mode: "bulk_rerun_selection",
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          message: result.message,
          activeJobId: result.activeJobId ?? null,
        },
        { status: 409 },
      );
    }

    after(async () => {
      await runBackgroundJob({
        name: "background.recipe_parse_job",
        target: {
          householdId: context.householdId,
          jobId: result.jobId,
        },
        fn: async () =>
          runRecipeParseJobWorker({
            jobId: result.jobId,
            workerToken: result.workerToken,
          }),
      });
    });

    return NextResponse.json(
      {
        jobId: result.jobId,
        totalRecipes: result.totalRecipes,
        status: result.status,
        createdAt: result.createdAt,
      },
      { status: 202 },
    );
  },
  {
    onError: (error) => toErrorResponse(error, "Unable to create a parse job."),
  },
);
