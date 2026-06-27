// debug-log.ts — main process
// A single gate for logs that may contain screen-derived content, spoken text,
// transcribed user speech, or provider response bodies. These are SILENT by
// default and only print when BUILDY_DEBUG is set, so a production run never
// leaks the user's screen/voice content to stdout/log files.
//
// Use plain console.log/console.error ONLY for structural/lifecycle messages that
// embed no screen or user content (window created, cycle started, queue size,
// "window not found", etc.).

export function isDebug(): boolean {
  return !!process.env.BUILDY_DEBUG
}

/** Content-bearing log — printed only when BUILDY_DEBUG is set. */
export function debugLog(...args: unknown[]): void {
  if (isDebug()) console.log(...args)
}

/** Content-bearing error — printed only when BUILDY_DEBUG is set. */
export function debugError(...args: unknown[]): void {
  if (isDebug()) console.error(...args)
}
