import { AppTransitionLink } from "@/components/app-transition-link";
import { SettingsNav } from "@/components/settings-nav";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getHouseholdAiConnectionSummary } from "@/lib/server/ai-provider";
import { getCurrentUserAccess } from "@/lib/server/access";
import { requireHouseholdContext } from "@/lib/server/auth";
import { getPinterestConnectionSummary } from "@/lib/server/pinterest";
import {
  getBoardSyncOptions,
  getDashboardSummary,
  getIngredientReviewQueue,
} from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [context, access] = await Promise.all([
    requireHouseholdContext(),
    getCurrentUserAccess(),
  ]);
  const canManageIntegrations = context.role === "owner" || access.isActualAdmin;
  const [summary, ingredientQueue, pinterestConnection, aiConnection, boards] =
    await Promise.all([
      getDashboardSummary(),
      getIngredientReviewQueue(1, 1),
      canManageIntegrations
        ? getPinterestConnectionSummary(context.householdId)
        : Promise.resolve(null),
      canManageIntegrations
        ? getHouseholdAiConnectionSummary(context.householdId)
        : Promise.resolve(null),
      canManageIntegrations ? getBoardSyncOptions() : Promise.resolve([]),
    ]);
  const recipeAttentionCount =
    summary.pendingRecipes + summary.failedRecipes + summary.reviewNeeded;
  const ingredientAttentionCount = ingredientQueue.totalCount;
  const syncedBoardCount = boards.filter((board) => board.syncEnabled).length;
  const overviewItems = [
    ...(canManageIntegrations
      ? [
          {
            title: "Pinterest",
            description: getPinterestDescription(
              pinterestConnection!.status,
              syncedBoardCount,
            ),
            href: "/settings/pinterest",
            ctaLabel: getPinterestCta(
              pinterestConnection!.status,
              syncedBoardCount,
            ),
            emphasized:
              pinterestConnection!.status !== "active" || syncedBoardCount === 0,
          },
          {
            title: "AI",
            description: getAiDescription(
              aiConnection!.status,
              aiConnection!.providerLabel,
              aiConnection!.modelLabel,
            ),
            href: "/settings/ai",
            ctaLabel: getAiCta(aiConnection!.status),
            emphasized: aiConnection!.status !== "active",
          },
          {
            title: "Recipes",
            description:
              recipeAttentionCount > 0
                ? `${recipeAttentionCount} ${pluralize("recipe", recipeAttentionCount)} need review or have issues.`
                : "No recipes need attention right now.",
            href: "/settings/recipes",
            ctaLabel:
              recipeAttentionCount > 0 ? "Review recipes" : "Open recipes",
            emphasized: recipeAttentionCount > 0,
          },
          {
            title: "Ingredients",
            description:
              ingredientAttentionCount > 0
                ? `${ingredientAttentionCount} ${pluralize("ingredient", ingredientAttentionCount)} need review.`
                : "No ingredients need review right now.",
            href: "/settings/ingredients",
            ctaLabel:
              ingredientAttentionCount > 0
                ? "Review ingredients"
                : "Open ingredients",
            emphasized: ingredientAttentionCount > 0,
          },
        ]
      : []),
    ...(access.isPremium
      ? [
          {
            title: "AI Recipe Picker",
            description:
              "Open the premium prompt-based carousel to steer recipes with AI.",
            href: "/picker",
            ctaLabel: "Open AI picker",
            emphasized: true,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <SettingsNav currentPath="/settings" />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>
            {overviewItems.length > 0
              ? "Quick links for anything that still needs setup or review"
              : "Manage your household"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <OverviewItem
            title="My Household"
            description="View and invite household members"
            href="/settings/members"
            ctaLabel="View"
            emphasized={true}
          />
          {overviewItems.length > 0 &&
            overviewItems.map((item) => (
              <OverviewItem
                key={item.title}
                title={item.title}
                description={item.description}
                href={item.href}
                ctaLabel={item.ctaLabel}
                emphasized={item.emphasized}
              />
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewItem({
  title,
  description,
  href,
  ctaLabel,
  emphasized,
}: {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-[24px] border px-5 py-5 sm:flex-row sm:items-center sm:justify-between ${
        emphasized
          ? "border-border/70 bg-secondary/35"
          : "border-border/50 bg-secondary/15"
      }`}
    >
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <AppTransitionLink
        href={href}
        prefetch
        className={buttonVariants({
          variant: emphasized ? "default" : "outline",
        })}
        pendingClassName="opacity-75"
      >
        {ctaLabel}
      </AppTransitionLink>
    </div>
  );
}

function getPinterestDescription(
  status:
    | "not_connected"
    | "active"
    | "expiring_soon"
    | "expired"
    | "reauthorization_required"
    | "revoked",
  syncedBoardCount: number,
) {
  if (status === "not_connected") {
    return "Pinterest isn't connected yet.";
  }

  if (status !== "active") {
    return "Pinterest needs attention before board sync can run normally.";
  }

  if (syncedBoardCount === 0) {
    return "Pinterest is connected, but no boards are selected for sync yet.";
  }

  return `${syncedBoardCount} ${pluralize("board", syncedBoardCount)} ${syncedBoardCount === 1 ? "is" : "are"} set up for sync.`;
}

function getPinterestCta(
  status:
    | "not_connected"
    | "active"
    | "expiring_soon"
    | "expired"
    | "reauthorization_required"
    | "revoked",
  syncedBoardCount: number,
) {
  if (status === "not_connected") {
    return "Connect Pinterest";
  }

  if (status !== "active") {
    return "Fix Pinterest";
  }

  if (syncedBoardCount === 0) {
    return "Choose boards";
  }

  return "Open Pinterest";
}

function getAiDescription(
  status: "not_connected" | "active" | "test_failed" | "invalid",
  providerLabel: string | null,
  modelLabel: string | null,
) {
  if (status === "not_connected") {
    return "AI isn't set up yet.";
  }

  if (status !== "active") {
    return "AI needs attention before extraction and normalization can run normally.";
  }

  if (providerLabel && modelLabel) {
    return `${providerLabel} is connected with ${modelLabel}.`;
  }

  if (providerLabel) {
    return `${providerLabel} is connected.`;
  }

  return "AI is connected.";
}

function getAiCta(
  status: "not_connected" | "active" | "test_failed" | "invalid",
) {
  if (status === "not_connected") {
    return "Set up AI";
  }

  if (status !== "active") {
    return "Fix AI";
  }

  return "Open AI";
}

function pluralize(word: string, count: number) {
  return count === 1 ? word : `${word}s`;
}
