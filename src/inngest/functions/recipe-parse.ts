import type { GetStepTools } from "inngest";

import { inngest } from "@/src/inngest/client";
import { RECIPE_PARSE_JOB_REQUESTED_EVENT } from "@/src/inngest/events";
import { logInfo, runBackgroundJob } from "@/lib/server/logger";
import {
  markRecipeParseJobWorkflowFailure,
  findStalledRecipeParseJobs,
  processRecipeParseJobChunk,
} from "@/lib/server/recipe-parse-jobs";

type WorkflowStep = Pick<GetStepTools<typeof inngest>, "run" | "sleep">;

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

    if (result.status === "busy") {
      await input.step.sleep(`wait-${chunkNumber}`, "30s");
      chunkNumber += 1;
      continue;
    }

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
    // Give each extraction chunk its own serverless request budget.
    checkpointing: false,
    onFailure: async ({ event, error }) => {
      await markRecipeParseJobWorkflowFailure({ jobId: event.data.event.data.jobId, error });
    },
    triggers: { event: RECIPE_PARSE_JOB_REQUESTED_EVENT },
    concurrency: {
      limit: 1,
      key: "event.data.householdId",
    },
  },
  async ({ event, step }) => {
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
  },
);

export const recipeParseJobRecovery = inngest.createFunction(
  { id: "recipe-parse-job-recovery", triggers: { cron: "*/5 * * * *" }, concurrency: 1 },
  async ({ step }) => {
    const jobs = await step.run("find-stalled-jobs", () => findStalledRecipeParseJobs());
    if (jobs.length === 0) return { recovered: 0 };
    await step.sendEvent("recover-stalled-jobs", jobs.map((job) => ({
      id: `recipe-parse-recovery-${job.jobId}-${Math.floor(Date.now() / 300_000)}`,
      name: RECIPE_PARSE_JOB_REQUESTED_EVENT,
      data: { ...job, trigger: "resume" as const },
    })));
    return { recovered: jobs.length };
  },
);
