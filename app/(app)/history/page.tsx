import { Calendar } from "lucide-react";

import { PageIntro, PageShell } from "@/components/page-shell";
import { RecipeHeaderBackButtonEnabled } from "@/components/recipe-header-back-button";
import { RecipeHistoryCalendar } from "@/components/recipe-history-calendar";
import { getRecipeHistoryPage } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; recipeId?: string; from?: string; cart?: string }>;
}) {
  const { month, recipeId, from, cart } = await searchParams;
  const history = await getRecipeHistoryPage(month, recipeId);

  return (
    <PageShell>
      {from === "recipe" && recipeId ? (
        <RecipeHeaderBackButtonEnabled
          backHref={`/recipe/${encodeURIComponent(recipeId)}`}
        />
      ) : null}
      <PageIntro title="Recipe history" icon={Calendar} />
      <RecipeHistoryCalendar history={history} fromRecipe={from === "recipe"} initialCartSelection={cart === "select"} />
    </PageShell>
  );
}
