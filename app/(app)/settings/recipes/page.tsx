import { RecipeOpsTable } from "@/components/recipe-ops-table";
import { SettingsNav } from "@/components/settings-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBoardSyncOptions, getRecipeOpsList } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function RecipeSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const query = typeof params.q === "string" ? params.q : "";
  const [items, boards] = await Promise.all([getRecipeOpsList(query), getBoardSyncOptions()]);
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
        <CardHeader>
          <CardTitle>Recipe operations</CardTitle>
          <CardDescription>Filter recipes by board or status, then re-parse all filtered recipes or just the ones you select.</CardDescription>
        </CardHeader>
        <CardContent>
          <RecipeOpsTable items={items} boardOptions={boardOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
