import "./styles.css";
import "./world.css";
import { paletteVariables } from "../shared/palette";
import { SOCKET_PATH } from "../shared/protocol";
import { connectServer, socketUrl } from "./app/socket";
import { createStore, reconcileSelection } from "./app/store";
import { createWorldView, loadModelKit, type ViewInsets, type WorldView } from "./render/index";
import type { HudActions } from "./ui/actions";
import { copy } from "./ui/copy";
import { mountDetail } from "./ui/detail";
import { mountLegend } from "./ui/legend";
import { mountMockLab } from "./ui/mockLab";
import { mountNav } from "./ui/nav";
import { mountSettings } from "./ui/settings";
import { mountTooltip } from "./ui/tooltip";
import { mountTopBar } from "./ui/topBar";
import { mountViewControls } from "./ui/viewControls";

const NOTICE_MS = 4000;
/** A panel at least this share of the window wide lies across the view as a sheet; a narrower one stands beside it as a column. */
const SHEET_SHARE = 0.7;
/** Panels may cover the view, but `fit` and `goTo` never aim at less than this share of its width or of its height. */
const MIN_FREE_SHARE = 0.3;

function requireElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing #${id}`);
  return node;
}

for (const [name, value] of Object.entries(paletteVariables())) document.documentElement.style.setProperty(name, value);

const canvas = requireElement("world", HTMLCanvasElement);
const topBar = requireElement("top-bar", HTMLElement);
const nav = requireElement("nav", HTMLElement);
const rightColumn = requireElement("detail", HTMLElement).parentElement;
const store = createStore({
  server: null,
  connection: "connecting",
  selection: null,
  panels: { nav: true, legend: false, settings: false, mockLab: false },
  tab: "problems",
  query: "",
  severity: "all",
  status: "all",
  hover: null,
  notice: null,
  webgl: true,
});

let view: WorldView | null = null;

/** The canvas area panels leave free, so the camera centres on what is actually visible. */
function measureInsets(): ViewInsets {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const bar = topBar.getBoundingClientRect().bottom;
  const insets: ViewInsets = { top: bar, right: 0, bottom: 0, left: 0 };
  const covering: DOMRect[] = [];
  if (!nav.hidden) covering.push(nav.getBoundingClientRect());
  if (rightColumn && [...rightColumn.children].some((panel) => panel instanceof HTMLElement && !panel.hidden)) {
    covering.push(rightColumn.getBoundingClientRect());
  }
  for (const rect of covering) {
    if (rect.width >= width * SHEET_SHARE) {
      // A sheet takes the half of the view its middle is in.
      if (rect.top + rect.bottom > height) insets.bottom = Math.max(insets.bottom, height - rect.top);
      else insets.top = Math.max(insets.top, rect.bottom);
    } else if (rect.left + rect.right < width) insets.left = Math.max(insets.left, rect.right);
    else insets.right = Math.max(insets.right, width - rect.left);
  }
  // Aiming at a sliver between panels would be worse than ignoring them.
  if (width - insets.left - insets.right < width * MIN_FREE_SHARE) insets.left = insets.right = 0;
  if (height - insets.top - insets.bottom < height * MIN_FREE_SHARE) {
    insets.top = bar;
    insets.bottom = 0;
  }
  return insets;
}

const actions: HudActions = {
  send(message) {
    if (!socket.send(message)) store.set({ notice: copy.reconnecting });
  },
  select(target) {
    store.set({ selection: target });
    view?.select(target);
  },
  // Setting the selection opens or closes the detail panel; the subscriber
  // below has re-measured the free view by the time the camera is told to move.
  goTo(target) {
    store.set({ selection: target });
    view?.select(target);
    view?.focusOn(target);
  },
  lookAt(point) {
    store.set({ selection: null });
    view?.select(null);
    view?.focus(point);
  },
  fitWorld() {
    view?.fit();
  },
  zoom(factor) {
    view?.zoomBy(factor);
  },
};

const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const webglNote = requireElement("webgl-note", HTMLElement);

// The 3D view waits for the model kit; the HUD and live data work meanwhile.
loadModelKit(`${import.meta.env.BASE_URL}models/kit.glb`).then(
  (kit) => {
    try {
      view = createWorldView(canvas, {
        kit,
        overlay: requireElement("world-overlay", HTMLElement),
        onPick: (target) => actions.select(target),
        onHover: (target) => store.set({ hover: target }),
      });
    } catch {
      store.set({ webgl: false });
      canvas.hidden = true;
      webglNote.textContent = copy.noWebgl;
      return;
    }
    view.setReducedMotion(motion.matches);
    view.setInsets(measureInsets());
    const { server, selection } = store.get();
    if (server?.city) view.update(server.city);
    view.select(selection);
  },
  () => {
    canvas.hidden = true;
    webglNote.textContent = copy.modelsFailed;
  },
);
motion.addEventListener("change", () => view?.setReducedMotion(motion.matches));
window.addEventListener("resize", () => {
  view?.resize();
  view?.setInsets(measureInsets());
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && store.get().selection) actions.select(null);
});

mountTopBar(topBar, store);
mountNav(nav, store, actions);
mountDetail(requireElement("detail", HTMLElement), store, actions);
mountLegend(requireElement("legend", HTMLElement), store);
mountSettings(requireElement("settings", HTMLElement), store, actions);
mountMockLab(requireElement("mock-lab", HTMLElement), store, actions);
mountViewControls(requireElement("view-controls", HTMLElement), actions);
mountTooltip(requireElement("tooltip", HTMLElement), store);

// Registered after the panels, so it measures them as they are after each change.
store.subscribe((state, previous) => {
  if (state.panels !== previous.panels || state.selection !== previous.selection) view?.setInsets(measureInsets());
});

// The bar wraps onto more rows in a narrow window; panels and view controls start where it ends.
new ResizeObserver(() => {
  document.documentElement.style.setProperty("--bar-bottom", `${Math.ceil(topBar.getBoundingClientRect().bottom)}px`);
  view?.setInsets(measureInsets());
}).observe(topBar);

let noticeTimer = 0;
const socket = connectServer(socketUrl(window.location, SOCKET_PATH), {
  onState(server) {
    if (server.city) view?.update(server.city);
    const selection = reconcileSelection(store.get().selection, server);
    if (selection === null && store.get().selection !== null) view?.select(null);
    store.set({ server, selection });
  },
  onError(message) {
    store.set({ notice: message });
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => store.set({ notice: null }), NOTICE_MS);
  },
  onConnection(connection) {
    store.set({ connection, notice: null });
  },
});
