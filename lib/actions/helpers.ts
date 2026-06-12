import { revalidatePath } from "next/cache";

import {
  isAuthenticationError,
  isAuthorizationError,
} from "@/lib/server/logger";

export function toErrorState(error: unknown, fallback: string) {
  if (isAuthenticationError(error)) {
    return { status: "error" as const, message: "Authentication required." };
  }

  if (isAuthorizationError(error)) {
    return {
      status: "error" as const,
      message: "You do not have permission for this action.",
    };
  }

  if (error instanceof Error) {
    return { status: "error" as const, message: `${fallback} ${error.message}` };
  }

  return { status: "error" as const, message: fallback };
}

export function toOptionalString(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export function recipeScopedPaths(boardId?: string, recipeId?: string) {
  return [
    "/",
    "/history",
    "/settings",
    "/settings/ai",
    "/settings/admin",
    "/settings/ingredients",
    "/settings/recipes",
    "/settings/members",
    boardId ? `/settings?boardId=${boardId}` : null,
    recipeId ? `/recipe/${recipeId}` : null,
    recipeId ? `/settings/recipes/${recipeId}` : null,
  ].filter(Boolean) as string[];
}

export function revalidateAll(paths: string[]) {
  for (const path of paths) {
    revalidatePath(path);
  }
}
