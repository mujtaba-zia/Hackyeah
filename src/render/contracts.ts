import type { CityModel, Vec2 } from "../../shared/types";
import type { ModelKit } from "./kit";

export interface PickTarget {
  kind: "district" | "creature" | "tower";
  id: string;
}

export interface WorldView {
  update(city: CityModel): void;
  select(target: PickTarget | null): void;
  focus(point: Vec2): void;
  setReducedMotion(on: boolean): void;
  resize(): void;
  dispose(): void;
}

export interface WorldViewOptions {
  /** The loaded Blender model kit (see `loadModelKit`). */
  kit: ModelKit;
  onPick(target: PickTarget | null): void;
  onHover?(target: PickTarget | null): void;
}
