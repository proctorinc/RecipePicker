"use client";

import { Copy, Link2, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { revokeKitchenInviteAction } from "@/lib/actions/operations";

export function PendingInviteCook({ inviteToken, inviteUrl, expiresAt }: { inviteToken: string; inviteUrl: string; expiresAt: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied to your clipboard.");
    } catch {
      toast.error("Unable to copy the invite link.");
    }
  }

  function revokeInvite() {
    startTransition(async () => {
      const result = await revokeKitchenInviteAction(inviteToken);
      if (result.status === "success") {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Link2 className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Invited cook</p>
        <p className="text-sm text-muted-foreground">Invite link shared · expires {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(expiresAt))}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" onClick={copyInvite} aria-label="Copy invite link"><Copy className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" onClick={revokeInvite} disabled={isPending} aria-label="Revoke invite link">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
