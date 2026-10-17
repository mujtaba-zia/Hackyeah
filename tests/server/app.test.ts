import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";

import { MAX_CLIENT_MESSAGE_BYTES, createApp } from "../../server/app";
import { createMockProvider } from "../../server/providers/mock";
import { createGameState } from "../../server/state";
import { DEFAULT_CONFIG } from "../../shared/config";
import { decodeServerMessage, type ServerMessage } from "../../shared/protocol";

const NOW = new Date("2026-10-16T12:00:00.000Z");

function messageText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

function nextMessage(socket: WebSocket): Promise<ServerMessage> {
  const deferred = Promise.withResolvers<ServerMessage>();
  socket.once("message", (data: RawData) => {
    const message = decodeServerMessage(messageText(data));
    if (message === null) deferred.reject(new Error("Server sent an invalid protocol message"));
    else deferred.resolve(message);
  });
  socket.once("error", deferred.reject);
  return deferred.promise;
}

function connect(url: string): Promise<{ socket: WebSocket; initial: ServerMessage }> {
  const deferred = Promise.withResolvers<{ socket: WebSocket; initial: ServerMessage }>();
  const socket = new WebSocket(url);
  socket.once("message", (data: RawData) => {
    const initial = decodeServerMessage(messageText(data));
    if (initial === null) deferred.reject(new Error("Server sent an invalid initial state"));
    else deferred.resolve({ socket, initial });
  });
  socket.once("error", deferred.reject);
  return deferred.promise;
}

function listen(server: Server): Promise<number> {
  const deferred = Promise.withResolvers<number>();
  server.once("error", deferred.reject);
  server.listen(0, "127.0.0.1", () => {
    server.off("error", deferred.reject);
    const address = server.address();
    if (address === null || typeof address === "string") {
      deferred.reject(new Error("Server did not bind a TCP port"));
      return;
    }
    deferred.resolve(address.port);
  });
  return deferred.promise;
}

function closeSocket(socket: WebSocket): Promise<void> {
  const deferred = Promise.withResolvers<void>();
  socket.once("close", deferred.resolve);
  socket.close();
  return deferred.promise;
}

function closeServer(server: Server): Promise<void> {
  const deferred = Promise.withResolvers<void>();
  server.close((error) => {
    if (error) deferred.reject(error);
    else deferred.resolve();
  });
  return deferred.promise;
}

describe("server app", () => {
  it("serves health and static files and synchronizes websocket clients", async () => {
    const distDir = mkdtempSync(join(tmpdir(), "repo-isles-dist-"));
    writeFileSync(join(distDir, "index.html"), "<main>Repo Isles</main>", "utf8");
    const mock = createMockProvider({ now: () => NOW });
    const state = createGameState({
      config: DEFAULT_CONFIG,
      providers: { mock },
      now: () => NOW,
      logger: { log(): void {} },
    });
    await state.poll();
    const app = createApp({ state, distDir });
    const port = await listen(app);
    const httpUrl = `http://127.0.0.1:${port}`;
    const websocketUrl = `ws://127.0.0.1:${port}/ws`;
    let first: WebSocket | undefined;
    let second: WebSocket | undefined;

    try {
      const health = await fetch(`${httpUrl}/health`);
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toEqual({ ok: true });

      const page = await fetch(`${httpUrl}/`);
      expect(page.status).toBe(200);
      await expect(page.text()).resolves.toContain("Repo Isles");
      const traversal = await fetch(`${httpUrl}/%2e%2e%2fpackage.json`);
      expect(traversal.status).not.toBe(200);

      const firstConnection = await connect(websocketUrl);
      first = firstConnection.socket;
      const secondConnection = await connect(websocketUrl);
      second = secondConnection.socket;
      expect(firstConnection.initial.type).toBe("state");
      expect(secondConnection.initial.type).toBe("state");
      if (firstConnection.initial.type === "state") expect(firstConnection.initial.state.city).not.toBeNull();

      const firstBroadcast = nextMessage(first);
      const secondBroadcast = nextMessage(second);
      first.send(JSON.stringify({ type: "setConfig", patch: { thresholds: { waitingHours: 72 } } }));
      const [firstState, secondState] = await Promise.all([firstBroadcast, secondBroadcast]);
      expect(firstState.type).toBe("state");
      expect(secondState.type).toBe("state");
      if (firstState.type === "state") expect(firstState.state.config.thresholds.waitingHours).toBe(72);
      if (secondState.type === "state") expect(secondState.state.config.thresholds.waitingHours).toBe(72);

      const invalidReply = nextMessage(first);
      first.send(JSON.stringify({ type: "setConfig", patch: { unknown: true } }));
      await expect(invalidReply).resolves.toMatchObject({ type: "error" });

      const oversizedReply = nextMessage(first);
      first.send("x".repeat(MAX_CLIENT_MESSAGE_BYTES + 1));
      await expect(oversizedReply).resolves.toMatchObject({ type: "error" });
    } finally {
      if (first !== undefined) await closeSocket(first);
      if (second !== undefined) await closeSocket(second);
      await closeServer(app);
      rmSync(distDir, { recursive: true, force: true });
    }
  });
});
