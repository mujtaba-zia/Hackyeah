import { existsSync, type Stats } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import { isRecord } from "../shared/guards";
import { decodeClientMessage, encode, SOCKET_PATH } from "../shared/protocol";
import type { MockOp, RunResult } from "../shared/types";
import { type GameState } from "./state";

export const MAX_CLIENT_MESSAGE_BYTES = 64 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const CONFIG_KEYS: Record<string, true> = {
  provider: true,
  scenario: true,
  watchedRepoIds: true,
  maxRepos: true,
  maxPrsPerRepo: true,
  pollSeconds: true,
  thresholds: true,
  rules: true,
  coverage: true,
};

const THRESHOLD_KEYS: Record<string, true> = {
  staleDays: true,
  waitingHours: true,
  crowdSize: true,
  draftPileup: true,
  failStreakHot: true,
  releaseStaleDays: true,
};

const RULE_KEYS: Record<string, true> = {
  pipelineFailing: true,
  sharedOutage: true,
  reviewCrowd: true,
  draftPileup: true,
  stalePrs: true,
  staleRelease: true,
  meltdown: true,
};

const PROVIDER_VALUES: Record<string, true> = {
  mock: true,
  azure: true,
  github: true,
};

const RUN_RESULT_VALUES: Record<RunResult, true> = {
  success: true,
  failure: true,
  partial: true,
  cancelled: true,
  running: true,
  queued: true,
  none: true,
};

export interface AppOptions {
  state: GameState;
  distDir?: string;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Record<string, true>): boolean {
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(allowed, key)) return false;
  }
  return true;
}

function isStringList(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) return false;
  }
  return true;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validNumberFields(value: Record<string, unknown>): boolean {
  for (const key of ["maxRepos", "maxPrsPerRepo", "pollSeconds"]) {
    if (value[key] !== undefined && !isFiniteNumber(value[key])) return false;
  }
  return true;
}

function validThresholds(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || !hasOnlyKeys(value, THRESHOLD_KEYS)) return false;
  for (const threshold of Object.values(value)) {
    if (!isFiniteNumber(threshold)) return false;
  }
  return true;
}

function validRules(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || !hasOnlyKeys(value, RULE_KEYS)) return false;
  for (const enabled of Object.values(value)) {
    if (typeof enabled !== "boolean") return false;
  }
  return true;
}

function validCoverage(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  for (const [pipeline, repos] of Object.entries(value)) {
    if (pipeline.length === 0 || !isStringList(repos)) return false;
  }
  return true;
}

function validConfigPatch(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !hasOnlyKeys(value, CONFIG_KEYS)) return false;
  if (value.provider !== undefined && (typeof value.provider !== "string" || !Object.hasOwn(PROVIDER_VALUES, value.provider))) {
    return false;
  }
  if (value.scenario !== undefined && (typeof value.scenario !== "string" || !/^[a-z0-9-]{1,64}$/.test(value.scenario))) {
    return false;
  }
  if (value.watchedRepoIds !== undefined && value.watchedRepoIds !== null && !isStringList(value.watchedRepoIds)) {
    return false;
  }
  return validNumberFields(value) && validThresholds(value.thresholds) && validRules(value.rules) && validCoverage(value.coverage);
}

function validMockOp(value: unknown): value is MockOp {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "setPipelineResult") {
    return hasOnlyKeys(value, { kind: true, pipelineId: true, result: true }) &&
      typeof value.pipelineId === "string" && value.pipelineId.length > 0 &&
      typeof value.result === "string" && Object.hasOwn(RUN_RESULT_VALUES, value.result);
  }
  if (value.kind === "addPullRequest") {
    return hasOnlyKeys(value, { kind: true, repoId: true, draft: true }) &&
      typeof value.repoId === "string" && value.repoId.length > 0 && typeof value.draft === "boolean";
  }
  if (value.kind === "addPipeline") {
    return hasOnlyKeys(value, { kind: true, repoId: true, release: true }) &&
      typeof value.repoId === "string" && value.repoId.length > 0 && typeof value.release === "boolean";
  }
  if (value.kind === "agePullRequests") {
    return hasOnlyKeys(value, { kind: true, days: true }) && isFiniteNumber(value.days) && value.days >= 0;
  }
  return value.kind === "reset" && hasOnlyKeys(value, { kind: true });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown, method: string | undefined): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  if (method !== "HEAD") response.end(body);
  else response.end();
}

function sendPlain(response: ServerResponse, statusCode: number, message: string, method: string | undefined): void {
  const body = Buffer.from(message, "utf8");
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  if (method !== "HEAD") response.end(body);
  else response.end();
}

