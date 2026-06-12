export class AuthenticationError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission for this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function isAuthenticationError(error: unknown) {
  return (
    error instanceof AuthenticationError ||
    (error instanceof Error && error.message.includes("Authentication required"))
  );
}

export function isAuthorizationError(error: unknown) {
  return (
    error instanceof AuthorizationError ||
    (error instanceof Error &&
      (error.message.includes("requires") ||
        error.message.includes("permission") ||
        error.message.includes("Premium is required")))
  );
}
