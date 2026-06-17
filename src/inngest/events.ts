import { inngest } from "@/src/inngest/client";
import { logError, logInfo } from "@/lib/server/logger";

export const RECIPE_PARSE_JOB_REQUESTED_EVENT = "app/recipe-parse-job.requested" as const;

export type RecipeParseJobRequestedTrigger = "create" | "resume";

export type RecipeParseJobRequestedPayload = {
  jobId: string;
  householdId: string;
  trigger: RecipeParseJobRequestedTrigger;
};

export async function sendRecipeParseJobRequestedEvent(
  payload: RecipeParseJobRequestedPayload,
) {
  logInfo("recipe_parse_job.queue_requested", {
    target: {
      householdId: payload.householdId,
      jobId: payload.jobId,
    },
    trigger: payload.trigger,
    eventName: RECIPE_PARSE_JOB_REQUESTED_EVENT,
  });

  try {
    const result = await inngest.send({
      name: RECIPE_PARSE_JOB_REQUESTED_EVENT,
      data: payload,
    });

    logInfo("recipe_parse_job.queue_completed", {
      target: {
        householdId: payload.householdId,
        jobId: payload.jobId,
      },
      trigger: payload.trigger,
      eventName: RECIPE_PARSE_JOB_REQUESTED_EVENT,
      result: {
        status: "success",
      },
    });

    return result;
  } catch (error) {
    logError("recipe_parse_job.queue_failed", error, {
      target: {
        householdId: payload.householdId,
        jobId: payload.jobId,
      },
      trigger: payload.trigger,
      eventName: RECIPE_PARSE_JOB_REQUESTED_EVENT,
      result: {
        status: "error",
      },
    });
    throw error;
  }
}
