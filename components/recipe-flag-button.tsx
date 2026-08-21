import { Flag } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { toggleRecipeFlagAction } from "@/lib/actions/operations";

export function RecipeFlagButton({
  recipeId,
  isFlagged,
}: {
  recipeId: string;
  isFlagged: boolean;
}) {
  return (
    <ActionForm
      action={toggleRecipeFlagAction}
      fields={{ recipeId }}
      buttonVariant={isFlagged ? "destructive" : "outline"}
      buttonClassName={isFlagged ? undefined : "border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"}
    >
      <Flag className={isFlagged ? "size-4 fill-current" : "size-4"} />
      {isFlagged ? "Flagged" : "Flag"}
    </ActionForm>
  );
}
