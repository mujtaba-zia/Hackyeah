import type { CityModel, Vec2 } from "../../shared/types";
import type { ModelKit } from "./kit";

export interface PickTarget {
  kind: "district" | "creature" | "tower";
  id: string;
}

/** Screen space, in CSS pixels, that HUD panels cover on each side of the canvas. */
export interface ViewInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface WorldView {
  update(city: CityModel): void;
  select(target: PickTarget | null): void;
  /** Flies to an entity: a district fills the free view with its island, a tower or a pull request zooms in closer. */
  focusOn(target: PickTarget): void;
  /** Flies to a point on the ground, zooming in to about one island. */
  focus(point: Vec2): void;
  /** Shows the whole world in the part of the view the HUD leaves free. */
  fit(): void;
  /** Zooms about the middle of the free view; a factor above 1 zooms in. */
  zoomBy(factor: number): void;
  /** Tells the view which part of the canvas panels cover, so `fit` and `focusOn` centre in the rest. */
  setInsets(insets: ViewInsets): void;
  setReducedMotion(on: boolean): void;
  resize(): void;
  dispose(): void;
}

export interface WorldViewOptions {
  /** The loaded Blender model kit (see `loadModelKit`). */
  kit: ModelKit;
  /** An element stretched over the canvas; nameplates and labels are drawn into it. */
  overlay: HTMLElement;
  onPick(target: PickTarget | null): void;
  /** Called when the pointer moves onto something else in the world, or off everything. */
  onHover?(target: PickTarget | null): void;
}
