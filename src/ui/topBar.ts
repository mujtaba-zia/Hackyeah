import type { PanelId, Store, UiState } from "../app/store";
import { copy, phaseLabel, providerLabel } from "./copy";
import { el } from "./dom";

const TOGGLES: readonly { id: PanelId; label: string }[] = [
  { id: "problems", label: copy.problems },
  { id: "legend", label: copy.legend },
  { id: "settings", label: copy.settings },
  { id: "mockLab", label: copy.mockLab },
];

function statusText(state: UiState): string {
  if (state.connection !== "open") return state.connection === "reconnecting" ? copy.reconnecting : copy.connecting;
  const server = state.server;
  if (!server) return copy.waitingForServer;
  const parts = [providerLabel[server.status.provider], server.sourceLabel];
  if (server.city) parts.push(copy.problemsCount(server.city.incidents.length));
  if (server.status.phase !== "ok") parts.push(phaseLabel[server.status.phase]);
  return parts.filter(Boolean).join(" · ");
}

export function mountTopBar(root: HTMLElement, store: Store): void {
  const pill = el("span", { class: "pill", attrs: { role: "status", "aria-live": "polite" } });
  const message = el("span", { class: "status-message" });
  const buttons = TOGGLES.map(({ id, label }) =>
    el("button", {
      class: "toggle",
      text: label,
      attrs: { type: "button", "data-panel": id, "aria-pressed": "false" },
      on: { click: () => store.set({ panels: { ...store.get().panels, [id]: !store.get().panels[id] } }) },
    }),
  );
  root.append(el("h1", { class: "brand", text: copy.product }), pill, message, el("nav", { class: "toggles" }, ...buttons));

  function render(state: UiState): void {
    pill.textContent = statusText(state);
    pill.dataset.state = state.connection !== "open" ? "offline" : (state.server?.status.phase ?? "loading");
    message.textContent = state.notice ?? state.server?.status.message ?? "";
    const mock = state.server?.config.provider === "mock";
    TOGGLES.forEach(({ id }, index) => {
      const button = buttons[index];
      if (!button) return;
      button.hidden = id === "mockLab" && !mock;
      button.setAttribute("aria-pressed", String(state.panels[id]));
    });
  }

  render(store.get());
  store.subscribe(render);
}
