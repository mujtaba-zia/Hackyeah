/** The one plain-object guard for untrusted input (JSON, WebSocket payloads, API bodies). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
