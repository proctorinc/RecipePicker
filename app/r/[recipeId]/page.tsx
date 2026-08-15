import { redirect } from "next/navigation";
import { getPublicRecipeUrl } from "@/lib/public-recipe-url";
import {
  getLatestPublicRecipeVersion,
  hasCurrentUserRecipeAccess,
} from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function PublicRecipePage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  if (await hasCurrentUserRecipeAccess(recipeId)) {
    redirect(`/recipe/${encodeURIComponent(recipeId)}`);
  }

  const version = await getLatestPublicRecipeVersion(recipeId);
  if (version) redirect(getPublicRecipeUrl(recipeId, version));
  redirect("/");
}
