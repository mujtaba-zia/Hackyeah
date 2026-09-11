/** Isometric grid maths. One shared definition for the whole game. */

export const TILE_W = 64;
export const TILE_H = 32;

export interface TilePos {
  tx: number;
  ty: number;
}

/** Tile coordinate -> world pixel position of the tile's centre. */
export function tileToWorld({ tx, ty }: TilePos): { x: number; y: number } {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) };
}
