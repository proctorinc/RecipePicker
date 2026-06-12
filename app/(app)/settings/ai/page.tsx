import { notFound } from "next/navigation";

import { AiSettingsForm } from "@/components/ai-settings-form";
import { ActionForm } from "@/components/action-form";
import { SettingsNav } from "@/components/settings-nav";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  disconnectAiConnectionAction,
  saveAiConnectionAction,
} from "@/lib/actions/operations";
import {
  canConfigureAi,
  requireOwnerOrAdminIntegrationAccess,
} from "@/lib/server/access";
import {
  getAiModelCatalog,
  getHouseholdAiConnectionSummary,
  type AiProvider,
  type AiConnectionStatus,
} from "@/lib/server/ai-provider";
import { isAuthorizationError } from "@/lib/server/errors";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  let integrationAccess: Awaited<
    ReturnType<typeof requireOwnerOrAdminIntegrationAccess>
  >;

  try {
    integrationAccess = await requireOwnerOrAdminIntegrationAccess();
  } catch (error) {
    if (isAuthorizationError(error)) {
      notFound();
    }

    throw error;
  }

  const { household: context, access: appAccess } = integrationAccess;

  const [modelCatalog, connection] = await Promise.all([
    Promise.resolve(getAiModelCatalog()),
    getHouseholdAiConnectionSummary(context.householdId),
  ]);
  const providerOptions = (Object.keys(modelCatalog) as AiProvider[]).map(
    (value) => ({
      value,
      label: providerLabel(value),
    }),
  );
  const initialProvider: AiProvider =
    connection.provider ?? providerOptions[0]?.value ?? "openai";
  const initialModel =
    connection.model &&
    modelCatalog[initialProvider]?.some(
      (option) => option.id === connection.model,
    )
      ? connection.model
      : (modelCatalog[initialProvider]?.[0]?.id ?? "");
  const canEditAi = canConfigureAi({
    subscriptionTier: appAccess.subscriptionTier,
    householdRole: context.role,
  });
  const showConnectionForm = canEditAi && connection.status !== "active";

  return (
    <div className="space-y-6">
      <SettingsNav currentPath="/settings/ai" />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>AI connection</CardTitle>
          <CardDescription>
            {context.householdName} shares one AI connection for recipe
            extraction and ingredient normalization.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={connectionTone(connection.status)}>
                {formatConnectionStatus(connection.status)}
              </Badge>
              {connection.providerLabel ? (
                <p className="text-sm text-muted-foreground">
                  {connection.providerLabel}
                  {connection.modelLabel ? ` · ${connection.modelLabel}` : ""}
                </p>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Last test: {formatDate(connection.lastTestedAt)}. Last result:{" "}
              {connection.lastTestStatus ?? "No test run yet"}.
            </p>
            {connection.lastTestError ? (
              <p className="rounded-[18px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {connection.lastTestError}
              </p>
            ) : null}
            {showConnectionForm ? (
              <div className="rounded-[22px] border border-border/60 bg-secondary/20 px-5 py-4">
                <AiSettingsForm
                  action={saveAiConnectionAction}
                  providerOptions={providerOptions.map(({ value, label }) => ({
                    value,
                    label,
                  }))}
                  modelCatalog={modelCatalog}
                  initialProvider={initialProvider}
                  initialModel={initialModel}
                  apiKeyPlaceholder={
                    connection.status === "not_connected"
                      ? "Paste the provider API key"
                      : "Leave blank to keep the current API key"
                  }
                />
              </div>
            ) : null}
            {!appAccess.isPremium ? (
              <div className="rounded-[22px] border border-border/60 bg-secondary/20 px-5 py-4">
                <p className="text-sm text-muted-foreground">
                  Premium is required to configure the shared AI connection.
                </p>
              </div>
            ) : null}
            {appAccess.isPremium && context.role !== "owner" ? (
              <div className="rounded-[22px] border border-border/60 bg-secondary/20 px-5 py-4">
                <p className="text-sm text-muted-foreground">
                  Only household owners can update the shared AI connection.
                </p>
              </div>
            ) : null}
            {canEditAi && connection.status === "active" ? (
              <div className="rounded-[22px] border border-border/60 bg-secondary/20 px-5 py-4">
                <p className="text-sm text-muted-foreground">
                  This household already has an active AI connection. Disconnect
                  it to connect a different provider or model.
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-start gap-3">
            {canEditAi && connection.status !== "not_connected" ? (
              <ActionForm
                action={disconnectAiConnectionAction}
                buttonVariant="outline"
              >
                {connection.status === "active"
                  ? "Disconnect and reconnect"
                  : "Disconnect"}
              </ActionForm>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatConnectionStatus(status: AiConnectionStatus) {
  switch (status) {
    case "active":
      return "Connected";
    case "test_failed":
      return "Test failed";
    case "invalid":
      return "Invalid";
    case "not_connected":
      return "Not connected";
  }
}

function connectionTone(
  status: AiConnectionStatus,
): "success" | "secondary" | "destructive" | "warning" | "outline" {
  switch (status) {
    case "active":
      return "success";
    case "test_failed":
    case "invalid":
      return "destructive";
    case "not_connected":
      return "outline";
  }
}

function providerLabel(provider: string) {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "google":
      return "Google";
    case "openrouter":
      return "OpenRouter";
    default:
      return provider;
  }
}
