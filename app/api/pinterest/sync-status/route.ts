import { NextResponse } from "next/server";

import { toErrorResponse, withRouteLogging } from "@/lib/server/logger";
import {
  getActivePinterestSyncRunProgress,
  getPinterestSyncRunProgress,
} from "@/lib/server/queries";

export const GET = withRouteLogging(
  "api.pinterest_sync_status",
  async (request: Request) => {
    const syncRunId = new URL(request.url).searchParams.get("syncRunId")?.trim();
    const run = syncRunId
      ? await getPinterestSyncRunProgress(syncRunId)
      : await getActivePinterestSyncRunProgress();
    if (!run) {
      return NextResponse.json({ error: "Sync run not found." }, { status: 404 });
    }

    return NextResponse.json({ run });
  },
  {
    onError: (error) => toErrorResponse(error, "Unable to load Pinterest sync progress."),
  },
);
