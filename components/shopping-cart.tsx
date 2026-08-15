"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, PackageCheck, Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { addAlwaysHaveIngredientAction, removeAlwaysHaveIngredientAction, setAlwaysHaveIngredientEnabledAction } from "@/lib/actions/operations";
import { formatCartQuantity } from "@/lib/shopping-cart";
import type { ActionState } from "@/lib/actions/types";
import type { ShoppingCartPageView } from "@/types/view-models";

const idle: ActionState = { status: "idle", message: "" };

export function ShoppingCart({ cart }: { cart: ShoppingCartPageView }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [alwaysOpen, setAlwaysOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const cartIngredients = useMemo(() => {
    const existing = new Set(cart.alwaysHaves.map((item) => item.canonicalIngredientId));
    const seen = new Set<string>();
    return cart.items.filter((item) => item.canonicalIngredientId && !existing.has(item.canonicalIngredientId) && !seen.has(item.canonicalIngredientId) && Boolean(seen.add(item.canonicalIngredientId))).map((item) => ({ canonicalIngredientId: item.canonicalIngredientId!, displayName: item.displayName }));
  }, [cart.alwaysHaves, cart.items]);

  function runAction(action: typeof addAlwaysHaveIngredientAction, formData: FormData) {
    startTransition(async () => {
      const result = await action(idle, formData);
      if (result.status === "success") { toast.success(result.message); router.refresh(); }
      else toast.error(result.message);
    });
  }

  return <section className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Meal plan</p><h1 className="font-[family-name:var(--font-serif)] text-3xl font-semibold">Shopping cart</h1><p className="mt-1 text-sm text-muted-foreground">{cart.selectedDates.length ? `${cart.selectedDates.length} selected ${cart.selectedDates.length === 1 ? "day" : "days"} · ${cart.sourceMeals.length} ${cart.sourceMeals.length === 1 ? "meal" : "meals"}` : "Select meal days in History to build a list."}</p></div>
      <Button variant="outline" onClick={() => setAlwaysOpen(true)}><Settings2 className="h-4 w-4" />Always haves</Button>
    </div>

    {cart.items.length ? <Card><CardHeader><CardTitle>Your list</CardTitle><CardDescription>Checkoffs stay on this page only and reset when you return. Items marked “choose one” need just one listed option.</CardDescription></CardHeader><CardContent className="space-y-2">{cart.items.map((item) => {
      const isChecked = checked.has(item.itemId); const quantity = formatCartQuantity(item.amountText, item.unit);
      return <button key={item.itemId} type="button" onClick={() => setChecked((current) => { const next = new Set(current); if (next.has(item.itemId)) next.delete(item.itemId); else next.add(item.itemId); return next; })} className="flex w-full items-start gap-3 rounded-xl border border-border/70 p-3 text-left transition hover:bg-secondary/30">
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isChecked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>{isChecked ? <Check className="h-3.5 w-3.5" /> : null}</span>
        <span className="min-w-0 flex-1"><span className={`block font-medium ${isChecked ? "text-muted-foreground line-through" : ""}`}>{quantity ? `${quantity} ${item.displayName}` : item.displayName}</span>{item.alternativeOptions ? <span className="mt-0.5 block text-xs text-muted-foreground">Choose one option.</span> : null}<span className="mt-0.5 block text-xs text-muted-foreground">{item.sourceMeals.map((meal) => `${meal.recipeTitle} (${meal.date})`).join(" · ")}</span></span>
      </button>;
    })}</CardContent></Card> : <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center"><PackageCheck className="h-9 w-9 text-muted-foreground" /><p className="font-medium">Nothing to shop for yet.</p><p className="max-w-sm text-sm text-muted-foreground">Choose one or more days with meals from History, then build your shopping cart.</p></CardContent></Card>}

    {cart.sourceMeals.length ? <Card><CardHeader><CardTitle>Selected meals</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{cart.sourceMeals.map((meal) => <span key={meal.eventId} className="rounded-full bg-secondary px-3 py-1 text-sm">{meal.date} · {meal.recipeTitle}</span>)}</CardContent></Card> : null}

    <Dialog open={alwaysOpen} onOpenChange={setAlwaysOpen}><DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[min(96vw,42rem)] flex-col gap-0 overflow-hidden p-4 sm:max-h-[calc(100dvh-3rem)] sm:p-5"><DialogHeader className="shrink-0 pr-8"><DialogTitle>Always haves</DialogTitle><DialogDescription>Enabled ingredients are excluded from new shopping lists. Turn one off when you need to buy it.</DialogDescription></DialogHeader><div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="space-y-5 pb-1">
        {cartIngredients.length ? <div><p className="mb-1.5 text-sm font-medium">Add from this cart</p><div className="grid gap-x-5 divide-y sm:grid-cols-2 sm:divide-y-0">{cartIngredients.map((item) => <div className="flex min-w-0 items-center justify-between gap-2 py-1.5" key={item.canonicalIngredientId}><span className="min-w-0 truncate text-sm" title={item.displayName}>{item.displayName}</span><Button size="sm" variant="outline" className="h-7 shrink-0 px-2" disabled={isPending} onClick={() => { const data = new FormData(); data.set("canonicalIngredientId", item.canonicalIngredientId); data.set("dates", JSON.stringify(cart.selectedDates)); runAction(addAlwaysHaveIngredientAction, data); }}>Add</Button></div>)}</div></div> : null}
        <div><p className="mb-1.5 text-sm font-medium">Saved ingredients</p>{cart.alwaysHaves.length ? <div className="grid gap-x-5 divide-y sm:grid-cols-2 sm:divide-y-0">{cart.alwaysHaves.map((item) => <div className="flex min-w-0 items-center gap-2 py-1.5" key={item.canonicalIngredientId}><Switch checked={item.enabled} disabled={isPending} onCheckedChange={(enabled) => { const data = new FormData(); data.set("canonicalIngredientId", item.canonicalIngredientId); data.set("enabled", String(enabled)); runAction(setAlwaysHaveIngredientEnabledAction as typeof addAlwaysHaveIngredientAction, data); }} /><span className="min-w-0 flex-1 truncate text-sm" title={item.displayName}>{item.displayName}</span><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Remove ${item.displayName}`} disabled={isPending} onClick={() => { const data = new FormData(); data.set("canonicalIngredientId", item.canonicalIngredientId); runAction(removeAlwaysHaveIngredientAction as typeof addAlwaysHaveIngredientAction, data); }}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div> : <p className="text-sm text-muted-foreground">No saved always haves.</p>}</div>
      </div>
    </div></DialogContent></Dialog>
  </section>;
}
