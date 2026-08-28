"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { type ActionState } from "@/lib/actions/types";

const initialActionState: ActionState = {
  status: "idle",
  message: "",
};

export function ActionForm({
  action,
  fields,
  children,
  buttonVariant,
  buttonSize,
  buttonClassName,
  className,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields?: Record<string, string>;
  children: ReactNode;
  buttonVariant?: ButtonProps["variant"];
  buttonSize?: ButtonProps["size"];
  buttonClassName?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      const redirectTo = state.data?.redirectTo;
      if (typeof redirectTo === "string") router.push(redirectTo);
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [router, state]);

  return (
    <form action={formAction} className={className}>
      {Object.entries(fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={buttonVariant} size={buttonSize} className={buttonClassName}>
        {children}
      </SubmitButton>
    </form>
  );
}

function SubmitButton({
  children,
  variant,
  size,
  className,
}: {
  children: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}
