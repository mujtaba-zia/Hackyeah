import type { CityModel, Vec2 } from "../../shared/types";

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
  onPick(target: PickTarget | null): void;
  onHover?(target: PickTarget | null): void;
}
