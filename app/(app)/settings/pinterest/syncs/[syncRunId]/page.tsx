import { notFound } from "next/navigation";

import { AppTransitionLink } from "@/components/app-transition-link";
import { ActivityIndicator } from "@/components/activity-indicator";
import { LocalDateTime } from "@/components/local-date-time";
import { PinterestSyncProgress } from "@/components/pinterest-sync-progress";
import { ActionForm } from "@/components/action-form";
import { cancelPinterestSyncAction, retryPinterestSyncAction } from "@/lib/actions/board-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isAuthorizationError } from "@/lib/server/errors";
import { getPinterestSyncRunDetail } from "@/lib/server/queries";
import { formatPinterestSyncTrigger } from "@/lib/server/sync";
import { requireOwnerOrAdminIntegrationAccess } from "@/lib/server/access";

export const dynamic = "force-dynamic";

export default async function PinterestSyncDetailPage({ params }: { params: Promise<{ syncRunId: string }> }) {
  try {
    await requireOwnerOrAdminIntegrationAccess();
  } catch (error) {
    if (isAuthorizationError(error)) notFound();
    throw error;
  }
  const { syncRunId } = await params;
  const detail = await getPinterestSyncRunDetail(syncRunId);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Sync details</CardTitle><CardDescription><LocalDateTime value={detail.run.startedAt} /> · {formatPinterestSyncTrigger(detail.run.trigger)}</CardDescription></div><Badge variant={detail.run.status === "success" ? "success" : detail.run.status === "error" ? "destructive" : "secondary"}>{detail.run.status === "running" ? <ActivityIndicator label="Pinterest sync running" className="mr-1.5" /> : null}{detail.run.status}</Badge></div>
          {detail.run.message ? <p className="text-sm text-destructive">{detail.run.message}</p> : null}
          {detail.isLatestRun && detail.run.status === "error" && detail.job?.status === "error" ? <ActionForm action={retryPinterestSyncAction} fields={{ syncRunId }}>Retry sync</ActionForm> : null}
          {(detail.job?.status === "queued" || detail.job?.status === "running") ? <ActionForm action={cancelPinterestSyncAction} fields={{ syncRunId }} buttonVariant="secondary">Cancel sync</ActionForm> : null}
        </CardHeader>
        <CardContent className="space-y-4">{detail.run.status === "running" ? <PinterestSyncProgress run={detail.run} /> : null}<div className="grid gap-3 sm:grid-cols-4"><Stat label="Boards" value={detail.run.boardCount} />{detail.run.trigger !== "auto_new_pins" ? <Stat label="Pins read" value={detail.run.status === "running" ? detail.run.processedPinCount : detail.run.pinCount} /> : null}<Stat label="Added" value={detail.run.createdRecipeCount} /><Stat label="Removed / restored" value={`${detail.run.removedRecipeCount} / ${detail.run.restoredRecipeCount}`} /></div></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Modified recipes</CardTitle><CardDescription>Recipes created, removed, or restored by this sync.</CardDescription></CardHeader>
        <CardContent><div className="space-y-3 md:hidden">{detail.changes.length === 0 ? <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">This sync did not modify any recipes.</p> : null}{detail.changes.map((change) => <div key={change.syncRecipeChangeId} className="rounded-2xl border border-border/60 p-4"><div className="flex items-center justify-between gap-3"><Badge variant="outline" className="capitalize">{change.changeType}</Badge><span className="text-xs text-muted-foreground"><LocalDateTime value={change.createdAt} /></span></div><p className="mt-2 font-medium">{change.recipeExists ? <AppTransitionLink href={`/settings/recipes/${change.recipeId}`} className="text-primary underline-offset-4 hover:underline">{change.title}</AppTransitionLink> : change.title}</p></div>)}</div><div className="hidden md:block"><Table><TableHeader><TableRow><TableHead>Change</TableHead><TableHead>Recipe</TableHead><TableHead>Recorded</TableHead></TableRow></TableHeader><TableBody>{detail.changes.length === 0 ? <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">This sync did not modify any recipes.</TableCell></TableRow> : null}{detail.changes.map((change) => <TableRow key={change.syncRecipeChangeId}><TableCell className="capitalize">{change.changeType}</TableCell><TableCell>{change.recipeExists ? <AppTransitionLink href={`/settings/recipes/${change.recipeId}`} className="text-primary underline-offset-4 hover:underline">{change.title}</AppTransitionLink> : change.title}</TableCell><TableCell><LocalDateTime value={change.createdAt} /></TableCell></TableRow>)}</TableBody></Table></div></CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-[18px] bg-secondary/30 px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
