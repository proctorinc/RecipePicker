import { ZodError } from "zod";

import {
  isAuthenticationError,
  isAuthorizationError,
} from "@/lib/server/errors";
import {
  createChildRequestContext,
  ensureRequestContext,
  generateRequestId,
  getRequestContext,
  runWithRequestContext,
  type RequestContext,
  type RequestSource,
} from "@/lib/server/request-context";

export const REQUEST_ID_HEADER = "x-request-id";
export { isAuthenticationError, isAuthorizationError } from "@/lib/server/errors";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogEventName = string;
export type SanitizedLogData = Record<string, unknown>;

type LogRecord = {
  timestamp: string;
  level: LogLevel;
  event: LogEventName;
  message: string;
  requestId: string | null;
  source: RequestSource | null;
  parentRequestId?: string | null;
  actor?: RequestContext["actor"];
  target?: RequestContext["target"];
  http?: Record<string, unknown>;
  result?: Record<string, unknown>;
  durationMs?: number;
  category?: string;
  error?: Record<string, unknown>;
} & SanitizedLogData;

type RouteWrapperOptions<TArgs extends unknown[]> = {
  getStartData?: (request: Request, ...args: TArgs) => SanitizedLogData;
  getSuccessData?: (response: Response, request: Request, ...args: TArgs) => SanitizedLogData;
  onError?: (error: unknown, request: Request, ...args: TArgs) => Response | Promise<Response>;
};

type ActionResult =
  | { status: string; message?: string }
  | { status: string; message?: string; [key: string]: unknown };

type ActionWrapperOptions<TArgs extends unknown[], TResult extends ActionResult> = {
  getStartData?: (...args: TArgs) => SanitizedLogData;
  getResultData?: (result: TResult, ...args: TArgs) => SanitizedLogData;
  getFailureLevel?: (result: TResult) => Extract<LogLevel, "warn" | "error">;
};

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = "[REDACTED]";
const OMITTED = "[OMITTED]";
const SENSITIVE_KEYS = new Set([
  "access_token",
  "accessToken",
  "accessTokenEncrypted",
  "apiKey",
  "authorization",
  "clientSecret",
  "code",
  "cookie",
  "cookies",
  "error_description",
  "inviteToken",
  "note",
  "oauthError",
  "originalText",
  "prompt",
  "refresh_token",
  "refreshToken",
  "refreshTokenEncrypted",
  "state",
  "stepText",
  "summary",
  "text",
  "token",
]);

const OMITTED_TEXT_KEYS = new Set([
  "aiSuggestionsJson",
  "attributes",
  "description",
  "feedback",
  "ingredients",
  "ingredientsJson",
  "message",
  "messages",
  "normalizedIngredientPhrase",
  "note",
  "notes",
  "prompt",
  "steps",
  "stepsJson",
  "summary",
  "title",
]);

function getConfiguredLogLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();

  if (raw === "debug" || raw === "warn" || raw === "error") {
    return raw;
  }

  return "info";
}

function shouldLog(level: LogLevel) {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[getConfiguredLogLevel()];
}

function sanitizeKeyValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.has(key)) {
    return REDACTED;
  }

  if (OMITTED_TEXT_KEYS.has(key)) {
    return OMITTED;
  }

  return sanitizeForLogging(value);
}

export function sanitizeForLogging(value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForLogging(entry));
  }

  if (value instanceof URL) {
    return value.pathname;
  }

  if (typeof value === "object") {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      sanitizeKeyValue(key, entry),
    ]);

    return Object.fromEntries(sanitizedEntries);
  }

  return String(value);
}

export function serializeError(error: unknown) {
  if (error instanceof ZodError) {
    return {
      name: error.name,
      message: "Validation failed.",
      issues: error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join("."),
      })),
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

