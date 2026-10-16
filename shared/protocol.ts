import { isRecord } from "./guards";
import type { AppConfig, ClientState, MockOp } from "./types";

/** Path the WebSocket server listens on, relative to the page origin. */
export const SOCKET_PATH = "/ws";

export type ServerMessage = { type: "state"; state: ClientState } | { type: "error"; message: string };

export type ClientMessage =
  | { type: "setConfig"; patch: Partial<AppConfig> }
  | { type: "refresh" }
  | { type: "mockOp"; op: MockOp };

export function encode(message: ServerMessage | ClientMessage): string {
  return JSON.stringify(message);
}

const CLIENT_TYPES: Record<string, true> = { setConfig: true, refresh: true, mockOp: true };
const SERVER_TYPES: Record<string, true> = { state: true, error: true };

function parse(raw: string, allowed: Record<string, true>): { type: string } | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string" || !Object.hasOwn(allowed, value.type)) return null;
  return { ...value, type: value.type };
}

/** Shape check only; the server validates payloads before acting on them. */
export function decodeClientMessage(raw: string): ClientMessage | null {
  return parse(raw, CLIENT_TYPES) as ClientMessage | null;
}

export function decodeServerMessage(raw: string): ServerMessage | null {
  return parse(raw, SERVER_TYPES) as ServerMessage | null;
}
