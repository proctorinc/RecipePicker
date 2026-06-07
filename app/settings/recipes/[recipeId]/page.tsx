import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { RecipeSettingsWorkspace } from "@/components/recipe-settings-workspace";
import { SettingsNav } from "@/components/settings-nav";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { extractRecipeAction, rerunRecipeAction } from "@/lib/actions/operations";
import { getRecipeOpsDetail } from "@/lib/server/queries";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RecipeOpsDetailPage({ params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await params;
  const detail = await getRecipeOpsDetail(recipeId);

  if (!detail) {
    notFound();
  }

  const hasParsedBefore = detail.hasRecipeContent || Boolean(detail.latestExtractionStatus);
  const recipeAction = hasParsedBefore ? rerunRecipeAction : extractRecipeAction;
  const recipeActionLabel = hasParsedBefore ? "Re-fetch and re-parse" : "Extract recipe";
  const recipeActionVariant = hasParsedBefore ? "outline" : "secondary";

  return (
    <div className="space-y-6">
      <SettingsNav currentPath="/settings/recipes" />

      <Card className="overflow-hidden">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{detail.boardId}</Badge>
                {detail.latestFetchAt ? <Badge variant="outline">Last fetch {formatDate(detail.latestFetchAt)}</Badge> : null}
              </div>
              <div>
                <CardTitle className="text-2xl">{detail.title}</CardTitle>
                <CardDescription className="mt-2 max-w-3xl text-sm leading-6">
                  {detail.plainLanguageStatus}
                </CardDescription>
              </div>
            </div>
            <StatusBadge status={detail.status} />
          </div>

          <div className="flex flex-wrap gap-3">
            <ActionForm action={recipeAction} fields={{ recipeId: String(detail.recipeId) }} buttonVariant={recipeActionVariant}>
              {recipeActionLabel}
            </ActionForm>
            <Button asChild variant="ghost">
              <Link href={`/recipe/${detail.recipeId}`}>
                Open recipe page
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            {detail.sourceUrl ? (
              <Button asChild variant="ghost">
                <a href={detail.sourceUrl} target="_blank" rel="noreferrer">
                  Source URL
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What needs attention</CardTitle>
          <CardDescription>{detail.recommendedNextStep}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail.latestAttentionReason ? (
            <div className="rounded-[24px] bg-secondary/20 p-4">
              <p className="text-sm font-medium">Current attention reason</p>
              <p className="mt-2 text-sm text-muted-foreground">{detail.latestAttentionReason}</p>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <InfoRow label="Recipe content" value={detail.hasRecipeContent ? "Available for review" : "Not available yet"} />
            <InfoRow
              label="Ingredient reviews"
              value={detail.ingredientReviewCount > 0 ? `${detail.ingredientReviewCount} pending` : "No pending review"}
            />
            <InfoRow
              label="Latest extraction"
              value={detail.latestExtractionStatus ? detail.latestExtractionStatus.replaceAll("_", " ") : "No extraction history"}
            />
          </div>

          {detail.actionableIssues.length > 0 ? (
            <div className="space-y-2">
              {detail.actionableIssues.map((issue) => (
                <div key={issue} className="rounded-[20px] border border-border/60 bg-white/80 p-4 text-sm text-muted-foreground">
                  {issue}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing urgent is blocking this recipe right now.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Page preview</CardTitle>
          <CardDescription>
            A quick browser-captured snapshot of the source page so you can decide whether it even looks like a recipe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.latestPagePreviewDataUrl ? (
            <div className="overflow-hidden rounded-[24px] border border-border/60 bg-background/80">
              <img
                src={detail.latestPagePreviewDataUrl}
                alt={`Preview of ${detail.title} source page`}
                className="block h-auto w-full"
              />
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-border/60 bg-secondary/10 p-6">
              <p className="font-medium">No page preview has been captured yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Browser-assisted runs can save a preview here. If the latest run stopped before that stage, try re-fetching and re-parsing when you want a visual check.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <RecipeSettingsWorkspace detail={detail} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-secondary/35 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-medium">{value}</p>
    </div>
  );
}
