"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, GripVertical, History, PackageCheck, Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppTransitionLink } from "@/components/app-transition-link";
import { RecipeImage } from "@/components/recipe-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { addAlwaysHaveIngredientAction, removeAlwaysHaveIngredientAction, reorderShoppingCartItemsAction, restoreShoppingCartAction, setAlwaysHaveIngredientEnabledAction, setShoppingCartItemCheckedAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import { formatCartQuantity } from "@/lib/shopping-cart";
import { formatDay } from "@/lib/utils";
import type { ShoppingCartItemView, ShoppingCartPageView } from "@/types/view-models";

const idle: ActionState = { status: "idle", message: "" };

export function ShoppingCart({ cart }: { cart: ShoppingCartPageView }) {
  const [items, setItems] = useState(cart.items);
  const [alwaysOpen, setAlwaysOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  useEffect(() => setItems(cart.items), [cart.items]);
  const cartIngredients = useMemo(() => {
    const existing = new Set(cart.alwaysHaves.map((item) => item.canonicalIngredientId)); const seen = new Set<string>();
    return items.filter((item) => item.canonicalIngredientId && !existing.has(item.canonicalIngredientId) && !seen.has(item.canonicalIngredientId) && Boolean(seen.add(item.canonicalIngredientId))).map((item) => ({ canonicalIngredientId: item.canonicalIngredientId!, displayName: item.displayName }));
  }, [cart.alwaysHaves, items]);
  const mealsByDate = useMemo(() => new Map(cart.selectedDates.map((date) => [date, cart.sourceMeals.filter((meal) => meal.date === date)])), [cart.selectedDates, cart.sourceMeals]);

  function runAction(action: typeof addAlwaysHaveIngredientAction, formData: FormData, onSuccess?: () => void) {
    startTransition(async () => { const result = await action(idle, formData); if (result.status === "success") { onSuccess?.(); router.refresh(); } else toast.error(result.message); });
  }
  function setChecked(item: ShoppingCartItemView, checked: boolean) {
    if (!cart.cartId) return; setItems((current) => current.map((entry) => entry.itemId === item.itemId ? { ...entry, checked } : entry).sort(compareItems));
    const data = new FormData(); data.set("cartId", cart.cartId); data.set("itemId", item.itemId); data.set("checked", String(checked)); runAction(setShoppingCartItemCheckedAction as typeof addAlwaysHaveIngredientAction, data);
  }
  function saveOrder(next: ShoppingCartItemView[]) {
    if (!cart.cartId) return; setItems(next); const data = new FormData(); data.set("cartId", cart.cartId); data.set("itemIds", JSON.stringify(next.map((item) => item.itemId))); runAction(reorderShoppingCartItemsAction as typeof addAlwaysHaveIngredientAction, data);
  }
  function moveItem(itemId: string, direction: -1 | 1) {
    const target = items.find((item) => item.itemId === itemId); if (!target) return;
    const group = items.filter((item) => item.checked === target.checked); const index = group.findIndex((item) => item.itemId === itemId); const other = group[index + direction]; if (!other) return;
    const next = items.map((item) => item.itemId === itemId ? { ...other, sortPosition: item.sortPosition } : item.itemId === other.itemId ? { ...target, sortPosition: other.sortPosition } : item).sort(compareItems); saveOrder(next);
  }
  function dropItem(targetId: string) {
    if (!draggedItemId || draggedItemId === targetId) return;
    const dragged = items.find((item) => item.itemId === draggedItemId); const target = items.find((item) => item.itemId === targetId);
    if (!dragged || !target || dragged.checked !== target.checked) return;
    const group = items.filter((item) => item.checked === dragged.checked).filter((item) => item.itemId !== draggedItemId);
    const targetIndex = group.findIndex((item) => item.itemId === targetId); group.splice(targetIndex, 0, dragged);
    const orderedIds = group.map((item) => item.itemId); const next = items.map((item) => ({ ...item, sortPosition: item.checked === dragged.checked ? orderedIds.indexOf(item.itemId) : item.sortPosition })).sort(compareItems); saveOrder(next);
  }

  const selectionHref = `/history?cart=select&month=${encodeURIComponent((cart.startDate ?? new Date().toISOString().slice(0, 7)).slice(0, 7))}`;
  return <section className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Meal plan</p><h1 className="font-[family-name:var(--font-serif)] text-3xl font-semibold">Shopping cart</h1><p className="mt-1 text-sm text-muted-foreground">{cart.startDate && cart.endDate ? `${formatDay(cart.startDate)} – ${formatDay(cart.endDate)} · ${cart.sourceMeals.length} ${cart.sourceMeals.length === 1 ? "meal" : "meals"}` : "Select a date range to build a shared list."}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setHistoryOpen(true)} disabled={!cart.history.length}><History className="h-4 w-4" />Cart history</Button><Button variant="outline" onClick={() => setAlwaysOpen(true)}><Settings2 className="h-4 w-4" />Always haves</Button></div></div>
    {cart.cartId ? <><div className="flex gap-2"><Button asChild><AppTransitionLink href={selectionHref}>Change days</AppTransitionLink></Button></div><RangeStrip dates={cart.selectedDates} mealsByDate={mealsByDate} />
      <Card><CardHeader><CardTitle>Your list</CardTitle><CardDescription>Checked ingredients move to the bottom. Drag the handle, or focus it and use ↑/↓, to reorder items.</CardDescription></CardHeader><CardContent className="space-y-2">{items.length ? items.map((item) => <CartItem key={item.itemId} item={item} onChecked={setChecked} onMove={moveItem} onDragStart={setDraggedItemId} onDrop={dropItem} />) : <p className="py-5 text-center text-sm text-muted-foreground">No ingredients for this date range yet.</p>}</CardContent></Card></> : <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center"><PackageCheck className="h-9 w-9 text-muted-foreground" /><p className="font-medium">Nothing to shop for yet.</p><p className="max-w-sm text-sm text-muted-foreground">Choose a start and end day; meals can be added to the range later.</p><Button asChild><AppTransitionLink href={selectionHref}>Select days</AppTransitionLink></Button></CardContent></Card>}
    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}><DialogContent><DialogHeader><DialogTitle>Cart history</DialogTitle><DialogDescription>Restore a previous shared date range and its saved list state.</DialogDescription></DialogHeader><div className="space-y-2">{cart.history.map((entry) => <Button key={entry.cartId} variant="outline" className="w-full justify-between" disabled={isPending} onClick={() => { const data = new FormData(); data.set("cartId", entry.cartId); runAction(restoreShoppingCartAction as typeof addAlwaysHaveIngredientAction, data, () => setHistoryOpen(false)); }}><span>{formatDay(entry.startDate)} – {formatDay(entry.endDate)}</span><span className="text-xs text-muted-foreground">Restore</span></Button>)}</div></DialogContent></Dialog>
    <Dialog open={alwaysOpen} onOpenChange={setAlwaysOpen}><DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[min(96vw,42rem)] flex-col gap-0 overflow-hidden p-4 sm:max-h-[calc(100dvh-3rem)] sm:p-5"><DialogHeader className="shrink-0 pr-8"><DialogTitle>Always haves</DialogTitle><DialogDescription>Enabled ingredients are excluded from new shopping lists. Turn one off when you need to buy it.</DialogDescription></DialogHeader><div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1"><div className="space-y-5 pb-1">{cartIngredients.length ? <div><p className="mb-1.5 text-sm font-medium">Add from this cart</p>{cartIngredients.map((item) => <div className="flex items-center justify-between py-1.5" key={item.canonicalIngredientId}><span>{item.displayName}</span><Button size="sm" variant="outline" disabled={isPending} onClick={() => { const data = new FormData(); data.set("canonicalIngredientId", item.canonicalIngredientId); data.set("dates", JSON.stringify(cart.selectedDates)); runAction(addAlwaysHaveIngredientAction, data); }}>Add</Button></div>)}</div> : null}<div><p className="mb-1.5 text-sm font-medium">Saved ingredients</p>{cart.alwaysHaves.map((item) => <div className="flex items-center gap-2 py-1.5" key={item.canonicalIngredientId}><Switch checked={item.enabled} disabled={isPending} onCheckedChange={(enabled) => { const data = new FormData(); data.set("canonicalIngredientId", item.canonicalIngredientId); data.set("enabled", String(enabled)); runAction(setAlwaysHaveIngredientEnabledAction as typeof addAlwaysHaveIngredientAction, data); }} /><span className="flex-1">{item.displayName}</span><Button size="icon" variant="ghost" aria-label={`Remove ${item.displayName}`} disabled={isPending} onClick={() => { const data = new FormData(); data.set("canonicalIngredientId", item.canonicalIngredientId); runAction(removeAlwaysHaveIngredientAction as typeof addAlwaysHaveIngredientAction, data); }}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div></div></div></DialogContent></Dialog>
  </section>;
}

function compareItems(left: ShoppingCartItemView, right: ShoppingCartItemView) { return Number(left.checked) - Number(right.checked) || left.sortPosition - right.sortPosition || left.displayName.localeCompare(right.displayName); }
function CartItem({ item, onChecked, onMove, onDragStart, onDrop }: { item: ShoppingCartItemView; onChecked: (item: ShoppingCartItemView, checked: boolean) => void; onMove: (id: string, direction: -1 | 1) => void; onDragStart: (id: string) => void; onDrop: (id: string) => void }) { const quantity = formatCartQuantity(item.amountText, item.unit); return <div onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop(item.itemId)} className="flex w-full items-start gap-2 rounded-xl border border-border/70 p-3"><button type="button" onClick={() => onChecked(item, !item.checked)} aria-label={`${item.checked ? "Uncheck" : "Check"} ${item.displayName}`} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${item.checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>{item.checked ? <Check className="h-3.5 w-3.5" /> : null}</button><button draggable type="button" onDragStart={() => onDragStart(item.itemId)} aria-label={`Reorder ${item.displayName}; use up and down arrows`} onKeyDown={(event) => { if (event.key === "ArrowUp") { event.preventDefault(); onMove(item.itemId, -1); } if (event.key === "ArrowDown") { event.preventDefault(); onMove(item.itemId, 1); } }} className="mt-0.5 cursor-grab text-muted-foreground"><GripVertical className="h-5 w-5" /></button><span className="min-w-0 flex-1"><span className={`block font-medium ${item.checked ? "text-muted-foreground line-through" : ""}`}>{quantity ? `${quantity} ${item.displayName}` : item.displayName}</span>{item.alternativeOptions ? <span className="mt-0.5 block text-xs text-muted-foreground">Choose one option.</span> : null}<span className="mt-0.5 block text-xs text-muted-foreground">{item.sourceMeals.map((meal) => `${meal.recipeTitle} (${meal.date})`).join(" · ")}</span></span></div>; }
function RangeStrip({ dates, mealsByDate }: { dates: string[]; mealsByDate: Map<string, ShoppingCartPageView["sourceMeals"]> }) { return <Card><CardHeader><CardTitle>Selected meals</CardTitle><CardDescription>Scroll across your selected date range.</CardDescription></CardHeader><CardContent><div className="flex gap-3 overflow-x-auto pb-3">{dates.map((date) => <div key={date} className="w-40 shrink-0 space-y-2"><p className="text-sm font-semibold">{formatDay(date)}</p>{(mealsByDate.get(date) ?? []).length ? (mealsByDate.get(date) ?? []).map((meal) => <div key={meal.eventId} className="overflow-hidden rounded-xl border bg-secondary/20"><div className="relative h-20 bg-muted">{meal.recipeImageUrl ? <RecipeImage src={meal.recipeImageUrl} alt="" fill sizes="160px" className="object-cover" /> : null}</div><p className="p-2 text-xs font-medium">{meal.recipeTitle}</p></div>) : <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">No meal planned</div>}</div>)}</div></CardContent></Card>; }
