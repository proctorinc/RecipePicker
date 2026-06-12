import process from "node:process";

import { runScriptWithLogging } from "@/lib/server/logger";
import { extractRecipes } from "@/lib/server/extract";

type Args = {
  householdId: string;
  sqlitePath?: string;
  recipeId?: string;
  boardId?: string;
  rerun: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    householdId: process.env.HOUSEHOLD_ID?.trim() || "",
    rerun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === "--sqlite-path" && nextValue) {
      args.sqlitePath = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--household-id" && nextValue) {
      args.householdId = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--recipe-id" && nextValue) {
      args.recipeId = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--board-id" && nextValue) {
      args.boardId = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--rerun") {
      args.rerun = true;
      continue;
    }

    throw new Error(
      "Usage: npm run extract:recipes -- --household-id <household-id> [--recipe-id <recipe-id>] [--board-id <board-id>] [--sqlite-path <path>] [--rerun]",
    );
  }

  if (!args.householdId) {
    throw new Error("A household id is required. Pass --household-id or set HOUSEHOLD_ID.");
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await extractRecipes(args);

  process.stdout.write(
    `Processed ${result.processed} pins from ${result.sqlitePath}: ${result.extracted} extracted, ${result.reviewNeeded} review-needed, ${result.failed} failed, ${result.skipped} skipped.\n`,
  );
}

runScriptWithLogging({
  scriptName: "script.extract_recipes",
  fn: main,
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
