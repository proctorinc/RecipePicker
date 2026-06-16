import { after } from "next/server";
import { NextResponse } from "next/server";

import { runRecipeParseJobWorker } from "@/lib/server/recipe-parse-jobs";
import { runBackgroundJob, toErrorResponse, withRouteLogging } from "@/lib/server/logger";

export const maxDuration = 60;

export const POST = withRouteLogging(
  "api.recipe_parse_jobs.worker",
  async (request) => {
    const workerToken = request.headers.get("x-recipe-parse-job-token")?.trim() ?? "";
    const body = await request.json().catch(() => null) as { jobId?: unknown } | null;
    const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";

    if (!workerToken || !jobId) {
      return NextResponse.json({ message: "Invalid worker request." }, { status: 400 });
    }

    const result = await runRecipeParseJobWorker({
      jobId,
      workerToken,
    });

    if (result.status === "unauthorized") {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    if (result.status === "continued") {
      after(async () => {
        await runBackgroundJob({
          name: "background.recipe_parse_job",
          target: {
            jobId,
          },
          fn: async () =>
            runRecipeParseJobWorker({
              jobId,
              workerToken,
            }),
        });
      });
    }

    return NextResponse.json(result);
  },
  {
    onError: (error) => toErrorResponse(error, "Unable to process this parse job chunk."),
  },
);
