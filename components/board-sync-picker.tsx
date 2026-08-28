"use client";

import { Check, Loader2, Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { setBoardSyncEnabledAction } from "@/lib/actions/board-actions";
import { type ActionState } from "@/lib/actions/types";
import { cn } from "@/lib/utils";
import type { BoardSyncSummary } from "@/types/view-models";

const initialState: ActionState = {
  status: "idle",
  message: "",
};

export function BoardSyncPicker({ boards }: { boards: BoardSyncSummary[] }) {
  const availableBoards = boards.filter((board) => !board.syncEnabled);
  const [open, setOpen] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState(availableBoards[0]?.boardId ?? "");
  const [state, formAction] = useActionState(setBoardSyncEnabledAction, initialState);

  useEffect(() => {
    setSelectedBoardId(availableBoards[0]?.boardId ?? "");
  }, [boards]);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      setOpen(false);
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  const selectedBoard = availableBoards.find((board) => board.boardId === selectedBoardId) ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button aria-label="Add Pinterest board" size="icon" title="Add board" type="button">
          <Plus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[min(92vw,34rem)] flex-col p-5 sm:p-6">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>Add a board</DialogTitle>
          <DialogDescription>
            Choose a Pinterest board to include in automatic syncs.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="mt-5 flex min-h-0 flex-1 flex-col gap-4">
          <input name="boardId" type="hidden" value={selectedBoard?.boardId ?? ""} />
          <input name="boardName" type="hidden" value={selectedBoard?.name ?? ""} />
          <input name="syncEnabled" type="hidden" value="true" />
          {availableBoards.length > 0 ? (
            <div aria-label="Available Pinterest boards" className="max-h-[min(50vh,22rem)] space-y-2 overflow-y-auto pr-1" role="listbox">
              {availableBoards.map((board) => {
                const selected = board.boardId === selectedBoardId;
                const boardName = board.name ?? board.boardId;

                return (
                  <button
                    aria-selected={selected}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border/60 hover:border-primary/40 hover:bg-secondary/40",
                    )}
                    key={board.boardId}
                    onClick={() => setSelectedBoardId(board.boardId)}
                    role="option"
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{boardName}</span>
                      {board.name ? <span className="block truncate text-xs text-muted-foreground">{board.boardId}</span> : null}
                    </span>
                    {selected ? <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              All available Pinterest boards are already syncing.
            </p>
          )}
          <PickerSubmitButton disabled={!selectedBoard} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PickerSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" type="submit" disabled={pending || disabled}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Add board
    </Button>
  );
}
