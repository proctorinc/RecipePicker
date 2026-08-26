import { FeedSyncTrigger } from "@/components/feed-sync-trigger";
import { HomeFeedShell } from "@/components/home-feed-shell";
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
      <HomeFeedShell initialPage={page} initialQuery={query} />
    </PageShell>
  );
}
