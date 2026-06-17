import { describe, expect, it, vi } from "vitest";

const { mockServe } = vi.hoisted(() => ({
  mockServe: vi.fn(() => ({
    GET: "get-handler",
    POST: "post-handler",
    PUT: "put-handler",
  })),
}));

vi.mock("inngest/next", () => ({
  serve: mockServe,
}));

describe("/api/inngest", () => {
  it("registers the recipe parse function with the Inngest serve handler", async () => {
    const route = await import("@/app/api/inngest/route");

    expect(route.maxDuration).toBe(300);
    expect(mockServe).toHaveBeenCalledTimes(1);
    expect(mockServe).toHaveBeenCalledWith({
      client: expect.anything(),
      functions: [expect.anything()],
    });
    expect(route.GET).toBe("get-handler");
    expect(route.POST).toBe("post-handler");
    expect(route.PUT).toBe("put-handler");
  });
});
