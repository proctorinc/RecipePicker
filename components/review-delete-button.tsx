"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { deleteRecipeReviewAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import { Button } from "@/components/ui/button";

const initialActionState: ActionState = {
  status: "idle",
  message: "",
};

export function ReviewDeleteButton({
  reviewId,
  onSuccess,
}: {
  reviewId: string;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(deleteRecipeReviewAction, initialActionState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      onSuccess?.();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [onSuccess, state]);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Delete this review?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="reviewId" value={reviewId} />
      <Button type="submit" variant="ghost" size="sm">
        Delete
      </Button>
    </form>
  );
}
