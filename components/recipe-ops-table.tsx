"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { cancelRecipeParseJobAction, resumeRecipeParseJobAction } from "@/lib/actions/operations";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import type { PinStatus, RecipeOpsListItem, RecipeParseJobSummary } from "@/types/view-models";
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
  jobs,
}: {
  items: RecipeOpsListItem[];
  boardOptions: BoardOption[];
  jobs: RecipeParseJobSummary[];
}) {
  const [boardFilter, setBoardFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [state, formAction] = useActionState(rerunRecipesAction, initialState);
  const [cancelState, cancelFormAction] = useActionState(cancelRecipeParseJobAction, initialState);
  const [resumeState, resumeFormAction] = useActionState(resumeRecipeParseJobAction, initialState);
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();

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

  useEffect(() => {
    if (cancelState.status === "success") {
      toast.success(cancelState.message);
    } else if (cancelState.status === "error") {
      toast.error(cancelState.message);
    }
  }, [cancelState]);

  useEffect(() => {
    if (resumeState.status === "success") {
      toast.success(resumeState.message);
    } else if (resumeState.status === "error") {
      toast.error(resumeState.message);
    }
  }, [resumeState]);

  useEffect(() => {
    if (!jobs.some((job) => job.canCancel || job.canResume)) {
      return;
    }

    const timer = window.setInterval(() => {
      router.refresh();
    }, 15000);

    return () => window.clearInterval(timer);
  }, [jobs, router]);

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
      <RecipeParseJobsPanel
        jobs={jobs}
        onRefresh={() => startRefresh(() => router.refresh())}
        refreshing={isRefreshing}
        cancelFormAction={cancelFormAction}
        resumeFormAction={resumeFormAction}
      />
      <div className="flex flex-col gap-3 rounded-[24px] border border-border/60 bg-secondary/20 p-3 sm:gap-4 sm:p-4">
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
                ? `Re-parse ${selectedCount} selected`
                : `Re-parse ${filteredItems.length} shown`}
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

      <div className="space-y-2 md:hidden">
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            No recipes match the current filters.
          </div>
        ) : null}
        {filteredItems.map((item) => (
          <RecipeOpsMobileCard
            key={item.recipeId}
            item={item}
            boardLabel={boardOptions.find((option) => option.value === item.boardId)?.label ?? item.boardId}
            selected={selectedRecipeIds.includes(item.recipeId)}
            onSelectedChange={(checked) => toggleRecipe(item.recipeId, checked)}
          />
        ))}
      </div>

      <div className="hidden md:block">
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
                  {item.status !== "recipe_ready" ? (
                    <p className="mt-1 max-w-md text-xs text-muted-foreground">
                      {item.statusReason ?? item.statusSummary}
                    </p>
                  ) : null}
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
    </div>
  );
}

