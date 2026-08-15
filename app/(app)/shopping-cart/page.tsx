import { PageShell } from "@/components/page-shell";
import { ShoppingCart } from "@/components/shopping-cart";
import { getShoppingCartPage } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function ShoppingCartPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const { date } = await searchParams;
  const dates = Array.isArray(date) ? date : date ? [date] : [];
  const cart = await getShoppingCartPage(dates);
  return <PageShell><ShoppingCart cart={cart} /></PageShell>;
}
