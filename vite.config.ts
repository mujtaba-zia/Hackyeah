import { defineConfig } from "vite";

const serverPort = Number(process.env.PORT ?? 8787);
const serverUrl = `http://127.0.0.1:${serverPort}`;

// The browser always talks to its own origin. In development Vite forwards the
// socket and health check to the Node server; in production that server serves
// the built page itself, so the same relative URLs work in both.
export default defineConfig({
  server: {
    proxy: {
      "/ws": { target: serverUrl.replace("http", "ws"), ws: true },
      "/health": serverUrl,
    },
  },
});
