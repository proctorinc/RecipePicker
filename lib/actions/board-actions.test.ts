import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/lib/server/errors";

const {
  mockRequireHouseholdRole,
  mockRunManualBoardSync,
} = vi.hoisted(() => ({
  mockRequireHouseholdRole: vi.fn(),
  mockRunManualBoardSync: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireHouseholdRole: mockRequireHouseholdRole,
}));

vi.mock("@/lib/server/sync", () => ({
  runManualBoardSync: mockRunManualBoardSync,
  runManualSyncAllBoards: vi.fn(),
}));

vi.mock("@/lib/server/extract", () => ({
  extractRecipes: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
  openDatabase: vi.fn(),
}));

vi.mock("@/lib/server/logger", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/logger")>(
    "@/lib/server/logger",
  );
  return actual;
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { syncBoardAction } from "@/lib/actions/board-actions";

describe("syncBoardAction", () => {
  it("blocks non-owners from triggering board sync", async () => {
    mockRequireHouseholdRole.mockRejectedValue(
      new AuthorizationError("This action requires owner access."),
    );

    const formData = new FormData();
    formData.set("boardId", "board_1");

    const result = await syncBoardAction(
      { status: "idle", message: "" },
      formData,
    );

    expect(result).toEqual({
      status: "error",
      message: "You do not have permission for this action.",
    });
    expect(mockRunManualBoardSync).not.toHaveBeenCalled();
  });
});
