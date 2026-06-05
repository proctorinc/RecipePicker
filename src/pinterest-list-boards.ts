import process from "node:process";

import { fetchAllBoards, requireEnv } from "./pinterest-api.js";

async function main() {
  const accessToken = requireEnv("PINTEREST_ACCESS_TOKEN");
  const boards = await fetchAllBoards(accessToken);

  if (boards.length === 0) {
    console.log("No boards found for the authenticated user.");
    return;
  }

  for (const board of boards) {
    console.log(`${board.name ?? "(untitled board)"}\t${board.id}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
