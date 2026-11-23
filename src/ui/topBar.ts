import { summarizeEstate, type EstateSummary } from "../../shared/summary";
import type { Health, Severity } from "../../shared/types";
import type { PanelId, Store, UiState } from "../app/store";
import { copy, phaseLabel, providerLabel } from "./copy";
import { el } from "./dom";
import { ago, dot, statusBar } from "./parts";

const TOGGLES: readonly { id: PanelId; label: string }[] = [
  { id: "nav", label: copy.browse },
  { id: "legend", label: copy.legend },
  { id: "settings", label: copy.settings },
  { id: "mockLab", label: copy.mockLab },
];
/** How often "Updated … ago" is refreshed. */
const CLOCK_MS = 5000;
const SEVERITIES: readonly Severity[] = ["critical", "error", "warning"];

function statusText(state: UiState): string {
  if (state.connection !== "open") return state.connection === "reconnecting" ? copy.reconnecting : copy.connecting;
  const server = state.server;
  if (!server) return copy.waitingForServer;
  const parts = [providerLabel[server.status.provider], server.sourceLabel];
  if (server.status.phase !== "ok") parts.push(phaseLabel[server.status.phase]);
  return parts.filter(Boolean).join(" · ");
}

/** A phrase such as "24 repos" with its number standing out and the word receding. */
function figure(phrase: string): HTMLElement {
  const space = phrase.indexOf(" ");
  return el("span", { class: "figure" }, el("b", { text: phrase.slice(0, space) }), el("span", { class: "unit", text: phrase.slice(space) }));
}

function reposChip(estate: EstateSummary): HTMLElement[] {
  const parts = [figure(copy.repoCount(estate.repoTotal))];
  for (const health of ["bad", "warn"] as const satisfies readonly Health[]) {
    if (estate.repos[health] > 0) parts.push(el("span", { class: "tally" }, dot("health", health), String(estate.repos[health])));
  }
  return parts;
}

function pipelinesChip(estate: EstateSummary): HTMLElement[] {
  const parts = [statusBar(estate.statuses), figure(copy.pipelineCount(estate.pipelineTotal))];
  if (estate.statuses.failure > 0) {
    parts.push(el("span", { class: "tally", attrs: { "data-tone": "failure" }, text: `${estate.statuses.failure} ${copy.failing}` }));
  }
  if (estate.statuses.running > 0) {
    parts.push(el("span", { class: "tally", attrs: { "data-tone": "running" }, text: `${estate.statuses.running} ${copy.running}` }));
  }
  return parts;
}

function pullRequestsChip(estate: EstateSummary): HTMLElement[] {
  const parts = [figure(copy.prCount(estate.openPrs))];
  if (estate.attentionPrs > 0) parts.push(el("span", { class: "tally", text: `${estate.attentionPrs} ${copy.waiting}` }));
  return parts;
}

export function mountTopBar(root: HTMLElement, store: Store): void {
  const pill = el("span", { class: "pill", attrs: { role: "status", "aria-live": "polite" } });
  const updated = el("span", { class: "updated" });
  const message = el("span", { class: "status-message" });
  const openNav = (patch: Partial<UiState>) => store.set({ ...patch, panels: { ...store.get().panels, nav: true } });
  const chip = (name: string, onClick: () => void) =>
    el("button", { class: "chip", attrs: { type: "button", "data-chip": name }, on: { click: onClick } });
  const repos = chip("repos", () => openNav({ tab: "repos" }));
  const pipelines = chip("pipelines", () => {
    const failing = (store.get().server?.city?.towers ?? []).some((tower) => tower.status === "failure");
    openNav({ tab: "pipelines", status: failing ? "failure" : "all" });
  });
  const pullRequests = chip("prs", () => openNav({ tab: "repos" }));
  const problems = chip("problems", () => openNav({ tab: "problems" }));
  const chips = el("div", { class: "chips" }, repos, pipelines, pullRequests, problems);
  const buttons = TOGGLES.map(({ id, label }) =>
    el("button", {
      class: "toggle",
      text: label,
      attrs: { type: "button", "data-panel": id, "aria-pressed": "false" },
      on: { click: () => store.set({ panels: { ...store.get().panels, [id]: !store.get().panels[id] } }) },
    }),
  );
  root.append(el("h1", { class: "brand", text: copy.product }), pill, updated, chips, message, el("nav", { class: "toggles" }, ...buttons));

  function renderClock(state: UiState): void {
    const since = ago(state.server?.status.lastSuccessAt, Date.now());
    updated.textContent = since ? copy.updated(since) : "";
  }

  let lastCity: unknown = null;
  function render(state: UiState): void {
    pill.textContent = statusText(state);
    pill.dataset.state = state.connection !== "open" ? "offline" : (state.server?.status.phase ?? "loading");
    message.textContent = state.notice ?? state.server?.status.message ?? "";
    renderClock(state);
    const mock = state.server?.config.provider === "mock";
    TOGGLES.forEach(({ id }, index) => {
      const button = buttons[index];
      if (!button) return;
      button.hidden = id === "mockLab" && !mock;
      button.setAttribute("aria-pressed", String(state.panels[id]));
    });

    const city = state.server?.city ?? null;
    chips.hidden = city === null;
    if (city === lastCity || city === null) return;
    lastCity = city;
    const estate = summarizeEstate(city);
    repos.replaceChildren(...reposChip(estate));
    pipelines.replaceChildren(...pipelinesChip(estate));
    pullRequests.replaceChildren(...pullRequestsChip(estate));
    const total = city.incidents.length;
    const worst = SEVERITIES.find((severity) => estate.incidents[severity] > 0);
    problems.dataset.tone = worst ?? "clear";
    problems.replaceChildren(total === 0 ? el("span", { text: copy.allClear }) : figure(copy.problemsCount(total)));
  }

  render(store.get());
  store.subscribe(render);
  window.setInterval(() => renderClock(store.get()), CLOCK_MS);
}