function buildLogRecord(
  level: LogLevel,
  event: LogEventName,
  message: string,
  data: SanitizedLogData = {},
  error?: unknown,
): LogRecord {
  const context = getRequestContext();
  const sanitizedData = sanitizeForLogging(data) as SanitizedLogData;

  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
    requestId: context?.requestId ?? null,
    source: context?.source ?? null,
    parentRequestId: context?.parentRequestId ?? null,
    actor: context?.actor,
    target: context?.target,
    ...sanitizedData,
    ...(error ? { error: serializeError(error) } : {}),
  };
}

function writeLog(level: LogLevel, record: LogRecord) {
  if (!shouldLog(level)) {
    return;
  }

  const line = `${JSON.stringify(record)}\n`;

  if (level === "error") {
    process.stderr.write(line);
    return;
  }

  process.stdout.write(line);
}

export function logDebug(event: LogEventName, data?: SanitizedLogData) {
  writeLog("debug", buildLogRecord("debug", event, event, data));
}

export function logInfo(event: LogEventName, data?: SanitizedLogData) {
  writeLog("info", buildLogRecord("info", event, event, data));
}

export function logWarn(event: LogEventName, data?: SanitizedLogData) {
  writeLog("warn", buildLogRecord("warn", event, event, data));
}

export function logError(event: LogEventName, error: unknown, data?: SanitizedLogData) {
  writeLog("error", buildLogRecord("error", event, event, data, error));
}

export function logAudit(event: LogEventName, data?: SanitizedLogData) {
  writeLog("info", buildLogRecord("info", event, event, { category: "audit", ...data }));
}

