import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KitchenSettingsForm } from "@/components/kitchen-settings-form";
import { KitchenInviteButton } from "@/components/kitchen-invite-button";
import { PendingInviteCook } from "@/components/pending-invite-cook";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getHouseholdInviteUrl } from "@/lib/household-invite-url";
import { requireOwnerOrAdminSettingsAccess } from "@/lib/server/access";
import { isAuthorizationError } from "@/lib/server/errors";
import { getHouseholdMembersView, getLatestInvite } from "@/lib/server/queries";
import { formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  let settingsAccess: Awaited<ReturnType<typeof requireOwnerOrAdminSettingsAccess>>;

  try {
    settingsAccess = await requireOwnerOrAdminSettingsAccess();
  } catch (error) {
    if (isAuthorizationError(error)) notFound();
    throw error;
  }

  const [members, latestInvite] = await Promise.all([
    getHouseholdMembersView(),
    getLatestInvite(),
  ]);
  const context = settingsAccess.household;
  const inviteUrl = latestInvite
    ? getHouseholdInviteUrl(latestInvite.inviteToken)
    : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 sm:p-6">
          <KitchenSettingsForm
            name={context.householdName}
            logoUrl={context.householdLogoUrl}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Cooks</CardTitle>
            <CardDescription>
              Can't have too many cooks in this kitchen! Share to add more
              people to your family
            </CardDescription>
          </div>
          {context.role === "owner" ? (
            <KitchenInviteButton
              kitchenName={context.householdName}
              inviteUrl={inviteUrl}
            />
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {members.map((member) => (
              <div
                key={member.clerkUserId}
                className="rounded-2xl border border-border/60 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CookAvatar name={member.name} imageUrl={member.imageUrl} />
                    <span className="font-medium">{member.name}</span>
                    {member.isCurrentUser ? (
                      <Badge variant="outline">You</Badge>
                    ) : null}
                  </div>
                  <Badge
                    variant={member.role === "owner" ? "success" : "secondary"}
                  >
                    {member.role === "owner" ? "Owner" : "Cook"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Joined {formatDate(member.joinedAt)}
                </p>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
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
                        <CookAvatar
                          name={member.name}
                          imageUrl={member.imageUrl}
                        />
                        <span className="font-medium">{member.name}</span>
                        {member.isCurrentUser ? (
                          <Badge variant="outline">You</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          member.role === "owner" ? "success" : "secondary"
                        }
                      >
                        {member.role === "owner" ? "Owner" : "Cook"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(member.joinedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {latestInvite && inviteUrl ? (
            <div className="mt-3">
              <PendingInviteCook
                inviteToken={latestInvite.inviteToken}
                inviteUrl={inviteUrl}
                expiresAt={latestInvite.expiresAt}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function CookAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  if (imageUrl) {
    return (
      // Clerk profile images are displayed as the cook's avatar.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
