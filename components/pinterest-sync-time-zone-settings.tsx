"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { updateKitchenTimeZoneAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";

const initialState: ActionState = { status: "idle", message: "" };

export function PinterestSyncTimeZoneSettings({ timeZone }: { timeZone: string }) {
  const [state, action] = useActionState(updateKitchenTimeZoneAction, initialState);
  const [selectedTimeZone, setSelectedTimeZone] = useState(timeZone);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.refresh();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [router, state]);

  useEffect(() => {
    setSelectedTimeZone(
      timeZone === "UTC"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        : timeZone,
    );
  }, [timeZone]);

  return (
    <div className="border-t border-border/60 pt-4">
      <p className="text-sm font-medium">Sync time zone</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Nightly Pinterest syncs start at midnight in this time zone.
      </p>
      <form action={action} className="mt-3 flex w-full max-w-sm items-end gap-2">
        <label className="flex min-w-0 flex-1 text-sm font-medium">
          <span className="sr-only">Pinterest sync time zone</span>
          <select
            name="timeZone"
            value={selectedTimeZone}
            onChange={(event) => setSelectedTimeZone(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {getTimeZones().map((zone) => (
              <option key={zone} value={zone}>{zone}</option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">Save time zone</Button>
      </form>
    </div>
  );
}

function getTimeZones() {
  const supported = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];

  return ["UTC", ...supported.filter((zone) => zone !== "UTC")];
}
