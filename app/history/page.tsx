import { AppShell } from "@/components/app-shell";
import { ReviewHistoryList } from "@/components/review-history-list";
import { getRecipeHistoryPage } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const history = await getRecipeHistoryPage();

  return (
    <AppShell
      title="Meal History"
      description="See how meals turned out across your household, then add follow-up notes or another review when you cook them again."
    >
      <ReviewHistoryList items={history.items} recipeOptions={history.recipeOptions} />
    </AppShell>
  );
}
