"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ShareInviteLink({ householdName, inviteUrl }: { householdName: string; inviteUrl: string }) {
  async function shareInvite() {
    const shareData = {
      title: `Join ${householdName} on Recipe Picker`,
      text: `Join ${householdName} on Recipe Picker.`,
      url: inviteUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        toast.error("Unable to share the invite link.");
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied to your clipboard.");
    } catch {
      toast.error("Unable to copy the invite link.");
    }
  }

  return (
    <Button type="button" variant="outline" onClick={shareInvite}>
      <Share2 className="h-4 w-4" />
      Share invite link
    </Button>
  );
}
