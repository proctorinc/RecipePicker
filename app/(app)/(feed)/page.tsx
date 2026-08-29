import { FeedSyncTrigger } from "@/components/feed-sync-trigger";
import { HomeFeedShell } from "@/components/home-feed-shell";
import { PageShell } from "@/components/page-shell";
import { readFeedFilters } from "@/lib/feed-filters";
import { getFeedPinsPage } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const query = typeof params.q === "string" ? params.q : "";
  const filters = readFeedFilters(params);
  const page = await getFeedPinsPage({
    searchText: query,
    filters,
  });

  return (
    <PageShell>
      <FeedSyncTrigger />
      <HomeFeedShell initialPage={page} initialQuery={query} initialFilters={filters} />
    </PageShell>
  );
}
