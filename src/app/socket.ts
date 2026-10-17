import { decodeServerMessage, encode, type ClientMessage } from "../../shared/protocol";
import type { ClientState } from "../../shared/types";
import type { Connection } from "./store";

export interface SocketHandlers {
  onState(state: ClientState): void;
  onError(message: string): void;
  onConnection(connection: Connection): void;
}

/** Test seams: the WebSocket constructor and the timer. */
export interface SocketDeps {
  createSocket(url: string): WebSocket;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface ServerSocket {
  send(message: ClientMessage): boolean;
  close(): void;
}

export const FIRST_RETRY_MS = 1000;
export const MAX_RETRY_MS = 15_000;

const browserDeps: SocketDeps = {
  createSocket: (url) => new WebSocket(url),
  setTimer: (callback, ms) => window.setTimeout(callback, ms),
  clearTimer: (handle) => window.clearTimeout(handle as number),
};

/**
 * One WebSocket to the server that never gives up: retries start at 1 s and
 * double up to 15 s, and reset once a connection opens.
 */
export function connectServer(url: string, handlers: SocketHandlers, deps: SocketDeps = browserDeps): ServerSocket {
  let socket: WebSocket | null = null;
  let retryMs = FIRST_RETRY_MS;
  let timer: unknown = null;
  let closed = false;

  function open(): void {
    const current = deps.createSocket(url);
    socket = current;
    current.addEventListener("open", () => {
      retryMs = FIRST_RETRY_MS;
      handlers.onConnection("open");
    });
    current.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      const message = decodeServerMessage(event.data);
      if (message?.type === "state") handlers.onState(message.state);
      else if (message?.type === "error") handlers.onError(message.message);
    });
    current.addEventListener("close", () => {
      if (socket !== current || closed) return;
      socket = null;
      handlers.onConnection("reconnecting");
      timer = deps.setTimer(open, retryMs);
      retryMs = Math.min(MAX_RETRY_MS, retryMs * 2);
    });
  }

  handlers.onConnection("connecting");
  open();

  return {
    send(message) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(encode(message));
      return true;
    },
    close() {
      closed = true;
      if (timer !== null) deps.clearTimer(timer);
      socket?.close();
    },
  };
}

/** `ws(s)://<page host>/ws`, so dev (Vite proxy) and production (one port) both work. */
export function socketUrl(location: Location, path: string): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${path}`;
}
