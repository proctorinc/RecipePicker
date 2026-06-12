import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

export type RequestSource = "api" | "server_action" | "background_job" | "script";

export type RequestActorContext = {
  clerkUserId?: string | null;
  householdId?: string | null;
  householdRole?: string | null;
  appRole?: string | null;
};

export type RequestContext = {
  requestId: string;
  source: RequestSource;
  name: string;
  parentRequestId?: string | null;
  actor?: RequestActorContext;
  target?: Record<string, string | number | boolean | null | undefined>;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function generateRequestId() {
  return crypto.randomUUID();
}

export function getRequestContext() {
  return storage.getStore() ?? null;
}

export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => Promise<T> | T,
) {
  return storage.run(context, fn);
}

export function updateRequestContext(
  patch: Partial<Omit<RequestContext, "requestId" | "source" | "name">> & {
    actor?: Partial<RequestActorContext>;
  },
) {
  const current = storage.getStore();

  if (!current) {
    return null;
  }

  const next: RequestContext = {
    ...current,
    ...patch,
    actor: patch.actor
      ? {
          ...current.actor,
          ...patch.actor,
        }
      : current.actor,
    target: patch.target
      ? {
          ...current.target,
          ...patch.target,
        }
      : current.target,
  };

  storage.enterWith(next);
  return next;
}

export function ensureRequestContext(input: {
  requestId?: string | null;
  source: RequestSource;
  name: string;
}) {
  return (
    getRequestContext() ?? {
      requestId: input.requestId?.trim() || generateRequestId(),
      source: input.source,
      name: input.name,
    }
  );
}

export function createChildRequestContext(input: {
  name: string;
  source?: RequestSource;
  target?: RequestContext["target"];
}) {
  const parent = getRequestContext();

  return {
    requestId: generateRequestId(),
    source: input.source ?? "background_job",
    name: input.name,
    parentRequestId: parent?.requestId ?? null,
    actor: parent?.actor,
    target: input.target ?? parent?.target,
  } satisfies RequestContext;
}
