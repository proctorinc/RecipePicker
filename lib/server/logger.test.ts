import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  REQUEST_ID_HEADER,
  logInfo,
  sanitizeForLogging,
  withActionLogging,
  withRouteLogging,
} from "@/lib/server/logger";
import { runWithRequestContext, updateRequestContext } from "@/lib/server/request-context";

type ParsedLog = Record<string, unknown>;

function captureLogs() {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(((chunk: string | Uint8Array) => {
      stdoutLines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(((chunk: string | Uint8Array) => {
      stderrLines.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);

  return {
    getStdoutLogs() {
      return stdoutLines
        .join("")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ParsedLog);
    },
    getStderrLogs() {
      return stderrLines
        .join("")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ParsedLog);
    },
    restore() {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
}

function walk(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".next")) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("sanitizeForLogging", () => {
  it("redacts secrets and omits free-form text fields", () => {
    expect(
      sanitizeForLogging({
        authorization: "Bearer secret",
        apiKey: "sk-test",
        prompt: "show me pasta",
        note: "family note",
        summary: "free form",
        nested: {
          refresh_token: "refresh",
          ingredientsJson: "[\"eggs\"]",
        },
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      apiKey: "[REDACTED]",
      prompt: "[REDACTED]",
      note: "[REDACTED]",
      summary: "[REDACTED]",
      nested: {
        refresh_token: "[REDACTED]",
        ingredientsJson: "[OMITTED]",
      },
    });
  });
});

describe("logger wrappers", () => {
  let originalLogLevel: string | undefined;

  beforeEach(() => {
    originalLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "debug";
  });

  afterEach(() => {
    process.env.LOG_LEVEL = originalLogLevel;
    vi.restoreAllMocks();
  });

  it("includes request context actor metadata", () => {
    const logs = captureLogs();

    runWithRequestContext(
      {
        requestId: "req-123",
        source: "server_action",
        name: "test.action",
      },
      () => {
        updateRequestContext({
          actor: {
            clerkUserId: "user_123",
            householdId: "household_123",
          },
        });
        logInfo("test.event");
      },
    );

    const [record] = logs.getStdoutLogs();
    logs.restore();

    expect(record.requestId).toBe("req-123");
    expect(record.actor).toEqual({
      clerkUserId: "user_123",
      householdId: "household_123",
    });
  });

  it("mirrors request ids on wrapped routes and logs completion", async () => {
    const logs = captureLogs();
    const handler = withRouteLogging("api.test", async () => new Response("ok", { status: 201 }));

    const response = await handler(
      new Request("https://example.com/api/test", {
        method: "POST",
        headers: {
          [REQUEST_ID_HEADER]: "req-route-1",
        },
      }),
    );

    const records = logs.getStdoutLogs();
    logs.restore();

    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("req-route-1");
    expect(records).toHaveLength(2);
    expect(records[0].event).toBe("api.test.request.started");
    expect(records[1].event).toBe("api.test.request.completed");
    expect(records[1].http).toMatchObject({
      method: "POST",
      path: "/api/test",
      statusCode: 201,
    });
  });

  it("creates request ids for wrapped actions and only logs sanitized metadata", async () => {
    const logs = captureLogs();
    const action = withActionLogging(
      "action.test",
      async (_state: { status: string; message: string }, _formData: FormData) => ({ status: "success", message: "ok" }),
      {
        getStartData: () => ({
          prompt: "secret prompt",
          apiKey: "sk-secret",
          target: {
            recipeId: "recipe_123",
          },
        }),
      },
    );

    await action({ status: "idle", message: "" }, new FormData());

    const records = logs.getStdoutLogs();
    logs.restore();

    expect(records).toHaveLength(2);
    expect(records[0].requestId).toBeTruthy();
    expect(records[0].prompt).toBe("[REDACTED]");
    expect(records[0].apiKey).toBe("[REDACTED]");
    expect(records[0].target).toEqual({
      recipeId: "recipe_123",
    });
  });
});

describe("console regression", () => {
  it("keeps runtime code free of raw console usage", () => {
    const root = process.cwd();
    const targets = [
      path.join(root, "app"),
      path.join(root, "lib"),
      path.join(root, "src"),
      path.join(root, "middleware.ts"),
    ];

    const files = targets.flatMap((target) => {
      const stats = fs.statSync(target);
      return stats.isDirectory() ? walk(target) : [target];
    });

    const offenders = files.filter((filePath) =>
      fs.readFileSync(filePath, "utf8").includes("console."),
    );

    expect(offenders).toEqual([]);
  });
});
