import type { ClientMessage } from "../../shared/protocol";
import type { Vec2 } from "../../shared/types";
import type { PickTarget } from "../render/index";

/** What panels may ask the app to do. Wired in main.ts. */
export interface HudActions {
  send(message: ClientMessage): void;
  /** Select an entity and, when given, fly the camera to `focus`. */
  select(target: PickTarget | null, focus?: Vec2): void;
}
