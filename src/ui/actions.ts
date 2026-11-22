import type { ClientMessage } from "../../shared/protocol";
import type { Vec2 } from "../../shared/types";
import type { PickTarget } from "../render/index";

/** What panels may ask the app to do. Wired in main.ts. */
export interface HudActions {
  send(message: ClientMessage): void;
  /** Selects an entity, or clears the selection, without moving the camera. */
  select(target: PickTarget | null): void;
  /** Selects an entity and flies the camera to it. */
  goTo(target: PickTarget): void;
  /** Flies the camera to a point on the ground and clears the selection. */
  lookAt(point: Vec2): void;
  /** Shows the whole world. */
  fitWorld(): void;
  /** Zooms in (a factor above 1) or out. */
  zoom(factor: number): void;
}
