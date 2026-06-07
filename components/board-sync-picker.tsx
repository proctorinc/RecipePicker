"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setBoardSyncEnabledAction } from "@/lib/actions/board-actions";
import { type ActionState } from "@/lib/actions/types";
import type { BoardSyncSummary } from "@/types/view-models";

const initialState: ActionState = {
  status: "idle",
  message: "",
};

export function BoardSyncPicker({ boards }: { boards: BoardSyncSummary[] }) {
  const availableBoards = boards.filter((board) => !board.syncEnabled);
  const [selectedBoardId, setSelectedBoardId] = useState(availableBoards[0]?.boardId ?? "");
  const [state, formAction] = useActionState(setBoardSyncEnabledAction, initialState);

  useEffect(() => {
    setSelectedBoardId(availableBoards[0]?.boardId ?? "");
  }, [boards]);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  const selectedBoard = availableBoards.find((board) => board.boardId === selectedBoardId) ?? null;

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-[22px] border border-border/60 bg-secondary/20 p-4 md:flex-row md:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">Select board to sync</p>
        <p className="text-sm text-muted-foreground">Add a Pinterest board here to include it in global sync and board management.</p>
      </div>
      <div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[320px] md:flex-row">
        <select
          name="boardId"
          value={selectedBoardId}
          onChange={(event) => setSelectedBoardId(event.target.value)}
          disabled={availableBoards.length === 0}
          className="h-12 w-full rounded-full border border-border bg-background/90 px-5 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:min-w-[260px]"
        >
          {availableBoards.length === 0 ? (
            <option value="">No unselected boards available</option>
          ) : (
            availableBoards.map((board) => (
              <option key={board.boardId} value={board.boardId}>
                {board.name ?? board.boardId}
              </option>
            ))
          )}
        </select>
        <input type="hidden" name="boardName" value={selectedBoard?.name ?? ""} />
        <input type="hidden" name="syncEnabled" value="true" />
        <PickerSubmitButton disabled={!selectedBoard} />
      </div>
    </form>
  );
}

function PickerSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Add board
    </Button>
  );
}
