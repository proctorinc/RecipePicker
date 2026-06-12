import { NextResponse } from "next/server";
import { z } from "zod";

import { getFeedPinsPage } from "@/lib/server/queries";
import { toErrorResponse, withRouteLogging } from "@/lib/server/logger";

const requestSchema = z.object({
  q: z.string().optional(),
  cursor: z.string().nullable().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withRouteLogging(
  "api.feed",
  async (request: Request) => {
    const url = new URL(request.url);
    const parsed = requestSchema.parse({
      q: url.searchParams.get("q") ?? undefined,
      cursor: url.searchParams.get("cursor"),
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    const page = await getFeedPinsPage({
      searchText: parsed.q,
      cursor: parsed.cursor,
      pageSize: parsed.pageSize,
    });

    return NextResponse.json(page);
  },
  {
    onError: (error) =>
      toErrorResponse(
        error,
        error instanceof z.ZodError
          ? "Invalid feed request."
          : "Unable to load the recipe feed.",
      ),
  },
);
