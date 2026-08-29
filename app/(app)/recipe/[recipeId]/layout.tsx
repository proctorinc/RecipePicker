import type { ReactNode } from "react";

import { RecipeHeaderBackButtonEnabled } from "@/components/recipe-header-back-button";

export default function RecipeDetailLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RecipeHeaderBackButtonEnabled showBack={true} />
      {children}
    </>
  );
}
