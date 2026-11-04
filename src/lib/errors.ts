export class VaultError extends Error {
  constructor(public readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VaultError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof VaultError) return error.message;
  if (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) {
    return 'The request timed out or was cancelled. Check connectivity and retry.';
  }
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return 'The browser could not reach the gateway. Check network access and the relayer proxy or browser-access (CORS) configuration.';
  }
  return 'The operation could not be completed. Check gateway access, account authorization, and connectivity.';
}

export function invariant(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new VaultError(code, message);
}
