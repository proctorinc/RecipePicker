import { ActionForm } from "@/components/action-form";
import { ShareInviteLink } from "@/components/share-invite-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createInviteAction } from "@/lib/actions/operations";
import { getHouseholdInviteUrl } from "@/lib/household-invite-url";
import { requireHouseholdContext } from "@/lib/server/auth";
import { getHouseholdMembersView, getLatestInvite } from "@/lib/server/queries";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const [context, members, latestInvite] = await Promise.all([
    requireHouseholdContext(),
    getHouseholdMembersView(),
    getLatestInvite(),
  ]);
  const inviteUrl = latestInvite ? getHouseholdInviteUrl(latestInvite.inviteToken) : null;

  return (
    <div className="space-y-6">

      <Card>
        <CardHeader>
          <CardTitle>Shared household</CardTitle>
          <CardDescription>
            Members of {context.householdName} share one recipe library and one Pinterest connection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {context.role === "owner" ? (
            <div className="flex flex-wrap items-center gap-3">
              <ActionForm action={createInviteAction} buttonVariant="default">
                Create invite link
              </ActionForm>
              {inviteUrl ? (
                <>
                  <ShareInviteLink householdName={context.householdName} inviteUrl={inviteUrl} />
                  <code className="max-w-full truncate rounded-full bg-secondary px-4 py-2 text-xs">
                    {inviteUrl}
                  </code>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only owners can create new invite links for this household.
            </p>
          )}
          {latestInvite ? (
            <p className="text-sm text-muted-foreground">
              Invite expires {formatDate(latestInvite.expiresAt)}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Roles are intentionally simple for v1: owners manage sharing and integrations, members use the household.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.clerkUserId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{member.name}</span>
                      {member.isCurrentUser ? <Badge variant="outline">You</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === "owner" ? "success" : "secondary"}>{member.role}</Badge>
                  </TableCell>
                  <TableCell>{formatDate(member.joinedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
