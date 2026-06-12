import process from "node:process";

import { runScriptWithLogging } from "@/lib/server/logger";
import { syncBoard } from "@/lib/server/sync";

function parseArgs(argv: string[]) {
  const [householdId, boardId, outputPathArg] = argv;

  if (!householdId || !boardId) {
    throw new Error(
      "Usage: npm run sync:board -- <household-id> <board-id> [sqlite-path]",
    );
  }

  const sqlitePath =
    outputPathArg ?? process.env.SQLITE_PATH ?? "./data/db.sqlite";

  return {
    householdId,
    boardId,
    sqlitePath,
  };
}

async function main() {
  const { householdId, boardId, sqlitePath } = parseArgs(process.argv.slice(2));
  const result = await syncBoard(boardId, { householdId, sqlitePath });

  process.stdout.write(
    `Synced ${result.syncedPins} pins from board ${boardId} into ${result.sqlitePath}\n`,
  );
}

runScriptWithLogging({
  scriptName: "script.pinterest_board_sync",
  fn: main,
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
