"use client";

import { Settings2 } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { disconnectPinterestAction } from "@/lib/actions/operations";

export function PinterestConnectionSettings() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Settings2 className="h-4 w-4" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pinterest settings</DialogTitle>
          <DialogDescription>
            Disconnecting removes this kitchen&apos;s Pinterest connection.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 rounded-2xl border border-destructive/30 p-4">
          <p className="text-sm font-medium">Disconnect Pinterest</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can reconnect a Pinterest account at any time.
          </p>
          <ActionForm
            action={disconnectPinterestAction}
            buttonVariant="destructive"
            buttonClassName="mt-4"
          >
            Disconnect Pinterest
          </ActionForm>
        </div>
      </DialogContent>
    </Dialog>
  );
}
