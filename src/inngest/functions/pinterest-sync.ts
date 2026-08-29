import type { GetStepTools } from "inngest";

import { inngest } from "@/src/inngest/client";
import { PINTEREST_SYNC_REQUESTED_EVENT } from "@/src/inngest/events";
import { markPinterestSyncJobFailure, processPinterestSyncJobPage, queueDueNightlyPinterestSyncs } from "@/lib/server/sync";

type WorkflowStep = Pick<GetStepTools<typeof inngest>, "run">;

async function runWorkflow(jobId: string, step: WorkflowStep) {
  let page = 1;
  while (true) {
    const result = await step.run(`page-${page}`, () => processPinterestSyncJobPage(jobId));
    if (result.status !== "continued") return result;
    page += 1;
  }
}

export const pinterestSyncRunner = inngest.createFunction(
  {
    id: "pinterest-sync-runner",
    triggers: { event: PINTEREST_SYNC_REQUESTED_EVENT },
    retries: 3,
    concurrency: { limit: 1, key: "event.data.householdId" },
    onFailure: async ({ event, error }) => {
      await markPinterestSyncJobFailure(event.data.event.data.jobId, error);
    },
  },
  async ({ event, step }) => {
    return runWorkflow(event.data.jobId, step);
  },
);

export const pinterestNightlySyncScheduler = inngest.createFunction(
  {
    id: "pinterest-nightly-sync-scheduler",
    triggers: { cron: "* * * * *" },
    retries: 2,
  },
  async () => queueDueNightlyPinterestSyncs(),
);
