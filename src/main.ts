import "./styles.css";
import { SOCKET_PATH } from "../shared/protocol";
import { connectServer, socketUrl } from "./app/socket";
import { createStore, reconcileSelection } from "./app/store";
import { createWorldView, loadModelKit, type WorldView } from "./render/index";
import type { HudActions } from "./ui/actions";
import { copy } from "./ui/copy";
import { mountDetail } from "./ui/detail";
import { mountLegend } from "./ui/legend";
import { mountMockLab } from "./ui/mockLab";
import { mountProblems } from "./ui/problems";
import { mountSettings } from "./ui/settings";
import { mountTopBar } from "./ui/topBar";

const NOTICE_MS = 4000;

function requireElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing #${id}`);
  return node;
}

const canvas = requireElement("world", HTMLCanvasElement);
const store = createStore({
  server: null,
  connection: "connecting",
  selection: null,
  panels: { problems: true, legend: false, settings: false, mockLab: false },
  severity: "all",
  notice: null,
  webgl: true,
});

let view: WorldView | null = null;
const actions: HudActions = {
  send(message) {
    if (!socket.send(message)) store.set({ notice: copy.reconnecting });
  },
  select(target, focus) {
    store.set({ selection: target });
    view?.select(target);
    if (focus) view?.focus(focus);
  },
};

const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const webglNote = requireElement("webgl-note", HTMLElement);

// The 3D view waits for the model kit; the HUD and live data work meanwhile.
loadModelKit(`${import.meta.env.BASE_URL}models/kit.glb`).then(
  (kit) => {
    try {
      view = createWorldView(canvas, { kit, onPick: (target) => actions.select(target) });
    } catch {
      store.set({ webgl: false });
      canvas.hidden = true;
      webglNote.textContent = copy.noWebgl;
      return;
    }
    view.setReducedMotion(motion.matches);
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
window.addEventListener("resize", () => view?.resize());

mountTopBar(requireElement("top-bar", HTMLElement), store);
mountProblems(requireElement("problems", HTMLElement), store, actions);
mountDetail(requireElement("detail", HTMLElement), store, actions);
mountLegend(requireElement("legend", HTMLElement), store);
mountSettings(requireElement("settings", HTMLElement), store, actions);
mountMockLab(requireElement("mock-lab", HTMLElement), store, actions);

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