async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  distDir: string,
): Promise<void> {
  if (!existsSync(distDir)) {
    sendPlain(response, 404, "Not found", request.method);
    return;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendPlain(response, 400, "Bad request", request.method);
    return;
  }
  if (decodedPath.includes("\0")) {
    sendPlain(response, 400, "Bad request", request.method);
    return;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const candidate = resolve(distDir, relativePath);
  if (candidate !== distDir && !candidate.startsWith(`${distDir}${sep}`)) {
    sendPlain(response, 403, "Forbidden", request.method);
    return;
  }

  let fileInfo: Stats;
  try {
    fileInfo = await stat(candidate);
  } catch {
    sendPlain(response, 404, "Not found", request.method);
    return;
  }
  if (!fileInfo.isFile()) {
    sendPlain(response, 404, "Not found", request.method);
    return;
  }

  let body: Buffer;
  try {
    body = await readFile(candidate);
  } catch {
    sendPlain(response, 404, "Not found", request.method);
    return;
  }
  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(candidate).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": body.length,
  });
  if (request.method !== "HEAD") response.end(body);
  else response.end();
}

function sendSocketError(socket: WebSocket, message: string): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(encode({ type: "error", message }));
}

function stringFromRawData(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return data;
}

/** Creates the one-port HTTP and websocket server used by the production app. */
export function createApp(options: AppOptions): Server {
  const distDir = resolve(options.distDir ?? `${process.cwd()}/dist`);
  const websocketServer = new WebSocketServer({ noServer: true });
  const app = createServer((request, response) => {
    void (async () => {
      let url: URL;
      try {
        url = new URL(request.url ?? "/", "http://localhost");
      } catch {
        sendPlain(response, 400, "Bad request", request.method);
        return;
      }

      if (url.pathname === "/health" && (request.method === "GET" || request.method === "HEAD")) {
        sendJson(response, 200, { ok: true }, request.method);
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        sendPlain(response, 404, "Not found", request.method);
        return;
      }
      await serveStatic(request, response, url.pathname, distDir);
    })().catch(() => {
      if (!response.headersSent) sendPlain(response, 500, "Internal server error", request.method);
      else response.destroy();
    });
  });

  function broadcastState(): void {
    const message = encode({ type: "state", state: options.state.getClientState() });
    for (const client of websocketServer.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  }

  async function handleSocketMessage(socket: WebSocket, data: RawData, isBinary: boolean): Promise<void> {
    if (isBinary) {
      sendSocketError(socket, "Messages must be UTF-8 JSON.");
      return;
    }
    const raw = stringFromRawData(data);
    if (raw.length > MAX_CLIENT_MESSAGE_BYTES) {
      sendSocketError(socket, "Message exceeds 64 KB.");
      return;
    }

    const message = decodeClientMessage(raw.toString("utf8"));
    if (message === null) {
      sendSocketError(socket, "Message is not valid client protocol JSON.");
      return;
    }

    if (message.type === "setConfig") {
      if (!hasOnlyKeys(message, { type: true, patch: true }) || !validConfigPatch(message.patch)) {
        sendSocketError(socket, "Configuration patch is invalid.");
        return;
      }
      const result = await options.state.setConfig(message.patch);
      if (result.error !== undefined) sendSocketError(socket, result.error);
      return;
    }
    if (message.type === "refresh") {
      if (!hasOnlyKeys(message, { type: true })) {
        sendSocketError(socket, "Refresh message is invalid.");
        return;
      }
      await options.state.refresh();
      return;
    }
    if (!hasOnlyKeys(message, { type: true, op: true }) || !validMockOp(message.op)) {
      sendSocketError(socket, "Mock operation is invalid.");
      return;
    }
    const result = await options.state.applyMockOp(message.op);
    if (result.error !== undefined) sendSocketError(socket, result.error);
  }

  websocketServer.on("connection", (socket) => {
    socket.send(encode({ type: "state", state: options.state.getClientState() }));
    socket.on("message", (data, isBinary) => {
      void handleSocketMessage(socket, data, isBinary).catch(() => {
        sendSocketError(socket, "Message could not be processed.");
      });
    });
    socket.on("error", () => {
      // A peer can disconnect while a response is queued; no server action is needed.
    });
  });

  app.on("upgrade", (request, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== SOCKET_PATH) {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request);
    });
  });

  const unsubscribe = options.state.subscribe(broadcastState);
  app.on("close", () => {
    unsubscribe();
    for (const client of websocketServer.clients) client.terminate();
    void websocketServer.close();
  });

  return app;
}
