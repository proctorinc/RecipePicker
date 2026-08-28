import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/lib/server/errors";

const {
  mockRequireAdminAccess,
  mockRequireHouseholdContext,
  mockRequireHouseholdRole,
  mockRunManualBoardSync,
} = vi.hoisted(() => ({
  mockRequireAdminAccess: vi.fn(),
  mockRequireHouseholdContext: vi.fn(),
  mockRequireHouseholdRole: vi.fn(),
  mockRunManualBoardSync: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireHouseholdContext: mockRequireHouseholdContext,
  requireHouseholdRole: mockRequireHouseholdRole,
}));

vi.mock("@/lib/server/access", () => ({
  requireAdminAccess: mockRequireAdminAccess,
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

import {
  forcePinterestResyncAction,
  syncBoardAction,
} from "@/lib/actions/board-actions";

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

describe("forcePinterestResyncAction", () => {
  it("blocks standard owners from forcing a Pinterest resync", async () => {
    mockRequireAdminAccess.mockRejectedValue(
      new AuthorizationError("This page requires admin access."),
    );

    const result = await forcePinterestResyncAction(
      { status: "idle", message: "" },
      new FormData(),
    );

    expect(result).toEqual({
      status: "error",
      message: "You do not have permission for this action.",
    });
  });
});
