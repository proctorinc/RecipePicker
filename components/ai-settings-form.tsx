"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/actions/types";

type ModelOption = {
  id: string;
  label: string;
  description: string;
};

type ProviderOption = {
  value: string;
  label: string;
};

const initialActionState: ActionState = {
  status: "idle",
  message: "",
};

export function AiSettingsForm({
  action,
  providerOptions,
  modelCatalog,
  initialProvider,
  initialModel,
  apiKeyPlaceholder,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  providerOptions: ProviderOption[];
  modelCatalog: Record<string, ModelOption[]>;
  initialProvider: string;
  initialModel: string;
  apiKeyPlaceholder: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [provider, setProvider] = useState(initialProvider);
  const providerModels = useMemo(() => modelCatalog[provider] ?? [], [modelCatalog, provider]);
  const [model, setModel] = useState(() => {
    if (providerModels.some((option) => option.id === initialModel)) {
      return initialModel;
    }

    return providerModels[0]?.id ?? "";
  });

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  useEffect(() => {
    if (!providerModels.some((option) => option.id === model)) {
      setModel(providerModels[0]?.id ?? "");
    }
  }, [model, providerModels]);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Provider">
          <select
            name="provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="flex h-12 w-full rounded-full border border-border bg-background/90 px-5 py-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
          >
            {providerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model">
          <select
            name="model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="flex h-12 w-full rounded-full border border-border bg-background/90 px-5 py-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
          >
            {providerModels.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {providerModels.length > 0 ? (
        <p className="rounded-[20px] bg-secondary/35 px-4 py-3 text-sm text-muted-foreground">
          {providerModels.find((option) => option.id === model)?.description}
        </p>
      ) : null}

      <Field label="API key">
        <Input
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder={apiKeyPlaceholder}
        />
      </Field>

      <div className="flex justify-end">
        <SubmitButton>Save and test connection</SubmitButton>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="default" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}
