import type { HudActions } from "./actions";
import { controlsHelp, copy } from "./copy";
import { el } from "./dom";

const ZOOM_STEP = 1.3;

/** Zoom and fit buttons for people without a wheel, and a card that lists every way to move around. */
export function mountViewControls(root: HTMLElement, actions: HudActions): void {
  const help = el("dl", { class: "help-card", attrs: { id: "view-help" } });
  help.hidden = true;
  for (const [keys, action] of controlsHelp) help.append(el("dt", { text: keys }), el("dd", { text: action }));

  const button = (glyph: string, label: string, onClick: () => void) =>
    el("button", { text: glyph, title: label, attrs: { type: "button", "aria-label": label }, on: { click: onClick } });
  const helpToggle = button("?", copy.help, () => {
    help.hidden = !help.hidden;
    helpToggle.setAttribute("aria-expanded", String(!help.hidden));
  });
  helpToggle.setAttribute("aria-expanded", "false");
  helpToggle.setAttribute("aria-controls", "view-help");

  root.append(
    help,
    el(
      "div",
      { class: "view-buttons" },
      button("+", copy.zoomIn, () => actions.zoom(ZOOM_STEP)),
      button("−", copy.zoomOut, () => actions.zoom(1 / ZOOM_STEP)),
      button("⤢", copy.fit, () => actions.fitWorld()),
      helpToggle,
    ),
  );
}
