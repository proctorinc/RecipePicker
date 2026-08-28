import { NextResponse } from "next/server";

import { requireOwnerOrAdminIntegrationAccess } from "@/lib/server/access";
import { toErrorResponse, withRouteLogging } from "@/lib/server/logger";
import { getPinterestSyncRunProgress } from "@/lib/server/queries";

export const GET = withRouteLogging(
  "api.pinterest_sync_status",
  async (request: Request) => {
    await requireOwnerOrAdminIntegrationAccess();
    const syncRunId = new URL(request.url).searchParams.get("syncRunId")?.trim();
    if (!syncRunId) {
      return NextResponse.json({ error: "syncRunId is required." }, { status: 400 });
    }

    const run = await getPinterestSyncRunProgress(syncRunId);
    if (!run) {
      return NextResponse.json({ error: "Sync run not found." }, { status: 404 });
    }

    return NextResponse.json({ run });
  },
  {
    onError: (error) => toErrorResponse(error, "Unable to load Pinterest sync progress."),
  },
);
