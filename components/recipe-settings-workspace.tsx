"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, ChevronDown, Circle, Dot, MessageSquarePlus, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  saveExtractionFeedbackAction,
  saveRecipeContentAction,
  saveRecipeFeedbackAction,
} from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import { formatIngredientUnit } from "@/lib/ingredient-units";
import { formatStatusLabel } from "@/lib/server/status";
import { formatDate } from "@/lib/utils";
import type { RecipeExtractionFeedbackCategory, RecipeOpsDetail } from "@/types/view-models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const initialActionState: ActionState = {
  status: "idle",
  message: "",
};

const feedbackCategoryOptions: Array<{
  value: RecipeExtractionFeedbackCategory;
  label: string;
  description: string;
}> = [
  { value: "missing_ingredients", label: "Missing ingredients", description: "The ingredient list was incomplete or skipped items." },
  { value: "missing_steps", label: "Missing steps", description: "Instructions were incomplete or sections were dropped." },
  { value: "wrong_order", label: "Wrong order", description: "Ingredients or steps were present but out of order." },
  { value: "wrong_recipe_selected", label: "Wrong recipe selected", description: "The parser chose the wrong recipe candidate." },
  { value: "formatting_only", label: "Formatting only", description: "The content is mostly right but needs cleanup." },
  { value: "source_problem", label: "Source problem", description: "The source page itself blocked or confused extraction." },
  { value: "other", label: "Other", description: "Anything else worth capturing for future runs." },
];

export function RecipeSettingsWorkspace({ detail }: { detail: RecipeOpsDetail }) {
  return (
    <Tabs defaultValue="content" className="space-y-6">
      <TabsList className="grid w-full grid-cols-4 rounded-2xl sm:inline-flex sm:w-auto sm:rounded-full">
        <TabsTrigger className="px-2 text-xs sm:px-4 sm:text-sm" value="content">Content</TabsTrigger>
        <TabsTrigger className="px-2 text-xs sm:px-4 sm:text-sm" value="feedback">Feedback</TabsTrigger>
        <TabsTrigger className="px-2 text-xs sm:px-4 sm:text-sm" value="history">History</TabsTrigger>
        <TabsTrigger className="px-2 text-xs sm:px-4 sm:text-sm" value="diagnostics">Details</TabsTrigger>
      </TabsList>

      <TabsContent value="content">
        <RecipeContentEditor detail={detail} />
      </TabsContent>

      <TabsContent value="feedback">
        <div className="space-y-6">
          <RecipeFeedbackEditor detail={detail} />
          <Card>
            <CardHeader>
              <CardTitle>Latest run feedback</CardTitle>
              <CardDescription>
                Capture what went wrong on the newest run so future parsing attempts have better context.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RunFeedbackForm recipeId={detail.recipeId} extractionId={detail.history[0]?.extractionId ?? null} />
              <FeedbackList feedback={detail.latestRunFeedback} />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="history">
        <div className="space-y-4">
          {detail.history.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No extraction history has been recorded yet.
              </CardContent>
            </Card>
          ) : (
            detail.history.map((entry) => <HistoryEntryCard key={entry.extractionId} recipeId={detail.recipeId} entry={entry} />)
          )}
        </div>
      </TabsContent>

      <TabsContent value="diagnostics">
        <DiagnosticsPanel detail={detail} />
      </TabsContent>
    </Tabs>
  );
}

