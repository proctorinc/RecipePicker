import { AppTransitionLink } from "@/components/app-transition-link";
import { IngredientReviewTable } from "@/components/ingredient-review-table";
import { SettingsNav } from "@/components/settings-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCanonicalIngredientOptions, getIngredientReviewQueue } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function IngredientSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const rawPage = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const requestedPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const recipeId = typeof params.recipeId === "string" ? params.recipeId : undefined;
  const [queue, canonicalOptions] = await Promise.all([
    getIngredientReviewQueue(requestedPage, PAGE_SIZE, recipeId),
    getCanonicalIngredientOptions(),
  ]);
  const startItem = queue.totalCount === 0 ? 0 : (queue.page - 1) * queue.pageSize + 1;
  const endItem = queue.totalCount === 0 ? 0 : startItem + queue.items.length - 1;
  const recipeParam = recipeId ? `&recipeId=${encodeURIComponent(recipeId)}` : "";
  const previousHref = queue.page > 2 ? `/settings/ingredients?page=${queue.page - 1}${recipeParam}` : `/settings/ingredients${recipeId ? `?recipeId=${encodeURIComponent(recipeId)}` : ""}`;
  const nextHref = `/settings/ingredients?page=${queue.page + 1}${recipeParam}`;

  return (
    <div className="space-y-6">
      <SettingsNav currentPath="/settings/ingredients" />
      <Card>
        <CardHeader>
          <CardTitle>Ingredient review</CardTitle>
          <CardDescription>
            Review what the parser understood, decide whether each phrase should match an existing ingredient or become a new one,
            and save reusable knowledge for future imports.
          </CardDescription>
          {recipeId ? <p className="text-sm text-muted-foreground">Filtered to one recipe’s pending ingredient matches.</p> : null}
        </CardHeader>
        <CardContent className="space-y-5">
          {queue.totalCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>
                Showing {startItem}-{endItem} of {queue.totalCount} pending ingredients
              </p>
              {queue.totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <AppTransitionLink
                    href={previousHref}
                    prefetch
                    aria-disabled={queue.page <= 1}
                    className="rounded-full border border-border px-4 py-2 text-foreground transition hover:bg-secondary aria-disabled:pointer-events-none aria-disabled:opacity-50"
                  >
                    Previous
                  </AppTransitionLink>
                  <span>
                    Page {queue.page} of {queue.totalPages}
                  </span>
                  <AppTransitionLink
                    href={nextHref}
                    prefetch
                    aria-disabled={queue.page >= queue.totalPages}
                    className="rounded-full border border-border px-4 py-2 text-foreground transition hover:bg-secondary aria-disabled:pointer-events-none aria-disabled:opacity-50"
                  >
                    Next
                  </AppTransitionLink>
                </div>
              ) : null}
            </div>
          ) : null}
          <IngredientReviewTable items={queue.items} canonicalOptions={canonicalOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
