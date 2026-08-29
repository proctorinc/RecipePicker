import { notFound } from "next/navigation";

import { AppTransitionLink } from "@/components/app-transition-link";
import { ActivityIndicator } from "@/components/activity-indicator";
import { LocalDateTime } from "@/components/local-date-time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isAuthorizationError } from "@/lib/server/errors";
import { getPinterestSyncHistory } from "@/lib/server/queries";
import { formatPinterestSyncTrigger } from "@/lib/server/sync";
import { requireOwnerOrAdminIntegrationAccess } from "@/lib/server/access";

export const dynamic = "force-dynamic";

export default async function PinterestSyncHistoryPage() {
  try {
    await requireOwnerOrAdminIntegrationAccess();
  } catch (error) {
    if (isAuthorizationError(error)) notFound();
    throw error;
  }
  const runs = await getPinterestSyncHistory();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pinterest sync history</CardTitle>
          <CardDescription>Recent imports and reconciliation changes for this kitchen.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {runs.length === 0 ? <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">No syncs have run yet.</p> : null}
            {runs.map((run) => <div key={run.syncRunId} className="rounded-2xl border border-border/60 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><SyncStatusBadge status={run.status} /><AppTransitionLink href={`/settings/pinterest/syncs/${run.syncRunId}`} className="text-sm text-primary underline-offset-4 hover:underline">Details</AppTransitionLink></div><p className="mt-2 text-sm"><LocalDateTime value={run.startedAt} /> · {formatPinterestSyncTrigger(run.trigger)}</p><p className="mt-2 text-sm text-muted-foreground">{run.createdRecipeCount} added · {run.removedRecipeCount} removed · {run.restoredRecipeCount} restored</p></div>)}
          </div>
          <div className="hidden md:block"><Table>
            <TableHeader><TableRow><TableHead>Started</TableHead><TableHead>Result</TableHead><TableHead>Trigger</TableHead><TableHead>Changes</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {runs.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No syncs have run yet.</TableCell></TableRow> : null}
              {runs.map((run) => (
                <TableRow key={run.syncRunId}>
                  <TableCell><LocalDateTime value={run.startedAt} /></TableCell>
                  <TableCell><SyncStatusBadge status={run.status} /></TableCell>
                  <TableCell>{formatPinterestSyncTrigger(run.trigger)}</TableCell>
                  <TableCell>{run.createdRecipeCount} added · {run.removedRecipeCount} removed · {run.restoredRecipeCount} restored</TableCell>
                  <TableCell className="text-right"><AppTransitionLink href={`/settings/pinterest/syncs/${run.syncRunId}`} className="text-primary underline-offset-4 hover:underline">Details</AppTransitionLink></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SyncStatusBadge({ status }: { status: string }) {
  const running = status === "running";
  const label = status === "success" ? "Succeeded" : status === "error" ? "Failed" : "Running";

  return <Badge variant={status === "success" ? "success" : status === "error" ? "destructive" : "secondary"}>{running ? <ActivityIndicator label="Pinterest sync running" className="mr-1.5" /> : null}{label}</Badge>;
}
