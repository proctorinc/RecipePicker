import type { GetStepTools } from "inngest";

import { inngest } from "@/src/inngest/client";
import { RECIPE_PARSE_JOB_REQUESTED_EVENT } from "@/src/inngest/events";
import { logInfo, runBackgroundJob } from "@/lib/server/logger";
import {
  markRecipeParseJobWorkflowFailure,
  processRecipeParseJobChunk,
} from "@/lib/server/recipe-parse-jobs";

type WorkflowStep = Pick<GetStepTools<typeof inngest>, "run">;

export async function runRecipeParseJobWorkflow(input: {
  jobId: string;
  householdId: string;
  step: WorkflowStep;
}) {
  let chunkNumber = 1;

  while (true) {
    logInfo("recipe_parse_job.workflow_chunk_requested", {
      target: {
        householdId: input.householdId,
        jobId: input.jobId,
      },
      chunkNumber,
    });

    const result = await input.step.run(`chunk-${chunkNumber}`, () =>
      processRecipeParseJobChunk({
        jobId: input.jobId,
      }));

    logInfo("recipe_parse_job.workflow_chunk_completed", {
      target: {
        householdId: input.householdId,
        jobId: input.jobId,
      },
      chunkNumber,
      result,
    });

    if (result.status === "continued") {
      chunkNumber += 1;
      continue;
    }

    return result;
  }
}

export const recipeParseJobRunner = inngest.createFunction(
  {
    id: "recipe-parse-job-runner",
    triggers: { event: RECIPE_PARSE_JOB_REQUESTED_EVENT },
    concurrency: {
      limit: 1,
      key: "event.data.householdId",
    },
  },
  async ({ event, step }) => {
    try {
      return await runBackgroundJob({
        name: "background.recipe_parse_job",
        target: {
          householdId: event.data.householdId,
          jobId: event.data.jobId,
        },
        fn: async () => runRecipeParseJobWorkflow({
          jobId: event.data.jobId,
          householdId: event.data.householdId,
          step,
        }),
      });
    } catch (error) {
      await markRecipeParseJobWorkflowFailure({
        jobId: event.data.jobId,
        error,
      });
      throw error;
    }
  },
);
