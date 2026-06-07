import { AppShell } from "@/components/app-shell";
import { FeedSearch } from "@/components/feed-search";
import { PinCard } from "@/components/pin-card";
import { Card, CardContent } from "@/components/ui/card";
import { getFeedPins } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const query = typeof params.q === "string" ? params.q : "";
  const cards = await getFeedPins(query);

  return (
    <AppShell>
      {cards.length > 0 ? (
        <section className="columns-2 gap-2 pb-24 sm:columns-2 md:columns-3 md:gap-5 lg:columns-4">
          {cards.map((card) => (
            <PinCard key={card.recipeId} card={card} />
          ))}
        </section>
      ) : (
        <Card className="border-dashed border-white/80 bg-white/70">
          <CardContent className="py-12 text-center text-muted-foreground">
            No recipes matched this search yet. Try a broader ingredient, title,
            or site query.
          </CardContent>
        </Card>
      )}
      <div className="fixed left-0 right-0 top-20 z-30 px-3 md:bottom-4 md:inset-y-auto md:px-0">
        <div className="mx-auto max-w-md">
          <FeedSearch initialQuery={query} />
        </div>
      </div>
    </AppShell>
  );
}
