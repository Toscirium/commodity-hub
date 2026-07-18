/**
 * Drop-in safe console replacement that sanitizes every argument.
 *
 * Usage in an edge function:
 *   import { safeLog } from "../_shared/safeConsole.ts";
 *   safeLog.error("payment failed", err, { userId });
 *
 * Prefer EdgeLogger for new code (it adds structured context). Use safeLog
 * when migrating existing console.* calls quickly.
 */

import { sanitize } from "./sanitize.ts";

function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map((a) => sanitize(a));
}

export const safeLog = {
  log: (...args: unknown[]) => console.log(...sanitizeArgs(args)),
  info: (...args: unknown[]) => console.info(...sanitizeArgs(args)),
  warn: (...args: unknown[]) => console.warn(...sanitizeArgs(args)),
  error: (...args: unknown[]) => console.error(...sanitizeArgs(args)),
  debug: (...args: unknown[]) => console.debug(...sanitizeArgs(args)),
};