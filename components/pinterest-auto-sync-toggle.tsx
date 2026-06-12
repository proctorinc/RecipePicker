"use client";

import { useActionState, useEffect, useId, useRef, useState, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { setPinterestAutoSyncEnabledAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";

const initialState: ActionState = {
  status: "idle",
  message: "",
};

export function PinterestAutoSyncToggle({
  enabled,
  disabled,
}: {
  enabled: boolean;
  disabled?: boolean;
}) {
  const switchId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const enabledInputRef = useRef<HTMLInputElement>(null);
  const [checked, setChecked] = useState(enabled);
  const [state, formAction] = useActionState(
    setPinterestAutoSyncEnabledAction,
    initialState,
  );

  useEffect(() => {
    setChecked(enabled);
  }, [enabled]);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    } else if (state.status === "error") {
      toast.error(state.message);
      setChecked(enabled);
    }
  }, [enabled, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-[22px] border border-border/60 bg-secondary/20 px-5 py-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <label htmlFor={switchId} className="font-medium">
            Auto-sync Pinterest data
          </label>
          <p className="text-sm text-muted-foreground">
            Turn the background Pinterest API sync on or off for this household.
          </p>
        </div>
        <input
          ref={enabledInputRef}
          type="hidden"
          name="enabled"
          value={checked ? "true" : "false"}
        />
        <ToggleSwitch
          checked={checked}
          disabled={disabled}
          enabledInputRef={enabledInputRef}
          formRef={formRef}
          id={switchId}
          onCheckedChange={setChecked}
        />
      </div>
    </form>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  enabledInputRef,
  formRef,
  id,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  enabledInputRef: RefObject<HTMLInputElement | null>;
  formRef: RefObject<HTMLFormElement | null>;
  id: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex items-center gap-3">
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : null}
      <Switch
        id={id}
        checked={checked}
        disabled={pending || disabled}
        aria-label="Toggle Pinterest auto-sync"
        onCheckedChange={(nextChecked) => {
          onCheckedChange(nextChecked);
          if (enabledInputRef.current) {
            enabledInputRef.current.value = nextChecked ? "true" : "false";
          }
          formRef.current?.requestSubmit();
        }}
      />
    </div>
  );
}
