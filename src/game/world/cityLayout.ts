import type { TilePos } from './iso';

/**
 * Hand-authored city. No procedural generation by design (Milestone 1).
 *
 *   G grass   R road   P plaza (stone)   W water
 */
export const TERRAIN: readonly string[] = [
  'GGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGG',
  'GGGRRRRRRRRGGG',
  'GGGRGGGRGGRGGG',
  'GGGRGGGRGGRGGG',
  'GGGRRRRPRRRRGG',
  'GGGRGGGPGGGRGG',
  'GGGRGGPPPGGRGG',
  'GGGRRRRPRRRRGG',
  'GGGRGGGRGGGRGG',
  'GGGRGGGRGGGRGG',
  'GGGRRRRRRRRRGG',
  'GGGGGGGGGWWWWW',
  'GGGGGGGGGWWWWW',
];

export const TERRAIN_W = TERRAIN[0].length;
export const TERRAIN_H = TERRAIN.length;

export type BuildingId = 'build-factory' | 'test-lab' | 'review-hall' | 'deployment-port';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  tile: TilePos;
  texture: string;
  /** Placeholder copy shown for everything except the Build Factory. */
  description: string;
}

/** The four interactive landmarks. */
export const KEY_BUILDINGS: readonly BuildingDef[] = [
  {
    id: 'build-factory',
    name: 'Build Factory',
    tile: { tx: 4.5, ty: 3.5 },
    texture: 'b-factory',
    description: 'Compiles and packages the Backend Pipeline.',
  },
  {
    id: 'test-lab',
    name: 'Test Lab',
    tile: { tx: 9, ty: 3.5 },
    texture: 'b-testlab',
    description: 'Testing visualization will be added in a future milestone.',
  },
  {
    id: 'review-hall',
    name: 'Review Hall',
    tile: { tx: 4.5, ty: 9.5 },
    texture: 'b-reviewhall',
    description: 'Pull request review characters arrive in a future milestone.',
  },
  {
    id: 'deployment-port',
    name: 'Deployment Port',
    tile: { tx: 11.5, ty: 11.5 },
    texture: 'b-port',
    description: 'Deployment ships will set sail in a future milestone.',
  },
];

/** Decorative props: houses and trees. Purely visual. */
export const PROPS: readonly { tile: TilePos; texture: string }[] = [
  { tile: { tx: 1.5, ty: 3.5 }, texture: 'p-house-a' },
  { tile: { tx: 1.5, ty: 6.5 }, texture: 'p-house-b' },
  { tile: { tx: 1.5, ty: 9.5 }, texture: 'p-house-a' },
  { tile: { tx: 8.5, ty: 6.5 }, texture: 'p-house-b' },
  { tile: { tx: 12.5, ty: 3.5 }, texture: 'p-house-a' },
  { tile: { tx: 12.5, ty: 7.5 }, texture: 'p-house-b' },
  { tile: { tx: 4.5, ty: 6.5 }, texture: 'p-house-b' },
  { tile: { tx: 0, ty: 0 }, texture: 'p-tree' },
  { tile: { tx: 1, ty: 1 }, texture: 'p-tree' },
  { tile: { tx: 2, ty: 0 }, texture: 'p-tree' },
  { tile: { tx: 0, ty: 5 }, texture: 'p-tree' },
  { tile: { tx: 0, ty: 8 }, texture: 'p-tree' },
  { tile: { tx: 6, ty: 3 }, texture: 'p-tree' },
  { tile: { tx: 6, ty: 4.6 }, texture: 'p-tree' },
  { tile: { tx: 9.6, ty: 6 }, texture: 'p-tree' },
  { tile: { tx: 2, ty: 12.5 }, texture: 'p-tree' },
  { tile: { tx: 5, ty: 12.5 }, texture: 'p-tree' },
  { tile: { tx: 13, ty: 0.5 }, texture: 'p-tree' },
];

/** Centre plaza (fountain). */
export const CITY_CENTER: TilePos = { tx: 7, ty: 7 };

/** Closed loop the ambient car drives along, in tile coordinates. */
export const CAR_ROUTE: readonly TilePos[] = [
  { tx: 3, ty: 2 },
  { tx: 11, ty: 2 },
  { tx: 11, ty: 11 },
  { tx: 3, ty: 11 },
];
