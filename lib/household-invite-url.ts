const LOCAL_APP_URL = "http://localhost:3000";

export function getHouseholdInviteUrl(inviteToken: string): string {
  const configuredUrl = process.env.APP_URL?.trim();
  const appUrl = configuredUrl || (process.env.NODE_ENV === "production" ? null : LOCAL_APP_URL);

  if (!appUrl) {
    throw new Error("APP_URL must be configured to create household invite links.");
  }

  const url = new URL(appUrl);
  url.pathname = `/join/${encodeURIComponent(inviteToken)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
