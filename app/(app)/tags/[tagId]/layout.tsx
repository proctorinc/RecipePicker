import type { ReactNode } from "react";

import { RecipeHeaderBackButtonEnabled } from "@/components/recipe-header-back-button";

export default function TagCollectionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RecipeHeaderBackButtonEnabled backHref="/tags" />
      {children}
    </>
  );
}
