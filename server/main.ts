import { closeApp, createApp } from "./app";
import { loadServerEnvironment } from "./env";
import { createGameState } from "./state";

const environment = loadServerEnvironment();
const state = createGameState({ config: environment.initialConfig, providers: environment.providers });
const app = createApp({ state });

let shuttingDown = false;

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  state.stop();
  void closeApp(app).then(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

app.listen(environment.port, () => {
  console.log(`Repo Isles listening on port ${environment.port}.`);
});
state.start();
