"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { publishPersonalRecipeAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import { Button } from "@/components/ui/button";

const initialState: ActionState = { status: "idle", message: "" };

export function PublishPersonalRecipe({ recipeId, boards, canPublish }: {
  recipeId: string;
  boards: Array<{ boardId: string; name: string }>;
  canPublish: boolean;
}) {
  const [state, formAction, pending] = useActionState(publishPersonalRecipeAction, initialState);
  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);
  if (!canPublish || boards.length === 0) return null;
  return <form action={formAction} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="recipeId" value={recipeId} />
    <select name="boardId" required className="h-10 rounded-full border border-border bg-background px-4 text-sm">
      <option value="">Choose Pinterest board</option>
      {boards.map((board) => <option key={board.boardId} value={board.boardId}>{board.name}</option>)}
    </select>
    <Button size="sm" disabled={pending}>{pending ? "Publishing…" : "Publish to Pinterest"}</Button>
  </form>;
}
