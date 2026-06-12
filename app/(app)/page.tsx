import { FeedSyncTrigger } from "@/components/feed-sync-trigger";
import { FeedSearch } from "@/components/feed-search";
import { HomeFeed } from "@/components/home-feed";
import { PageShell } from "@/components/page-shell";
import { getFeedPinsPage } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const query = typeof params.q === "string" ? params.q : "";
  const page = await getFeedPinsPage({
    searchText: query,
  });

  return (
    <PageShell>
      <FeedSyncTrigger />
      <HomeFeed
        key={query}
        initialItems={page.items}
        initialCursor={page.nextCursor}
        initialHasMore={page.hasMore}
        query={query}
      />
      <div className="fixed left-0 right-0 z-30 px-3 bottom-24 md:bottom-4 md:px-0">
        <div className="mx-auto max-w-md">
          <FeedSearch initialQuery={query} />
        </div>
      </div>
    </PageShell>
  );
}
