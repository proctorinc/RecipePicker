import { PageIntro, PageShell } from "@/components/page-shell";
import { RecipeHistoryCalendar } from "@/components/recipe-history-calendar";
import { getRecipeHistoryPage } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; recipeId?: string; from?: string; date?: string | string[] }>;
}) {
  const { month, recipeId, from, date } = await searchParams;
  const history = await getRecipeHistoryPage(month, recipeId);
  const initialCartDates = Array.isArray(date) ? date : date ? [date] : [];

  return (
    <PageShell>
      <RecipeHistoryCalendar history={history} fromRecipe={from === "recipe"} initialCartDates={initialCartDates} />
    </PageShell>
  );
}
