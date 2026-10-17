import type { PickTarget, WorldView } from "./contracts";
import { WorldRenderer } from "./world";

export type { PickTarget, WorldView } from "./contracts";

function webglAvailable(canvas: HTMLCanvasElement): boolean {
  try {
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

/** Creates the independently updateable Three.js surface used by the HUD. */
export function createWorldView(
  canvas: HTMLCanvasElement,
  options: { onPick(target: PickTarget | null): void; onHover?(target: PickTarget | null): void },
): WorldView {
  if (!webglAvailable(canvas)) {
    canvas.hidden = true;
    throw new Error("webgl-unavailable");
  }
  try {
    return new WorldRenderer(canvas, options);
  } catch {
    canvas.hidden = true;
    throw new Error("webgl-unavailable");
  }
}
