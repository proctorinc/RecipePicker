import { serve } from "inngest/next";

import { inngest } from "@/src/inngest/client";
import { recipeParseJobRunner } from "@/src/inngest/functions/recipe-parse";

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [recipeParseJobRunner],
});
