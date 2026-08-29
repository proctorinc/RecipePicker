import { Plus } from "lucide-react";

import { CustomRecipeForm } from "@/components/custom-recipe-form";
import { PageShell } from "@/components/page-shell";
import { Icon } from "@/components/ui/icon";
import { getCustomRecipeBoardOptions } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function NewRecipePage() {
  const { boards, canPublish } = await getCustomRecipeBoardOptions();

  return (
    <PageShell>
      <div className="flex items-center gap-3 px-2">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Icon icon={Plus} size="md" />
        </div>
        <div>
          <h1 className="font-[family-name:var(--font-serif)] text-3xl font-semibold">Create a recipe</h1>
          <p className="text-sm text-muted-foreground">Publish it to Pinterest and add it to your shared library.</p>
        </div>
      </div>
      <CustomRecipeForm boards={boards} canPublish={canPublish} />
    </PageShell>
  );
}
