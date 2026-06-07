import process from "node:process";

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

  console.log(
    `Synced ${result.syncedPins} pins from board ${boardId} into ${result.sqlitePath}`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
