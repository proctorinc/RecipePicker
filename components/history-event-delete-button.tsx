"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { deleteRecipeEventAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import { Button } from "@/components/ui/button";

const initialActionState: ActionState = {
  status: "idle",
  message: "",
};

export function HistoryEventDeleteButton({
  eventId,
  onSuccess,
}: {
  eventId: string;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(deleteRecipeEventAction, initialActionState);

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
        if (!window.confirm("Remove this meal history entry?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <Button type="submit" variant="ghost" size="sm">
        Remove
      </Button>
    </form>
  );
}
