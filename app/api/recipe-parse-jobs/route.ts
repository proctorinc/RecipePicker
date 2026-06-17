import { NextResponse } from "next/server";

import { requireHouseholdContext } from "@/lib/server/auth";
import { getRecipeParseJobSummaries } from "@/lib/server/queries";
import {
  createRecipeParseJob,
  markRecipeParseJobQueueingFailure,
} from "@/lib/server/recipe-parse-jobs";
import { sendRecipeParseJobRequestedEvent } from "@/src/inngest/events";
import {
  logInfo,
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

    try {
      await sendRecipeParseJobRequestedEvent({
        jobId: result.jobId,
        householdId: context.householdId,
        trigger: "create",
      });
    } catch (error) {
      await markRecipeParseJobQueueingFailure({
        jobId: result.jobId,
        error,
      });
      throw error;
    }

    logInfo("recipe_parse_job.create_request_accepted", {
      target: {
        householdId: context.householdId,
        jobId: result.jobId,
      },
      totalRecipes: result.totalRecipes,
      result: {
        status: "accepted",
      },
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
