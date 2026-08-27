"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { cancelRecipeParseJobAction, resumeRecipeParseJobAction } from "@/lib/actions/operations";
import { StatusBadge } from "@/components/status-badge";
import { ActivityIndicator } from "@/components/activity-indicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const RECIPES_PER_PAGE = 25;

type BoardOption = {
  value: string;
  label: string;
};

const statusOptions: Array<{ value: PinStatus | "flagged"; label: string }> = [
  { value: "flagged", label: "Flagged" },
  { value: "recipe_ready", label: formatStatusLabel("recipe_ready") },
  { value: "not_extracted", label: formatStatusLabel("not_extracted") },
  { value: "needs_review", label: formatStatusLabel("needs_review") },
  { value: "extraction_failed", label: formatStatusLabel("extraction_failed") },
  { value: "not_recipe", label: formatStatusLabel("not_recipe") },
  { value: "removed", label: formatStatusLabel("removed") },
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
  const [titleFilter, setTitleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [state, formAction] = useActionState(rerunRecipesAction, initialState);
  const [cancelState, cancelFormAction] = useActionState(cancelRecipeParseJobAction, initialState);
  const [resumeState, resumeFormAction] = useActionState(resumeRecipeParseJobAction, initialState);
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();

  const filteredItems = useMemo(() => {
    const normalizedTitleFilter = titleFilter.trim().toLocaleLowerCase();

    return items.filter((item) => {
      if (normalizedTitleFilter && !item.title.toLocaleLowerCase().includes(normalizedTitleFilter)) {
        return false;
      }

      if (boardFilter !== "all" && item.boardId !== boardFilter) {
        return false;
      }

      if (statusFilter === "all" && item.status === "removed") {
        return false;
      }

      if (statusFilter === "flagged" && !item.isFlagged) {
        return false;
      }

      if (statusFilter !== "all" && statusFilter !== "flagged" && item.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [boardFilter, items, statusFilter, titleFilter]);

  const filteredIds = filteredItems.map((item) => item.recipeId);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / RECIPES_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const firstItemIndex = (currentPage - 1) * RECIPES_PER_PAGE;
  const pageItems = filteredItems.slice(firstItemIndex, firstItemIndex + RECIPES_PER_PAGE);
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

  useEffect(() => {
    setPage(1);
  }, [boardFilter, statusFilter, titleFilter]);

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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-2">
              <span className="sr-only">Filter by recipe title</span>
              <Input
                type="search"
                value={titleFilter}
                onChange={(event) => setTitleFilter(event.target.value)}
                placeholder="Search recipe titles"
                className="h-11 rounded-full bg-background/90 px-4 shadow-sm"
              />
            </label>
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

      <div className="max-h-[60vh] space-y-2 overflow-y-auto overscroll-contain pr-1 md:hidden">
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            No recipes match the current filters.
          </div>
        ) : null}
        {pageItems.map((item) => (
          <RecipeOpsMobileCard
            key={item.recipeId}
            item={item}
            boardLabel={boardOptions.find((option) => option.value === item.boardId)?.label ?? item.boardId}
            selected={selectedRecipeIds.includes(item.recipeId)}
            onSelectedChange={(checked) => toggleRecipe(item.recipeId, checked)}
          />
        ))}
      </div>

      <div className="hidden max-h-[60vh] overflow-auto overscroll-contain rounded-2xl border border-border/60 md:block">
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
          {pageItems.map((item) => (
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

      {filteredItems.length > 0 ? (
        <RecipeListPagination
          currentPage={currentPage}
          firstItemIndex={firstItemIndex}
          onPageChange={setPage}
          totalItems={filteredItems.length}
          totalPages={totalPages}
        />
      ) : null}
    </div>
  );
}

function RecipeListPagination({
  currentPage,
  firstItemIndex,
  onPageChange,
  totalItems,
  totalPages,
}: {
  currentPage: number;
  firstItemIndex: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  totalPages: number;
}) {
  const lastItemIndex = Math.min(firstItemIndex + RECIPES_PER_PAGE, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {firstItemIndex + 1}–{lastItemIndex} of {totalItems} recipes
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
          <Button type="button" variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>
            Next
          </Button>
        </div>
      ) : null}
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
      {pending ? <><ActivityIndicator label="Starting parse job" className="mr-2 h-4 w-4" />Starting job...</> : children}
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
              {refreshing ? <><ActivityIndicator label="Refreshing jobs" className="mr-2 h-4 w-4" />Refreshing...</> : "Refresh jobs"}
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
                  <JobPhase status={job.status} phase={job.currentPhase} />
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
  const active = ["queued", "running", "cancelling"].includes(status);

  return (
    <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
      {active ? <ActivityIndicator label={`${label} parse job`} className="mr-1.5" /> : null}
      {label}
    </span>
  );
}

function JobPhase({ status, phase }: { status: RecipeParseJobSummary["status"]; phase: string }) {
  const active = ["queued", "running", "cancelling"].includes(status);

  return (
    <span className="inline-flex items-center text-sm text-muted-foreground">
      {phase}
      {active ? (
        <span className="status-activity-dots ml-1 inline-flex gap-0.5" aria-hidden="true">
          <span>•</span><span>•</span><span>•</span>
        </span>
      ) : null}
    </span>
  );
}
