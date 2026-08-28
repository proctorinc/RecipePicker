"use client";

import { Loader2, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createKitchenInviteLinkAction } from "@/lib/actions/operations";

export function KitchenInviteButton({ kitchenName, inviteUrl }: { kitchenName: string; inviteUrl: string | null }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function shareInvite(url: string) {
    const shareData = { title: `Join ${kitchenName} on Recipe Picker`, text: `Join ${kitchenName} on Recipe Picker.`, url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied to your clipboard.");
    } catch {
      toast.error("Unable to share the invite link.");
    }
  }

  function createOrShareInvite() {
    startTransition(async () => {
      if (inviteUrl) return shareInvite(inviteUrl);
      const result = await createKitchenInviteLinkAction();
      if (result.status !== "success" || typeof result.data?.inviteToken !== "string") {
        toast.error(result.message);
        return;
      }
      const url = `${window.location.origin}/join/${encodeURIComponent(result.data.inviteToken)}`;
      toast.success(result.message);
      router.refresh();
      await shareInvite(url);
    });
  }

  return <Button type="button" variant="secondary" size="icon" className="h-12 w-12" onClick={createOrShareInvite} disabled={isPending} aria-label="Share kitchen invite">{isPending ? <Loader2 className="h-7 w-7 animate-spin" /> : <Share2 className="h-7 w-7" strokeWidth={2.25} />}</Button>;
}
