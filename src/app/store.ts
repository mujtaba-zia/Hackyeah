import type { ClientState, RunResult, Severity } from "../../shared/types";
import type { PickTarget } from "../render/index";

export type Connection = "connecting" | "open" | "reconnecting";
export type PanelId = "nav" | "legend" | "settings" | "mockLab";
/** The lists the navigation panel can show. */
export type NavTab = "problems" | "repos" | "pipelines";

export interface UiState {
  /** Last state pushed by the server; null until the first message. */
  server: ClientState | null;
  connection: Connection;
  selection: PickTarget | null;
  panels: Record<PanelId, boolean>;
  tab: NavTab;
  /** Text typed into the navigation panel's search box; filters the list on show. */
  query: string;
  /** Problems list: only this severity, or every severity. */
  severity: Severity | "all";
  /** Pipelines list: only this status, or every status. */
  status: RunResult | "all";
  /** What the pointer is over in the world. */
  hover: PickTarget | null;
  /** Transient message from the server about the last request. */
  notice: string | null;
  webgl: boolean;
}

export interface Store {
  get(): UiState;
  set(patch: Partial<UiState>): void;
  subscribe(listener: (state: UiState, previous: UiState) => void): () => void;
}

export function createStore(initial: UiState): Store {
  let state = initial;
  const listeners = new Set<(state: UiState, previous: UiState) => void>();
  return {
    get: () => state,
    set(patch) {
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Drops a selection whose entity disappeared from the newest world. */
export function reconcileSelection(selection: PickTarget | null, server: ClientState | null): PickTarget | null {
  const city = server?.city;
  if (!selection || !city) return null;
  const pool = selection.kind === "district" ? city.districts : selection.kind === "creature" ? city.creatures : city.towers;
  return pool.some((item) => item.id === selection.id) ? selection : null;
}