export function toErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof ZodError) {
    return new Response(JSON.stringify({ message: fallbackMessage }), {
      status: 400,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  if (isAuthenticationError(error)) {
    return new Response(JSON.stringify({ message: "Authentication required." }), {
      status: 401,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  if (isAuthorizationError(error)) {
    return new Response(JSON.stringify({ message: "You do not have permission for this action." }), {
      status: 403,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  return new Response(JSON.stringify({ message: fallbackMessage }), {
    status: 500,
    headers: {
      "content-type": "application/json",
    },
  });
}

export function classifyRouteErrorLevel(error: unknown): Extract<LogLevel, "warn" | "error"> {
  if (error instanceof ZodError || isAuthenticationError(error) || isAuthorizationError(error)) {
    return "warn";
  }

  return "error";
}

export function withRouteLogging<TArgs extends unknown[]>(
  routeName: string,
  handler: (request: Request, ...args: TArgs) => Promise<Response>,
  options: RouteWrapperOptions<TArgs> = {},
) {
  return async function loggedRoute(request: Request, ...args: TArgs) {
    const url = new URL(request.url);
    const context = ensureRequestContext({
      requestId: request.headers.get(REQUEST_ID_HEADER),
      source: "api",
      name: routeName,
    });
    const startedAt = Date.now();

    return runWithRequestContext(context, async () => {
      logInfo(`${routeName}.request.started`, {
        http: {
          method: request.method,
          path: url.pathname,
        },
        ...options.getStartData?.(request, ...args),
      });

      try {
        const response = await handler(request, ...args);
        const durationMs = Date.now() - startedAt;
        response.headers.set(REQUEST_ID_HEADER, context.requestId);
        const level = response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info";
        const logData = {
          http: {
            method: request.method,
            path: url.pathname,
            statusCode: response.status,
          },
          durationMs,
          result: {
            status: response.status < 400 ? "success" : "error",
          },
          ...options.getSuccessData?.(response, request, ...args),
        };

        if (level === "error") {
          logError(`${routeName}.request.completed`, new Error(`HTTP ${response.status}`), logData);
        } else if (level === "warn") {
          logWarn(`${routeName}.request.completed`, logData);
        } else {
          logInfo(`${routeName}.request.completed`, logData);
        }

        return response;
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const response = await (options.onError?.(error, request, ...args) ?? toErrorResponse(error, "Request failed."));
        response.headers.set(REQUEST_ID_HEADER, context.requestId);
        const level = classifyRouteErrorLevel(error);

        if (level === "warn") {
          logWarn(`${routeName}.request.failed`, {
            http: {
              method: request.method,
              path: url.pathname,
              statusCode: response.status,
            },
            durationMs,
            result: {
              status: "error",
            },
            error: serializeError(error),
          });
        } else {
          logError(`${routeName}.request.failed`, error, {
            http: {
              method: request.method,
              path: url.pathname,
              statusCode: response.status,
            },
            durationMs,
            result: {
              status: "error",
            },
          });
        }

        return response;
      }
    });
  };
}

export function withActionLogging<TArgs extends unknown[], TResult extends ActionResult>(
  actionName: string,
  handler: (...args: TArgs) => Promise<TResult>,
  options: ActionWrapperOptions<TArgs, TResult> = {},
) {
  return async function loggedAction(...args: TArgs) {
    const existingContext = getRequestContext();
    const context =
      existingContext ??
      ensureRequestContext({
        requestId: generateRequestId(),
        source: "server_action",
        name: actionName,
      });
    const startedAt = Date.now();

    return runWithRequestContext(context, async () => {
      logInfo(`${actionName}.started`, {
        ...options.getStartData?.(...args),
      });

      try {
        const result = await handler(...args);
        const durationMs = Date.now() - startedAt;
        const failureLevel = options.getFailureLevel?.(result) ?? "warn";

        if (result.status === "success") {
          logInfo(`${actionName}.completed`, {
            durationMs,
            result: {
              status: result.status,
            },
            ...options.getResultData?.(result, ...args),
          });
        } else if (failureLevel === "error") {
          logError(`${actionName}.failed`, new Error(result.message ?? "Action failed."), {
            durationMs,
            result: {
              status: result.status,
            },
            ...options.getResultData?.(result, ...args),
          });
        } else {
          logWarn(`${actionName}.failed`, {
            durationMs,
            result: {
              status: result.status,
            },
            ...options.getResultData?.(result, ...args),
          });
        }

        return result;
      } catch (error) {
        logError(`${actionName}.failed`, error, {
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
    });
  };
}

export async function runBackgroundJob<T>(input: {
  name: string;
  target?: RequestContext["target"];
  fn: () => Promise<T>;
}) {
  const context = createChildRequestContext({
    name: input.name,
    target: input.target,
  });
  const startedAt = Date.now();

  return runWithRequestContext(context, async () => {
    logInfo(`${input.name}.started`);

    try {
      const result = await input.fn();
      logInfo(`${input.name}.completed`, {
        durationMs: Date.now() - startedAt,
        result: {
          status: "success",
        },
      });
      return result;
    } catch (error) {
      logError(`${input.name}.failed`, error, {
        durationMs: Date.now() - startedAt,
        result: {
          status: "error",
        },
      });
      throw error;
    }
  });
}

export async function runScriptWithLogging<T>(input: {
  scriptName: string;
  target?: RequestContext["target"];
  fn: () => Promise<T>;
}) {
  return runWithRequestContext(
    {
      requestId: generateRequestId(),
      source: "script",
      name: input.scriptName,
      target: input.target,
    },
    async () => {
      logInfo(`${input.scriptName}.started`);

      try {
        const result = await input.fn();
        logInfo(`${input.scriptName}.completed`, {
          result: {
            status: "success",
          },
        });
        return result;
      } catch (error) {
        logError(`${input.scriptName}.failed`, error, {
          result: {
            status: "error",
          },
        });
        throw error;
      }
    },
  );
}

export function maybeWithSqliteTarget(targetLabel: string) {
  if (process.env.LOG_INCLUDE_DEBUG_SQLITE_TARGETS?.trim().toLowerCase() !== "true") {
    return {};
  }

  return {
    target: {
      sqliteTarget: targetLabel,
    },
  };
}
