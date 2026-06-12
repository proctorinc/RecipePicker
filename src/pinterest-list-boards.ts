import process from "node:process";

import { logInfo, runScriptWithLogging } from "@/lib/server/logger";
import { fetchAllBoards, requireEnv } from "./pinterest-api.js";

async function main() {
  const accessToken = requireEnv("PINTEREST_ACCESS_TOKEN");
  const boards = await fetchAllBoards(accessToken);

  if (boards.length === 0) {
    logInfo("script.pinterest_list_boards.empty");
    process.stdout.write("No boards found for the authenticated user.\n");
    return;
  }

  logInfo("script.pinterest_list_boards.completed", {
    result: {
      boardCount: boards.length,
    },
  });

  for (const board of boards) {
    process.stdout.write(`${board.name ?? "(untitled board)"}\t${board.id}\n`);
  }
}

runScriptWithLogging({
  scriptName: "script.pinterest_list_boards",
  fn: main,
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
