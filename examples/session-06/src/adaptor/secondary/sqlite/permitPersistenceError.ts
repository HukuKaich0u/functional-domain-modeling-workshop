export class PermitPersistenceError extends Error {
  readonly kind = "PermitPersistenceError";

  constructor(
    readonly operation: "resolve" | "save-state" | "append-work-log",
    readonly cause: unknown,
  ) {
    super(`Permit persistence failed: ${operation}`, { cause });
  }
}
