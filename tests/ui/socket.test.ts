import { describe, expect, it } from "vitest";
import { connectServer, FIRST_RETRY_MS, MAX_RETRY_MS, type SocketDeps } from "../../src/app/socket";
import type { Connection } from "../../src/app/store";

class FakeSocket extends EventTarget {
  readyState = 0;
  sent: string[] = [];
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.dispatchEvent(new Event("close"));
  }
  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  drop(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const delays: number[] = [];
  const pending: (() => void)[] = [];
  const connections: Connection[] = [];
  const deps: SocketDeps = {
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    setTimer: (callback, ms) => {
      delays.push(ms);
      pending.push(callback);
      return pending.length;
    },
    clearTimer: () => {},
  };
  const server = connectServer("ws://test/ws", { onState: () => {}, onError: () => {}, onConnection: (c) => connections.push(c) }, deps);
  const fireTimer = () => pending.shift()?.();
  return { server, sockets, delays, connections, fireTimer };
}

describe("connectServer", () => {
  it("backs off from 1 s doubling to a 15 s cap while the server is away", () => {
    const { sockets, delays, fireTimer } = harness();
    for (let attempt = 0; attempt < 7; attempt += 1) {
      sockets.at(-1)?.drop();
      fireTimer();
    }
    expect(delays).toEqual([FIRST_RETRY_MS, 2000, 4000, 8000, MAX_RETRY_MS, MAX_RETRY_MS, MAX_RETRY_MS]);
    expect(sockets).toHaveLength(8);
  });

  it("starts over at 1 s once a connection succeeds", () => {
    const { sockets, delays, connections, fireTimer } = harness();
    sockets[0]?.drop();
    fireTimer();
    sockets[1]?.drop();
    fireTimer();
    sockets[2]?.open();
    sockets[2]?.drop();
    expect(delays).toEqual([1000, 2000, 1000]);
    expect(connections).toEqual(["connecting", "reconnecting", "reconnecting", "open", "reconnecting"]);
  });

  it("refuses to send while disconnected and stops retrying after close()", () => {
    const { server, sockets, delays } = harness();
    expect(server.send({ type: "refresh" })).toBe(false);
    sockets[0]?.open();
    expect(server.send({ type: "refresh" })).toBe(true);
    expect(sockets[0]?.sent).toEqual(['{"type":"refresh"}']);
    server.close();
    expect(delays).toEqual([]);
  });
});
