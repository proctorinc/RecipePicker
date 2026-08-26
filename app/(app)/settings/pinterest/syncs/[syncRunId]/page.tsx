import { notFound } from "next/navigation";

import { AppTransitionLink } from "@/components/app-transition-link";
import { SettingsNav } from "@/components/settings-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isAuthorizationError } from "@/lib/server/errors";
import { getPinterestSyncRunDetail } from "@/lib/server/queries";
import { requireOwnerOrAdminIntegrationAccess } from "@/lib/server/access";
import { formatDate } from "@/lib/utils";

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
      <SettingsNav currentPath="/settings/pinterest" />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Sync details</CardTitle><CardDescription>{formatDate(detail.run.startedAt)} · {detail.run.trigger === "auto_feed_load" ? "Automatic" : detail.run.trigger === "force" ? "Force resync" : "Manual"}</CardDescription></div><Badge variant={detail.run.status === "success" ? "success" : detail.run.status === "error" ? "destructive" : "secondary"}>{detail.run.status}</Badge></div>
          {detail.run.message ? <p className="text-sm text-destructive">{detail.run.message}</p> : null}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4"><Stat label="Boards" value={detail.run.boardCount} /><Stat label="Pins read" value={detail.run.pinCount} /><Stat label="Added" value={detail.run.createdRecipeCount} /><Stat label="Removed / restored" value={`${detail.run.removedRecipeCount} / ${detail.run.restoredRecipeCount}`} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Modified recipes</CardTitle><CardDescription>Recipes created, removed, or restored by this sync.</CardDescription></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>Change</TableHead><TableHead>Recipe</TableHead><TableHead>Recorded</TableHead></TableRow></TableHeader><TableBody>{detail.changes.length === 0 ? <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">This sync did not modify any recipes.</TableCell></TableRow> : null}{detail.changes.map((change) => <TableRow key={change.syncRecipeChangeId}><TableCell className="capitalize">{change.changeType}</TableCell><TableCell>{change.recipeExists ? <AppTransitionLink href={`/settings/recipes/${change.recipeId}`} className="text-primary underline-offset-4 hover:underline">{change.title}</AppTransitionLink> : change.title}</TableCell><TableCell>{formatDate(change.createdAt)}</TableCell></TableRow>)}</TableBody></Table></CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-[18px] bg-secondary/30 px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
