import { serve } from "inngest/next";

import { inngest } from "@/src/inngest/client";
import { recipeParseJobRunner } from "@/src/inngest/functions/recipe-parse";
import { pinterestNightlySyncScheduler, pinterestSyncRunner } from "@/src/inngest/functions/pinterest-sync";

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [recipeParseJobRunner, pinterestSyncRunner, pinterestNightlySyncScheduler],
});
