import { afterEach, describe, expect, it, vi } from "vitest";

import { getHouseholdInviteUrl } from "@/lib/household-invite-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getHouseholdInviteUrl", () => {
  it("creates an absolute invite URL using the configured app origin", () => {
    vi.stubEnv("APP_URL", "https://recipes.example.com");

    expect(getHouseholdInviteUrl("invite_abc")).toBe("https://recipes.example.com/join/invite_abc");
  });

  it("uses localhost during development", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(getHouseholdInviteUrl("invite_abc")).toBe("http://localhost:3000/join/invite_abc");
  });
});
