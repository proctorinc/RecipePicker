const LOCAL_APP_URL = "http://localhost:3000";

export function getPublicRecipeUrl(recipeId: string): string {
  const configuredUrl = process.env.APP_URL?.trim();
  const appUrl = configuredUrl || (process.env.NODE_ENV === "production" ? null : LOCAL_APP_URL);

  if (!appUrl) {
    throw new Error("APP_URL must be configured to create public recipe links.");
  }

  const url = new URL(appUrl);
  url.pathname = `/r/${encodeURIComponent(recipeId)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