function RecipeContentEditor({ detail }: { detail: RecipeOpsDetail }) {
  const [steps, setSteps] = useState(detail.steps);
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(saveRecipeContentAction, initialActionState);

  useEffect(() => {
    setSteps(detail.steps);
  }, [detail.steps]);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  const hasContent = detail.ingredients.length > 0 || steps.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Editable recipe content</CardTitle>
        <CardDescription>
          Review ingredient parsing in a structured grid, then edit instruction text here when recipe cleanup is needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">Ingredients</h3>
              <p className="text-sm text-muted-foreground">
                See how each ingredient was parsed and matched for search and ingredient-family lookups.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/settings/ingredients?recipeId=${encodeURIComponent(detail.recipeId)}`}>
                Manage ingredient matches
              </Link>
            </Button>
          </div>
          {detail.ingredients.length > 0 ? (
            <>
            <div className="space-y-2 md:hidden">
              {detail.ingredients.map((ingredient) => (
                <div key={ingredient.id} className="rounded-2xl border border-border/60 bg-secondary/10 p-3">
                  <p className="font-medium">{ingredient.originalText}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{formatParsedAmount(ingredient.amount, ingredient.unit)}</span>
                    <span>{ingredient.canonicalName ?? "No match"}</span>
                    <Badge variant={ingredient.normalizationStatus === "needs_review" ? "warning" : "outline"}>
                      {formatIngredientStatus(ingredient.normalizationStatus)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-[24px] border border-border/60 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingredient</TableHead>
                    <TableHead>Parsed amount</TableHead>
                    <TableHead>Parsed ingredient</TableHead>
                    <TableHead>Search match</TableHead>
                    <TableHead>Hierarchy</TableHead>
                    <TableHead>Signals</TableHead>
                    <TableHead className="text-right">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.ingredients.map((ingredient) => (
                    <TableRow key={ingredient.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{ingredient.originalText}</p>
                          {ingredient.notes ? <p className="text-xs text-muted-foreground">{ingredient.notes}</p> : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatParsedAmount(ingredient.amount, ingredient.unit)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p>{ingredient.parsedText ?? "Not parsed"}</p>
                          {ingredient.attributes.length > 0 ? (
                            <p className="text-xs text-muted-foreground">Attributes: {ingredient.attributes.join(", ")}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p>{ingredient.canonicalName ?? "No canonical match yet"}</p>
                          <p className="text-xs text-muted-foreground">
                            {ingredient.canonicalName
                              ? `This is what recipe search will match against.`
                              : "Search will rely on raw ingredient text until you manage the match."}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p>{ingredient.parentCanonicalName ?? "No family assigned"}</p>
                          <p className="text-xs text-muted-foreground">
                            {ingredient.parentCanonicalName
                              ? `${ingredient.canonicalName ?? "Ingredient"} rolls up under this family for broader search.`
                              : "No broader ingredient family is attached yet."}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={ingredient.normalizationStatus === "needs_review" ? "warning" : "outline"}>
                            {formatIngredientStatus(ingredient.normalizationStatus)}
                          </Badge>
                          {ingredient.ingredientKind ? <Badge variant="outline">{ingredient.ingredientKind}</Badge> : null}
                          {ingredient.matchConfidence ? <Badge variant="outline">{ingredient.matchConfidence}% confidence</Badge> : null}
                          {ingredient.matchedBy ? <Badge variant="secondary">{formatMatchSource(ingredient.matchedBy)}</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant={ingredient.normalizationStatus === "needs_review" ? "secondary" : "ghost"} size="sm">
                          <Link href={`/settings/ingredients?recipeId=${encodeURIComponent(detail.recipeId)}`}>
                            {ingredient.normalizationStatus === "needs_review" ? "Resolve" : "Manage"}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          ) : (
            <div className="rounded-[24px] border border-dashed border-border/60 bg-secondary/10 p-6">
              <p className="font-medium">No structured ingredients are available yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {detail.recommendedNextStep}
              </p>
            </div>
          )}
        </section>

        {hasContent ? (
          <>
          <form ref={formRef} onSubmit={(event) => { event.preventDefault(); setSaveChoiceOpen(true); }} className="space-y-8">
            <input type="hidden" name="recipeId" value={detail.recipeId} />
            <input type="hidden" name="stepsJson" value={JSON.stringify(steps)} />

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">Instructions</h3>
                  <p className="text-sm text-muted-foreground">Edit step text and optional section labels.</p>
                </div>
                <Badge variant="outline">{steps.length} steps</Badge>
              </div>
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={step.id} className="rounded-[24px] border border-border/60 bg-white/70 p-4">
                    <p className="mb-3 text-sm font-medium">Step {index + 1}</p>
                    <div className="space-y-3">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Section label</span>
                        <Input
                          value={step.section ?? ""}
                          placeholder="Optional section"
                          onChange={(event) => {
                            const next = [...steps];
                            next[index] = {
                              ...step,
                              section: event.target.value || null,
                            };
                            setSteps(next);
                          }}
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium">Instruction</span>
                        <Textarea
                          value={step.text}
                          onChange={(event) => {
                            const next = [...steps];
                            next[index] = {
                              ...step,
                              text: event.target.value,
                            };
                            setSteps(next);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <FormSubmitButton>Save recipe edits</FormSubmitButton>
          </form>
          <Dialog open={saveChoiceOpen} onOpenChange={setSaveChoiceOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Save recipe edits</DialogTitle><DialogDescription>Choose whether these instruction changes update the current version or start a new version.</DialogDescription></DialogHeader>
              <div className="flex flex-col gap-6">
                <button
                  type="button"
                  onClick={() => { const form = formRef.current; if (!form) return; const data = new FormData(form); data.set("versionMode", "new"); formAction(data); setSaveChoiceOpen(false); }}
                  className="self-center text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  Create a new version
                </button>
                <Button type="button" onClick={() => { const form = formRef.current; if (!form) return; const data = new FormData(form); data.set("versionMode", "update"); formAction(data); setSaveChoiceOpen(false); }}>Save current version</Button>
              </div>
            </DialogContent>
          </Dialog>
          </>
        ) : (
          <div className="rounded-[24px] border border-dashed border-border/60 bg-secondary/10 p-6">
            <p className="font-medium">No structured recipe content is available yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">{detail.recommendedNextStep}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecipeFeedbackEditor({ detail }: { detail: RecipeOpsDetail }) {
  const [summary, setSummary] = useState(detail.recipeFeedback?.summary ?? "");
  const [note, setNote] = useState(detail.recipeFeedback?.note ?? "");
  const [state, formAction] = useActionState(saveRecipeFeedbackAction, initialActionState);

  useEffect(() => {
    setSummary(detail.recipeFeedback?.summary ?? "");
    setNote(detail.recipeFeedback?.note ?? "");
  }, [detail.recipeFeedback]);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reusable recipe guidance</CardTitle>
        <CardDescription>
          Save advice that should remain true across future runs for this same recipe source.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="recipeId" value={detail.recipeId} />
          <label className="block space-y-2">
            <span className="text-sm font-medium">Short summary</span>
            <Input
              name="summary"
              value={summary}
              placeholder="Example: This source hides the full ingredient list below the fold."
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Detailed guidance</span>
            <Textarea
              name="note"
              value={note}
              placeholder="Describe what should be preserved, corrected, or watched for during future re-runs."
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {detail.recipeFeedback?.updatedAt ? (
            <p className="text-xs text-muted-foreground">Last updated {formatDate(detail.recipeFeedback.updatedAt)}</p>
          ) : null}
          <FormSubmitButton>Save recipe guidance</FormSubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function RunFeedbackForm({
  recipeId,
  extractionId,
}: {
  recipeId: string;
  extractionId: string | null;
}) {
  const [category, setCategory] = useState<RecipeExtractionFeedbackCategory>("missing_steps");
  const [note, setNote] = useState("");
  const [state, formAction] = useActionState(saveExtractionFeedbackAction, initialActionState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      setNote("");
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-4 rounded-[24px] border border-border/60 bg-secondary/10 p-4">
      <input type="hidden" name="recipeId" value={recipeId} />
      <input type="hidden" name="extractionId" value={extractionId ?? ""} />
      <div className="flex items-center gap-2">
        <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">Record what happened on this run</p>
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Issue type</span>
        <select
          name="category"
          value={category}
          onChange={(event) => setCategory(event.target.value as RecipeExtractionFeedbackCategory)}
          className="h-11 w-full rounded-[18px] border border-border bg-background px-4 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
        >
          {feedbackCategoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {feedbackCategoryOptions.find((option) => option.value === category)?.description}
        </p>
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">What should future runs know?</span>
        <Textarea
          name="note"
          value={note}
          placeholder="Example: The selected attempt skipped the second instruction section after the embedded video."
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <FormSubmitButton>Save run feedback</FormSubmitButton>
    </form>
  );
}

function HistoryEntryCard({
  recipeId,
  entry,
}: {
  recipeId: string;
  entry: RecipeOpsDetail["history"][number];
}) {
  const selectedAttempt = entry.attempts.find((attempt) => attempt.selected) ?? entry.attempts[0] ?? null;
  const pipelineSteps = buildPipelineSteps(entry.attempts);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{formatStatusLabel(toHistoryStatus(entry.status))}</Badge>
              {entry.lowConfidence ? <Badge>Low confidence</Badge> : null}
              {entry.feedback.length > 0 ? <Badge variant="outline">{entry.feedback.length} feedback note{entry.feedback.length === 1 ? "" : "s"}</Badge> : null}
            </div>
            <CardTitle className="text-lg">{formatDate(entry.createdAt)}</CardTitle>
            <CardDescription>{entry.summary}</CardDescription>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>{selectedAttempt?.fetchStrategy ?? entry.fetchStrategy ?? "No fetch strategy"}</p>
            <p>{selectedAttempt?.method ?? entry.method ?? "No method"}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoPill label="Confidence" value={entry.confidence ?? "n/a"} />
          <InfoPill label="Score" value={entry.qualityScore !== null ? String(entry.qualityScore) : "n/a"} />
          <InfoPill label="Warnings" value={entry.warnings.length > 0 ? String(entry.warnings.length) : "None"} />
        </div>

        <PipelineProgress steps={pipelineSteps} />

        <RunFeedbackForm recipeId={recipeId} extractionId={entry.extractionId} />
        <FeedbackList feedback={entry.feedback} />

        <details className="group rounded-[24px] border border-border/60 bg-background/80 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
            Expand diagnostics for this run
            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <div className="mt-4 space-y-4">
            {entry.failureReason ? (
              <div className="rounded-[20px] bg-destructive/10 p-4 text-sm text-foreground">
                <p className="font-medium">Failure reason</p>
                <p className="mt-1 text-muted-foreground">{entry.failureReason}</p>
              </div>
            ) : null}
            <JsonBlock title="Quality signals" value={entry.qualitySignals} />
            <JsonBlock title="Saved payload" value={entry.payload} />
            <div className="space-y-3">
              <p className="text-sm font-medium">Attempt candidates</p>
              {entry.attempts.map((attempt) => (
                <div key={attempt.attemptId} className="rounded-[20px] bg-secondary/15 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={attempt.selected ? "default" : "outline"}>
                      {attempt.selected ? "Selected" : "Candidate"}
                    </Badge>
                    <Badge variant="outline">{attempt.fetchStrategy}</Badge>
                    <Badge variant="outline">{attempt.method ?? "n/a"}</Badge>
                    <Badge variant="outline">{attempt.confidence ?? "n/a"}</Badge>
                  </div>
                  {attempt.failureReason ? <p className="mt-3 text-sm text-muted-foreground">{attempt.failureReason}</p> : null}
                  <JsonBlock title="Attempt payload" value={attempt.payload} compact />
                </div>
              ))}
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function DiagnosticsPanel({ detail }: { detail: RecipeOpsDetail }) {
  const selectedAttempt = useMemo(
    () => detail.latestAttempts.find((attempt) => attempt.selected) ?? detail.latestAttempts[0] ?? null,
    [detail.latestAttempts],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raw diagnostics</CardTitle>
        <CardDescription>
          The raw payloads and attempt data are still here when you need them, but they stay out of the way by default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="payload">
          <TabsList>
            <TabsTrigger value="payload">Selected payload</TabsTrigger>
            <TabsTrigger value="attempts">All attempts</TabsTrigger>
            <TabsTrigger value="signals">Quality signals</TabsTrigger>
          </TabsList>
          <TabsContent value="payload" className="space-y-4">
            <JsonBlock title="Latest payload snapshot" value={detail.latestExtractionPayload} />
            {selectedAttempt ? <JsonBlock title="Selected attempt payload" value={selectedAttempt.payload} /> : null}
          </TabsContent>
          <TabsContent value="attempts">
            <div className="space-y-4">
              {detail.latestAttempts.map((attempt) => (
                <div key={attempt.attemptId} className="rounded-[24px] border border-border/60 bg-secondary/10 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant={attempt.selected ? "default" : "outline"}>
                      {attempt.selected ? "Selected" : "Candidate"}
                    </Badge>
                    <Badge variant="outline">{attempt.fetchStrategy}</Badge>
                    <Badge variant="outline">{attempt.method ?? "n/a"}</Badge>
                    <Badge variant="outline">{attempt.qualityScore ?? "n/a"}</Badge>
                  </div>
                  <JsonBlock title="Attempt payload" value={attempt.payload} compact />
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="signals" className="space-y-4">
            <JsonBlock title="Latest extraction quality signals" value={detail.latestQualitySignals} />
            {selectedAttempt ? <JsonBlock title="Selected attempt quality signals" value={selectedAttempt.qualitySignals} /> : null}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function PipelineProgress({
  steps,
}: {
  steps: Array<{
    key: string;
    label: string;
    description: string;
    state: "selected" | "succeeded" | "failed" | "not_tried";
  }>;
}) {
  return (
    <div className="rounded-[24px] border border-border/60 bg-secondary/10 p-4">
      <div className="mb-4">
        <p className="text-sm font-medium">Parsing progress</p>
        <p className="text-sm text-muted-foreground">
          Stages run in order. Later stages only run if earlier ones do not already produce a strong enough result.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => (
          <div key={step.key} className="relative rounded-[20px] border border-border/50 bg-background/90 p-4">
            {index < steps.length - 1 ? (
              <div className="absolute -right-2 top-7 hidden h-px w-4 bg-border xl:block" />
            ) : null}
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{renderStepIcon(step.state)}</div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{step.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                <div className="mt-2">
                  <Badge variant={pipelineBadgeVariant(step.state)}>{pipelineStateLabel(step.state)}</Badge>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedbackList({
  feedback,
}: {
  feedback: Array<{
    feedbackId: string;
    category?: RecipeExtractionFeedbackCategory;
    note: string;
    createdAt: string;
  }>;
}) {
  if (feedback.length === 0) {
    return <p className="text-sm text-muted-foreground">No feedback has been saved yet for this area.</p>;
  }

  return (
    <div className="space-y-3">
      {feedback.map((item) => (
        <div key={item.feedbackId} className="rounded-[20px] border border-border/60 bg-white/80 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {item.category ? <Badge variant="outline">{formatFeedbackCategory(item.category)}</Badge> : null}
            <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
          </div>
          <p className="mt-2 text-sm leading-6">{item.note}</p>
        </div>
      ))}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-secondary/20 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-medium">{value}</p>
    </div>
  );
}

function JsonBlock({
  title,
  value,
  compact = false,
}: {
  title: string;
  value: Record<string, unknown> | null;
  compact?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <pre className={compact ? "overflow-x-auto rounded-[18px] bg-secondary/20 p-3 text-xs leading-6" : "overflow-x-auto rounded-[20px] bg-secondary/20 p-4 text-xs leading-6"}>
        {JSON.stringify(value, null, 2) ?? "null"}
      </pre>
    </div>
  );
}

function FormSubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : children}
    </Button>
  );
}

function formatFeedbackCategory(category: RecipeExtractionFeedbackCategory) {
  return feedbackCategoryOptions.find((option) => option.value === category)?.label ?? category;
}

function formatParsedAmount(amount: string | null, unit: string | null) {
  if (!amount && !unit) {
    return "Not parsed";
  }

  return [amount, formatIngredientUnit(unit)].filter(Boolean).join(" ");
}

function formatIngredientStatus(status: RecipeOpsDetail["ingredients"][number]["normalizationStatus"]) {
  switch (status) {
    case "needs_review":
      return "Needs review";
    case "confirmed":
      return "Confirmed";
    case "auto_matched":
    default:
      return "Auto-matched";
  }
}

function formatMatchSource(value: string) {
  return value.replaceAll("_", " ");
}

function buildPipelineSteps(
  attempts: RecipeOpsDetail["history"][number]["attempts"],
) {
  const directAttempts = attempts.filter((attempt) => attempt.fetchStrategy === "direct_http_html");
  const anchorAttempts = attempts.filter((attempt) => attempt.fetchStrategy === "recipe_anchor_follow");
  const browserAttempts = attempts.filter((attempt) => attempt.fetchStrategy === "browser_rendered_html");
  const readerAttempts = attempts.filter((attempt) => attempt.fetchStrategy === "browser_reader_text");
  const aiAttempts = attempts.filter((attempt) => attempt.fetchStrategy === "ai_extraction");
  const pinterestTextAttempts = attempts.filter((attempt) => attempt.fetchStrategy === "pinterest_description");
  const imageOcrAttempts = attempts.filter((attempt) => attempt.fetchStrategy === "pin_image_ocr");
  const videoAttempts = attempts.filter((attempt) => attempt.fetchStrategy === "pinterest_video");
  const attemptedStrategies = new Set(attempts.map((attempt) => attempt.fetchStrategy));

  return [
    describePipelineStep("direct_html", "HTML fetch + parser", directAttempts, attemptedStrategies, "direct_http_html"),
    describePipelineStep("anchor_html", "Jump-to-recipe focus", anchorAttempts, attemptedStrategies, "recipe_anchor_follow"),
    describePipelineStep("browser_html", "Browser render", browserAttempts, attemptedStrategies, "browser_rendered_html"),
    describePipelineStep("reader_text", "Visible text pass", readerAttempts, attemptedStrategies, "browser_reader_text"),
    describePipelineStep("ai_structured", "AI extraction", aiAttempts, attemptedStrategies, "ai_extraction"),
    describePipelineStep("pinterest_text", "Pinterest text", pinterestTextAttempts, attemptedStrategies, "pinterest_description"),
    describePipelineStep("image_ocr", "Image OCR", imageOcrAttempts, attemptedStrategies, "pin_image_ocr"),
    describePipelineStep("video_ai", "Video + audio AI", videoAttempts, attemptedStrategies, "pinterest_video"),
  ];
}

function describePipelineStep(
  key: string,
  label: string,
  attempts: RecipeOpsDetail["history"][number]["attempts"],
  attemptedStrategies: Set<string>,
  strategy: RecipeOpsDetail["history"][number]["attempts"][number]["fetchStrategy"],
) {
  if (attempts.length === 0) {
    return {
      key,
      label,
      description: describeUntriedStep(strategy, attemptedStrategies),
      state: "not_tried" as const,
    };
  }

  if (attempts.some((attempt) => attempt.selected)) {
    return {
      key,
      label,
      description: "This stage produced the selected result for this run.",
      state: "selected" as const,
    };
  }

  if (attempts.some((attempt) => attempt.status === "recipe_extracted")) {
    return {
      key,
      label,
      description: "This stage produced a candidate recipe, but another stage ranked higher.",
      state: "succeeded" as const,
    };
  }

  return {
    key,
    label,
    description: attempts[0]?.failureReason ?? "This stage was tried but did not produce a usable recipe result.",
    state: "failed" as const,
  };
}

function describeUntriedStep(
  strategy: RecipeOpsDetail["history"][number]["attempts"][number]["fetchStrategy"],
  attemptedStrategies: Set<string>,
) {
  if (strategy === "recipe_anchor_follow" && attemptedStrategies.has("direct_http_html")) {
    return "Not tried on this run. No focused jump-to-recipe section was extracted.";
  }

  if (strategy === "browser_reader_text" && attemptedStrategies.has("browser_rendered_html")) {
    return "Not tried on this run. No useful visible-text pass was recorded after browser rendering.";
  }

  if (strategy === "browser_rendered_html" || strategy === "ai_extraction" || strategy === "pinterest_description" || strategy === "pin_image_ocr" || strategy === "pinterest_video") {
    return "Not tried on this run. An earlier stage likely stopped the pipeline first.";
  }

  return "Not tried on this run.";
}

function renderStepIcon(state: "selected" | "succeeded" | "failed" | "not_tried") {
  if (state === "selected") {
    return <CheckCircle2 className="h-5 w-5 text-foreground" />;
  }

  if (state === "succeeded") {
    return <Dot className="h-5 w-5 text-amber-700" />;
  }

  if (state === "failed") {
    return <XCircle className="h-5 w-5 text-rose-700" />;
  }

  return <Circle className="h-5 w-5 text-muted-foreground" />;
}

function pipelineStateLabel(state: "selected" | "succeeded" | "failed" | "not_tried") {
  switch (state) {
    case "selected":
      return "Selected";
    case "succeeded":
      return "Candidate";
    case "failed":
      return "Tried";
    case "not_tried":
    default:
      return "Not tried";
  }
}

function pipelineBadgeVariant(state: "selected" | "succeeded" | "failed" | "not_tried") {
  switch (state) {
    case "selected":
      return "default" as const;
    case "succeeded":
      return "warning" as const;
    case "failed":
      return "destructive" as const;
    case "not_tried":
    default:
      return "outline" as const;
  }
}

function toHistoryStatus(status: string) {
  if (status === "recipe_extracted") {
    return "recipe_ready";
  }

  if (status === "multiple_recipes_needs_review") {
    return "needs_review";
  }

  if (status === "extraction_failed") {
    return "extraction_failed";
  }

  if (status === "not_recipe" || status === "unsupported_page") {
    return "not_recipe";
  }

  return "not_extracted";
}
