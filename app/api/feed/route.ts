import { NextResponse } from "next/server";
import { z } from "zod";

import { calendarFilterValues, ratingFilterValues } from "@/lib/feed-filters";
import { getFeedPinsPage } from "@/lib/server/queries";
import { toErrorResponse, withRouteLogging } from "@/lib/server/logger";

const requestSchema = z.object({
  q: z.string().optional(),
  cursor: z.string().nullable().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  tagId: z.string().min(1).optional(),
  rating: z.enum(ratingFilterValues).optional(),
  minRating: z.coerce.number().min(0).max(5).multipleOf(0.5).optional(),
  maxRating: z.coerce.number().min(0).max(5).multipleOf(0.5).optional(),
  calendar: z.enum(calendarFilterValues).optional(),
  ready: z.enum(["true"]).optional(),
}).refine(
  (value) => value.minRating === undefined || value.maxRating === undefined || value.minRating <= value.maxRating,
  { message: "Minimum rating cannot exceed maximum rating.", path: ["minRating"] },
);

export const GET = withRouteLogging(
  "api.feed",
  async (request: Request) => {
    const url = new URL(request.url);
    const parsed = requestSchema.parse({
      q: url.searchParams.get("q") ?? undefined,
      cursor: url.searchParams.get("cursor"),
      pageSize: url.searchParams.get("pageSize") ?? undefined,
      tagId: url.searchParams.get("tagId") ?? undefined,
      rating: url.searchParams.get("rating") ?? undefined,
      minRating: url.searchParams.get("minRating") ?? undefined,
      maxRating: url.searchParams.get("maxRating") ?? undefined,
      calendar: url.searchParams.get("calendar") ?? undefined,
      ready: url.searchParams.get("ready") ?? undefined,
    });
    const page = await getFeedPinsPage({
      searchText: parsed.q,
      cursor: parsed.cursor,
      pageSize: parsed.pageSize,
      tagId: parsed.tagId,
      filters: {
        rating: parsed.minRating !== undefined || parsed.maxRating !== undefined ? "rated" : parsed.rating ?? "all",
        minRating: parsed.minRating ?? null,
        maxRating: parsed.maxRating ?? null,
        calendar: parsed.calendar ?? "all",
        readyOnly: parsed.ready === "true",
      },
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
