import { PageShell } from "@/components/page-shell";
import { ShoppingCart } from "@/components/shopping-cart";
import { getShoppingCartPage } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function ShoppingCartPage() {
  const cart = await getShoppingCartPage();
  return <PageShell><ShoppingCart cart={cart} /></PageShell>;
}
