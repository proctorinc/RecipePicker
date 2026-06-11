import { AppShell } from "@/components/app-shell";
import { RecipeHistoryCalendar } from "@/components/recipe-history-calendar";
import { getRecipeHistoryPage } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const history = await getRecipeHistoryPage(month);

  return (
    <AppShell
      title="Meal History"
      description="Track and review your recipes when your tried recipes"
    >
      <RecipeHistoryCalendar history={history} />
    </AppShell>
  );
}
