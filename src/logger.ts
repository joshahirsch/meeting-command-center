const MAX_DETAIL_LENGTH = 500;

export function safeDetail(detail: string): string {
  if (detail.length <= MAX_DETAIL_LENGTH) return detail;
  return `${detail.slice(0, MAX_DETAIL_LENGTH)}… [truncated]`;
}

export function logInfo(message: string, context?: Record<string, string | number | boolean>): void {
  const suffix = context ? ` ${JSON.stringify(context)}` : "";
  console.log(`[INFO] ${message}${suffix}`);
}

export function logWarn(message: string, context?: Record<string, string | number | boolean>): void {
  const suffix = context ? ` ${JSON.stringify(context)}` : "";
  console.warn(`[WARN] ${message}${suffix}`);
}

export function logError(message: string, context?: Record<string, string | number | boolean>): void {
  const suffix = context ? ` ${JSON.stringify(context)}` : "";
  console.error(`[ERROR] ${message}${suffix}`);
}

export function formatError(err: unknown): string {
  if (err instanceof Error) return safeDetail(err.message);
  return safeDetail(String(err));
}
