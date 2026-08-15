import { RecipeOpsTable } from "@/components/recipe-ops-table";
import { SettingsNav } from "@/components/settings-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBoardSyncOptions, getRecipeOpsList, getRecipeParseJobSummaries } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function RecipeSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const query = typeof params.q === "string" ? params.q : "";
  const [items, boards, jobs] = await Promise.all([
    getRecipeOpsList(query),
    getBoardSyncOptions(),
    getRecipeParseJobSummaries(),
  ]);
  const boardLabelById = new Map(boards.map((board) => [board.boardId, board.name ?? board.boardId]));
  const boardOptions = [...new Set(items.map((item) => item.boardId))]
    .sort((left, right) => (boardLabelById.get(left) ?? left).localeCompare(boardLabelById.get(right) ?? right))
    .map((boardId) => ({
      value: boardId,
      label: boardLabelById.get(boardId) ?? boardId,
    }));

  return (
    <div className="space-y-6">
      <SettingsNav currentPath="/settings/recipes" />
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Recipes</CardTitle>
          <CardDescription>Filter, check a recipe’s state, or re-parse a selection.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <RecipeOpsTable items={items} boardOptions={boardOptions} jobs={jobs} />
        </CardContent>
      </Card>
    </div>
  );
}
