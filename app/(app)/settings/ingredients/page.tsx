import { AppTransitionLink } from "@/components/app-transition-link";
import { IngredientReviewTable } from "@/components/ingredient-review-table";
import { IngredientCatalog } from "@/components/ingredient-catalog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireHouseholdContext } from "@/lib/server/auth";
import { requireOwnerOrAdminSettingsAccess } from "@/lib/server/access";
import { isAuthorizationError } from "@/lib/server/errors";
import { notFound } from "next/navigation";
import { getHouseholdAiConnectionStatus } from "@/lib/server/ai-provider";
import { getIngredientCatalog, getIngredientReviewQueue } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const CATALOG_PAGE_SIZE = 25;

export default async function IngredientSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await requireOwnerOrAdminSettingsAccess();
  } catch (error) {
    if (isAuthorizationError(error)) notFound();
    throw error;
  }

  const params = (await searchParams) ?? {};
  const rawPage = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const requestedPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawCatalogPage = typeof params.catalogPage === "string" ? Number.parseInt(params.catalogPage, 10) : 1;
  const requestedCatalogPage = Number.isInteger(rawCatalogPage) && rawCatalogPage > 0 ? rawCatalogPage : 1;
  const catalogQuery = typeof params.catalogQuery === "string" ? params.catalogQuery : "";
  const recipeId = typeof params.recipeId === "string" ? params.recipeId : undefined;
  const context = await requireHouseholdContext();
  const [queue, catalog, aiConnectionStatus] = await Promise.all([
    getIngredientReviewQueue(requestedPage, PAGE_SIZE, recipeId),
    getIngredientCatalog(requestedCatalogPage, CATALOG_PAGE_SIZE, catalogQuery),
    getHouseholdAiConnectionStatus(context.householdId),
  ]);
  const startItem = queue.totalCount === 0 ? 0 : (queue.page - 1) * queue.pageSize + 1;
  const endItem = queue.totalCount === 0 ? 0 : startItem + queue.items.length - 1;
  const recipeParam = recipeId ? `&recipeId=${encodeURIComponent(recipeId)}` : "";
  const previousHref = queue.page > 2 ? `/settings/ingredients?page=${queue.page - 1}${recipeParam}` : `/settings/ingredients${recipeId ? `?recipeId=${encodeURIComponent(recipeId)}` : ""}`;
  const nextHref = `/settings/ingredients?page=${queue.page + 1}${recipeParam}`;

  return (
    <div className="space-y-6">
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
          <IngredientReviewTable
            items={queue.items}
            page={queue.page}
            recipeId={recipeId ?? null}
            aiEnabled={aiConnectionStatus === "active"}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Ingredient catalog</CardTitle><CardDescription>See each ingredient’s family at a glance. Use Edit to organize a family or merge duplicates.</CardDescription></CardHeader>
        <CardContent><IngredientCatalog catalog={catalog} recipeId={recipeId} /></CardContent>
      </Card>
    </div>
  );
}
