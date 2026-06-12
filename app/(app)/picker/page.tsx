import { notFound } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { RecipePicker } from "@/components/recipe-picker";
import { getCurrentUserAccess } from "@/lib/server/access";
import { getRecipePickerInitialState } from "@/lib/server/recipe-picker";

export const dynamic = "force-dynamic";

export default async function PickerPage() {
  const access = await getCurrentUserAccess();

  if (!access.isPremium) {
    notFound();
  }

  const initialState = await getRecipePickerInitialState();

  return (
    <PageShell className="max-w-6xl">
      <RecipePicker initialState={initialState} />
    </PageShell>
  );
}