function RecipeOpsMobileCard({
  item,
  boardLabel,
  selected,
  onSelectedChange,
}: {
  item: RecipeOpsListItem;
  boardLabel: string;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
}) {
  const statusDetail = item.statusReason ?? item.statusSummary;

  return (
    <article className="rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelectedChange(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border border-border"
          aria-label={`Select recipe ${item.title}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 font-medium leading-5">{item.title}</p>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{boardLabel}</p>
          {item.status !== "recipe_ready" ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{statusDetail}</p>
          ) : null}
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Updated {formatDate(item.updatedAt)}</span>
            <Link
              href={`/settings/recipes/${item.recipeId}`}
              className="shrink-0 font-medium text-foreground underline underline-offset-4"
            >
              Details
            </Link>
          </div>
        </div>
      </div>
    </article>
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
      {pending ? "Starting job..." : children}
    </Button>
  );
}

function RecipeParseJobsPanel({
  jobs,
  onRefresh,
  refreshing,
  cancelFormAction,
  resumeFormAction,
}: {
  jobs: RecipeParseJobSummary[];
  onRefresh: () => void;
  refreshing: boolean;
  cancelFormAction: (payload: FormData) => void;
  resumeFormAction: (payload: FormData) => void;
}) {
  const activeJobs = jobs.filter(
    (job) => job.canCancel || job.canResume || ["queued", "running", "cancelling"].includes(job.status),
  );
  const recentJobs = jobs.filter((job) => !activeJobs.some((activeJob) => activeJob.jobId === job.jobId));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <RecentJobsDialog jobs={recentJobs} />
      </div>

      {activeJobs.length > 0 ? (
        <div className="space-y-3 rounded-[24px] border border-border/60 bg-background/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-medium">Current bulk parse job</h3>
              <p className="text-sm text-muted-foreground">
                Refresh to check progress or cancel the active parse immediately.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh jobs"}
            </Button>
          </div>

          <div className="grid gap-3">
            {activeJobs.map((job) => (
              <div
                key={job.jobId}
                className="rounded-[20px] border border-border/60 bg-secondary/10 p-4"
              >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Job {job.jobId.slice(0, 8)}</span>
                  <StatusPill status={job.status} />
                  <span className="text-sm text-muted-foreground">{job.currentPhase}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Requested by {job.requestedByLabel} on {formatDate(job.createdAt)}
                </p>
                <p className="text-sm">
                  {job.processedRecipes}/{job.totalRecipes} processed ({job.percentComplete}%)
                </p>
                <p className="text-sm text-muted-foreground">
                  Success {job.succeededRecipes} • Review {job.reviewNeededRecipes} • Failed {job.failedRecipes}
                  {job.cancelledRecipes > 0 ? ` • Cancelled ${job.cancelledRecipes}` : ""}
                </p>
                {job.lastHeartbeatAt ? (
                  <p className="text-xs text-muted-foreground">
                    Last update {formatDate(job.lastHeartbeatAt)}
                  </p>
                ) : null}
                {job.lastError ? (
                  <p className="text-xs text-destructive">{job.lastError}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {job.canResume ? (
                  <form action={resumeFormAction}>
                    <input type="hidden" name="jobId" value={job.jobId} />
                    <Button type="submit" variant="secondary">
                      Resume job
                    </Button>
                  </form>
                ) : null}
                {job.canCancel ? (
                  <form action={cancelFormAction}>
                    <input type="hidden" name="jobId" value={job.jobId} />
                    <Button type="submit" variant="outline">
                      {job.status === "cancelling" ? "Cancelling..." : "Cancel job now"}
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RecentJobsDialog({ jobs }: { jobs: RecipeParseJobSummary[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Recent jobs{jobs.length > 0 ? ` (${jobs.length})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(80vh,42rem)] flex-col p-5 sm:w-[min(92vw,38rem)]">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>Recent jobs</DialogTitle>
          <DialogDescription>Latest completed or cancelled bulk re-parse jobs.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 min-h-0 space-y-2 overflow-y-auto pr-1">
          {jobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No completed jobs yet.</p>
          ) : jobs.map((job) => (
            <div
              key={job.jobId}
              className="rounded-2xl border border-border/60 bg-secondary/10 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex items-center gap-2">
                  <StatusPill status={job.status} />
                  <span className="text-xs text-muted-foreground">
                    Ran {formatDate(job.startedAt ?? job.createdAt)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{job.totalRecipes} recipes</span>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Success {job.succeededRecipes} <span aria-hidden="true">•</span> Review {job.reviewNeededRecipes} <span aria-hidden="true">•</span> Failed {job.failedRecipes}
                {job.cancelledRecipes > 0 ? (
                  <> <span aria-hidden="true">•</span> Cancelled {job.cancelledRecipes}</>
                ) : null}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusPill({ status }: { status: RecipeParseJobSummary["status"] }) {
  const label = status.replaceAll("_", " ");

  return (
    <span className="rounded-full border border-border/60 px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}
