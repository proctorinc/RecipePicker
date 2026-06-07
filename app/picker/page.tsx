import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { RecipePicker } from "@/components/recipe-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppAccessContext } from "@/lib/server/access";
import { getRecipePickerInitialState } from "@/lib/server/recipe-picker";

export const dynamic = "force-dynamic";

export default async function PickerPage() {
  const access = await getAppAccessContext();

  if (!access.isPremium) {
    return (
      <AppShell
        title="AI Recipe Picker"
        description="A premium recipe discovery workspace that interprets prompts and curates matches from your saved household recipes."
        showUserButton
      >
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle>Premium feature</CardTitle>
            <CardDescription>
              The AI Recipe Picker lives on its own page and is only available on the premium tier.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upgrade this account to premium to unlock prompt-based recipe picking, AI explanations, and the live carousel experience.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/settings/ai">Open AI settings</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/settings">Open settings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const initialState = await getRecipePickerInitialState();

  return (
    <AppShell
      contentClassName="max-w-6xl"
      showUserButton
    >
      <RecipePicker initialState={initialState} />
    </AppShell>
  );
}
