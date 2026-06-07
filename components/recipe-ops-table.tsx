"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rerunRecipesAction } from "@/lib/actions/operations";
import { formatStatusLabel } from "@/lib/server/status";
import type { ActionState } from "@/lib/actions/types";
import type { PinStatus, RecipeOpsListItem } from "@/types/view-models";
import { formatDate } from "@/lib/utils";

const initialState: ActionState = {
  status: "idle",
  message: "",
};

type BoardOption = {
  value: string;
  label: string;
};

const statusOptions: Array<{ value: PinStatus; label: string }> = [
  { value: "recipe_ready", label: formatStatusLabel("recipe_ready") },
  { value: "not_extracted", label: formatStatusLabel("not_extracted") },
  { value: "needs_review", label: formatStatusLabel("needs_review") },
  { value: "extraction_failed", label: formatStatusLabel("extraction_failed") },
  { value: "not_recipe", label: formatStatusLabel("not_recipe") },
];

export function RecipeOpsTable({
  items,
  boardOptions,
}: {
  items: RecipeOpsListItem[];
  boardOptions: BoardOption[];
}) {
  const [boardFilter, setBoardFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [state, formAction] = useActionState(rerunRecipesAction, initialState);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (boardFilter !== "all" && item.boardId !== boardFilter) {
        return false;
      }

      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [boardFilter, items, statusFilter]);

  const filteredIds = filteredItems.map((item) => item.recipeId);
  const allFilteredSelected =
    filteredIds.length > 0 &&
    filteredIds.every((id) => selectedRecipeIds.includes(id));
  const selectedCount = selectedRecipeIds.length;
  const targetRecipeIds = selectedCount > 0 ? selectedRecipeIds : filteredIds;

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      setSelectedRecipeIds([]);
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  function toggleRecipe(recipeId: string, checked: boolean) {
    setSelectedRecipeIds((current) => {
      if (checked) {
        return current.includes(recipeId) ? current : [...current, recipeId];
      }

      return current.filter((id) => id !== recipeId);
    });
  }

  function toggleFilteredRecipes(checked: boolean) {
    setSelectedRecipeIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...filteredIds]));
      }

      return current.filter((id) => !filteredIds.includes(id));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-[24px] border border-border/60 bg-secondary/20 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <select
                value={boardFilter}
                onChange={(event) => setBoardFilter(event.target.value)}
                className="h-11 w-full rounded-full border border-border bg-background/90 px-4 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All boards</option>
                {boardOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-11 w-full rounded-full border border-border bg-background/90 px-4 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All statuses</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <form
            action={formAction}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              type="hidden"
              name="recipeIds"
              value={JSON.stringify(targetRecipeIds)}
            />
            <BulkRerunButton disabled={targetRecipeIds.length === 0}>
              {selectedCount > 0
                ? `Re-parse ${selectedCount} recipes`
                : `Re-parse ${filteredItems.length} recipes`}
            </BulkRerunButton>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={(event) => toggleFilteredRecipes(event.target.checked)}
              disabled={filteredItems.length === 0}
              className="h-4 w-4 rounded border border-border"
            />
            Select all filtered
          </label>
          <span>{filteredItems.length} recipes shown</span>
          <span>{selectedCount} selected</span>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Select</TableHead>
            <TableHead>Recipe</TableHead>
            <TableHead>Board</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredItems.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                No recipes match the current filters.
              </TableCell>
            </TableRow>
          ) : null}
          {filteredItems.map((item) => (
            <TableRow key={item.recipeId}>
              <TableCell>
                <input
                  type="checkbox"
                  checked={selectedRecipeIds.includes(item.recipeId)}
                  onChange={(event) =>
                    toggleRecipe(item.recipeId, event.target.checked)
                  }
                  className="h-4 w-4 rounded border border-border"
                  aria-label={`Select recipe ${item.title}`}
                />
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.sourceUrl ?? "No source URL"}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                {boardOptions.find((option) => option.value === item.boardId)
                  ?.label ?? item.boardId}
              </TableCell>
              <TableCell>
                <StatusBadge status={item.status} />
              </TableCell>
              <TableCell>{formatDate(item.updatedAt)}</TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/settings/recipes/${item.recipeId}`}
                  className="text-sm font-medium underline underline-offset-4"
                >
                  Manage
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BulkRerunButton({
  children,
  disabled,
}: {
  children: string;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" disabled={pending || disabled}>
      {pending ? "Re-parsing..." : children}
    </Button>
  );
}
