"use client";

import { ArrowLeft } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

const RecipeHeaderBackButtonContext = createContext({
  showBack: false,
  setShowBack: (_showBack: boolean) => {},
  backHref: null as string | null,
  setBackHref: (_backHref: string | null) => {},
});

export function RecipeHeaderBackButtonProvider({ children }: { children: ReactNode }) {
  const [showBack, setShowBack] = useState(false);
  const [backHref, setBackHref] = useState<string | null>(null);

  return (
    <RecipeHeaderBackButtonContext.Provider value={{ showBack, setShowBack, backHref, setBackHref }}>
      {children}
    </RecipeHeaderBackButtonContext.Provider>
  );
}

export function RecipeHeaderBackButtonEnabled({
  showBack = true,
  backHref = null,
}: {
  showBack?: boolean;
  backHref?: string | null;
}) {
  const { setShowBack, setBackHref } = useContext(RecipeHeaderBackButtonContext);

  useEffect(() => {
    setShowBack(showBack);
    setBackHref(backHref);
    return () => {
      setShowBack(false);
      setBackHref(null);
    };
  }, [backHref, setBackHref, setShowBack, showBack]);

  return null;
}

export function RecipeHeaderBackButton() {
  const router = useRouter();
  const { showBack, backHref } = useContext(RecipeHeaderBackButtonContext);

  if (!showBack) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9 shrink-0 gap-1.5 md:w-auto md:px-3"
      aria-label="Go back"
      onClick={() => {
        if (backHref) {
          router.push(backHref);
          return;
        }

        if (window.history.length > 1) {
          router.back();
          return;
        }

        router.push("/");
      }}
    >
      <Icon icon={ArrowLeft} size="sm" />
      <span className="hidden md:inline">Back</span>
    </Button>
  );
}
