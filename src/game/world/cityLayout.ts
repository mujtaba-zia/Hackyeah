import type { TilePos } from './iso';

export type DistrictId = 'industrial' | 'tech' | 'center' | 'residential' | 'logistics';
export type BuildingId =
  | 'build-factory'
  | 'test-lab'
  | 'security-hub'
  | 'packaging-station'
  | 'deployment-port';

/**
 * Hand-authored 44 by 44 city grid. The ring road detours around the south-east
 * waterfront while cross-town boulevards connect each district to the centre.
 */
export const TERRAIN: readonly string[] = [
  'GGGRGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGRGGG',
  'GGGRGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGRGGG',
  'GGGRGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGRGGG',
  'GGGRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRGGG',
  'GGGRGGGGGGRGGGGGGSRSGRGGGGGRSSSRGGGGGGGGRGGG',
  'GGGRGGGGGGRGGGGGGSRSGRGGGGGRSGSRGGGGGGGGRGGG',
  'GGGRGGAAAARGGGGGGSRSGRGAAAARSGSRGGGGGGGGRGGG',
  'GGGRGGAAAARGGGGGGSRSGRGAAAARSGSRGGGGGGGGRGGG',
  'GGGRGGAAAARGGGGGGSRSGRGAAAARSGSRGGGGGGGGRGGG',
  'GGGRGGAAAARGGGGGGSRSGRGAAAARSSSRGGGGGGGGRGGG',
  'GGGRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRGGG',
  'GGGRGGGGGGRGAAAAASRSGRGGGGGRGGGRGGGGGGGGRGGG',
  'GGGRGGGGGGRGAAAAASRSGRGGGGGRAAARGGGGGGGGRGGG',
  'GGGRGGGGGGRGAAAAASRSGRGGGGGRAAARGGGGGGGGRGGG',
  'GGGRGGGGGGRGAAAAASRSGRGGGGGRAAARGGGGGGGGRGGG',
  'GGGRGGGGGGRGAAAAASRSGRGGGGGRAAARGGGGGGGGRGGG',
  'GGGRGGGGGGRGGGGGGSRSGRGGGGGRAAARGGGGGGGGRGGG',
  'GGGRSSSSSSRSSSSSSSRSSRSSSSSRSSSRSSSSSSSSRGGG',
  'GGGRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRGGG',
  'GGGRSSSSSSRSSSSSSSRSSSSSSRSRSSSSSSSSSSSSRGGG',
  'GGGRGGGGGGRSGGGGGSRSPPPPPRGRGGGGGGGGGGGGRGGG',
  'GGGRGGGGGGRSGGGGGSRSPPPPPRGRGGGGGGGGGGGGRGGG',
  'GGGRGGGGGGRSGGGGGSRSPPPPPRGRGGGGGGGGGGGGRGGG',
  'GGGRGGGGGGRSGGGGGSRSPPPPPRGRGGGGGGGGGGGGRGGG',
  'GGGRGGGGGGRSGGGGGSRSPPPPPRGRGGGGGGGGGGGGRGGG',
  'GGGRGGGGGGRSGGGGGSRSSSSSSRGRGGGGGGGGGGGGRGGG',
  'GGGRGGGGGGRSSSSSSSRSGGGGGRGRGGGGGGGGGGGGRGGG',
  'GGGRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRGGG',
  'GGGRSSSSSSRGGGGGGSRSGGGGGRGRGGGGGRGGGGGGRGGG',
  'GGGRSGGGGSRGGGGGGSRSGGGGGRGRGGGGGRGGGGGGRGGG',
  'GGGRSGGGGSRGGGGGGSRSGGGGGRGRGGGGGRGGGGGGRGGG',
  'GGGRSGGGGSRGGGGGGSRSGGGGGRGRGGGGGRGGGGGGRGGG',
  'GGGRSGGGGSRGGGGGGSRSGGGGGRGRGGGGGRGGGGGGRGGG',
  'GGGRSGGGGSRGGGGGGSRSGGGGGRGRGGGGGRRRRRRRRRRR',
  'GGGRSGGGGSRGGGGGGSRSGGGGGGGGGAAAARKKKKKKKGGG',
  'GGGRSGGGGSRGGGGGGSRSGGGGGGGGGAAAARKKWWWWWWWW',
  'GGGRSGGGGSRGGGGGGSRSGGGGGGGGGAAAARKKWWWWWWWW',
  'GGGRSGGGGSRGGGGGGSRSGGGGGGGGGAAAARKKWWWWWWWW',
  'GGGRSGGGGSRGGGGGGSRSGGGGGGGGGAAAARKKWWWWWWWW',
  'GGGRSSSSSSRGGGGGGSRSGGGGGGGGGGGGGRKKWWWWWWWW',
  'GGGRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRKKWWWWWWWW',
  'GGGRGGGGGGGGGGGGGGGGGGGGGGGGGGGGGRGGWWWWWWWW',
  'GGGRGGGGGGGGGGGGGGGGGGGGGGGGGGGGGRGGWWWWWWWW',
  'GGGRGGGGGGGGGGGGGGGGGGGGGGGGGGGGGRGGWWWWWWWW',
];

export const TERRAIN_W: number = TERRAIN[0].length;
export const TERRAIN_H: number = TERRAIN.length;

export interface DistrictDef {
  id: DistrictId;
  name: string;
  tile: TilePos;
}

/** Label anchors keep district names close to their visual centre. */
export const DISTRICTS: readonly DistrictDef[] = [
  { id: 'industrial', name: 'Industrial District', tile: { tx: 10, ty: 6 } },
  { id: 'tech', name: 'Tech Quarter', tile: { tx: 31, ty: 7 } },
  { id: 'center', name: 'City Centre', tile: { tx: 22, ty: 22 } },
  { id: 'residential', name: 'Residential Gardens', tile: { tx: 9, ty: 33 } },
  { id: 'logistics', name: 'Logistics Port', tile: { tx: 28, ty: 33 } },
];

export interface BuildingDef {
  id: BuildingId;
  name: string;
  tile: TilePos;
  texture: string;
  district: DistrictId;
  description: string;
}

/** Pipeline landmarks stay in delivery order so the journey reads left to right. */
export const KEY_BUILDINGS: readonly BuildingDef[] = [
  {
    id: 'build-factory',
    name: 'Build Factory',
    tile: { tx: 8, ty: 9 },
    texture: 'b-factory',
    district: 'industrial',
    description: 'Compiles source into a build artifact for the journey.',
  },
  {
    id: 'test-lab',
    name: 'Test Lab',
    tile: { tx: 26, ty: 9 },
    texture: 'b-testlab',
    district: 'tech',
    description: 'Runs automated checks on the arriving build artifact.',
  },
  {
    id: 'security-hub',
    name: 'Security Hub',
    tile: { tx: 30, ty: 14 },
    texture: 'b-security',
    district: 'tech',
    description: 'Scans the verified artifact for security issues.',
  },
  {
    id: 'packaging-station',
    name: 'Packaging Station',
    tile: { tx: 14, ty: 11 },
    texture: 'b-packaging',
    district: 'industrial',
    description: 'Bundles the approved artifact for deployment.',
  },
  {
    id: 'deployment-port',
    name: 'Deployment Port',
    tile: { tx: 32, ty: 34 },
    texture: 'b-port',
    district: 'logistics',
    description: 'Releases the packaged artifact from the waterfront.',
  },
];

export interface PropDef {
  tile: TilePos;
  texture: string;
  scale?: number;
  flipX?: boolean;
}

/** Structures establish district character; small props fill the public spaces. */
export const PROPS: readonly PropDef[] = [
  // Industrial district structures
  { tile: { tx: 5, ty: 5 }, texture: 'p-warehouse', scale: 1.05 },
  { tile: { tx: 11, ty: 5 }, texture: 'p-factory', scale: 0.9, flipX: true },
  { tile: { tx: 5, ty: 13 }, texture: 'p-warehouse', scale: 0.92, flipX: true },
  { tile: { tx: 11, ty: 16 }, texture: 'p-factory', scale: 0.88 },
  { tile: { tx: 16, ty: 6 }, texture: 'p-server', scale: 0.82 },
  { tile: { tx: 16, ty: 16 }, texture: 'p-office-a', scale: 0.86, flipX: true },
  { tile: { tx: 12, ty: 5 }, texture: 'p-shop', scale: 0.78 },

  // Tech quarter structures
  { tile: { tx: 29, ty: 6 }, texture: 'p-techoffice', scale: 0.9 },
  { tile: { tx: 25, ty: 12 }, texture: 'p-server', scale: 0.86, flipX: true },
  { tile: { tx: 34, ty: 6 }, texture: 'p-office-a', scale: 1.02 },
  { tile: { tx: 35, ty: 12 }, texture: 'p-office-b', scale: 0.96, flipX: true },
  { tile: { tx: 34, ty: 15 }, texture: 'p-techoffice', scale: 0.84 },
  { tile: { tx: 24, ty: 15 }, texture: 'p-server', scale: 0.8 },
  { tile: { tx: 37, ty: 14 }, texture: 'p-cafe', scale: 0.76, flipX: true },

  // City centre structures
  { tile: { tx: 14, ty: 21 }, texture: 'p-office-a', scale: 0.94 },
  { tile: { tx: 15, ty: 24 }, texture: 'p-office-b', scale: 0.9, flipX: true },
  { tile: { tx: 26, ty: 21 }, texture: 'p-shop', scale: 0.84 },
  { tile: { tx: 26, ty: 24 }, texture: 'p-cafe', scale: 0.8, flipX: true },

  // Residential gardens structures
  { tile: { tx: 5, ty: 30 }, texture: 'p-house-a', scale: 0.84 },
  { tile: { tx: 7, ty: 35 }, texture: 'p-house-b', scale: 0.9, flipX: true },
  { tile: { tx: 12, ty: 30 }, texture: 'p-apartment-a', scale: 0.92 },
  { tile: { tx: 14, ty: 34 }, texture: 'p-apartment-b', scale: 0.96, flipX: true },
  { tile: { tx: 5, ty: 36 }, texture: 'p-house-a', scale: 0.8, flipX: true },
  { tile: { tx: 8, ty: 32 }, texture: 'p-house-b', scale: 0.86 },
  { tile: { tx: 13, ty: 37 }, texture: 'p-apartment-a', scale: 0.88, flipX: true },
  { tile: { tx: 15, ty: 31 }, texture: 'p-shop', scale: 0.78 },
  { tile: { tx: 14, ty: 36 }, texture: 'p-cafe', scale: 0.74 },

  // Logistics port structures
  { tile: { tx: 21, ty: 29 }, texture: 'p-warehouse', scale: 1.02, flipX: true },
  { tile: { tx: 24, ty: 30 }, texture: 'p-factory', scale: 0.9 },
  { tile: { tx: 29, ty: 30 }, texture: 'p-warehouse', scale: 0.96 },
  { tile: { tx: 22, ty: 35 }, texture: 'p-server', scale: 0.82, flipX: true },
  { tile: { tx: 26, ty: 36 }, texture: 'p-office-a', scale: 0.86 },
  { tile: { tx: 28, ty: 32 }, texture: 'p-warehouse', scale: 0.88, flipX: true },

  // Industrial yard details
  { tile: { tx: 6, ty: 7 }, texture: 'p-container', scale: 0.9 },
  { tile: { tx: 7, ty: 6 }, texture: 'p-container', scale: 0.82, flipX: true },
  { tile: { tx: 5, ty: 15 }, texture: 'p-crane', scale: 0.88 },
  { tile: { tx: 4, ty: 6 }, texture: 'p-tree', scale: 0.86 },
  { tile: { tx: 4, ty: 14 }, texture: 'p-tree', scale: 0.92, flipX: true },
  { tile: { tx: 11, ty: 17 }, texture: 'p-lamp', scale: 0.9 },
  { tile: { tx: 16, ty: 17 }, texture: 'p-lamp', scale: 0.9, flipX: true },

  // Tech campus details
  { tile: { tx: 22, ty: 5 }, texture: 'p-tree', scale: 0.84 },
  { tile: { tx: 36, ty: 5 }, texture: 'p-tree', scale: 0.9, flipX: true },
  { tile: { tx: 28, ty: 4 }, texture: 'p-bench', scale: 0.88 },
  { tile: { tx: 30, ty: 9 }, texture: 'p-bench', scale: 0.88, flipX: true },
  { tile: { tx: 28, ty: 7 }, texture: 'p-lamp', scale: 0.86 },
  { tile: { tx: 30, ty: 7 }, texture: 'p-lamp', scale: 0.86, flipX: true },
  { tile: { tx: 38, ty: 16 }, texture: 'p-tree', scale: 0.84 },

  // Centre pocket park details
  { tile: { tx: 12, ty: 22 }, texture: 'p-tree', scale: 0.92 },
  { tile: { tx: 13, ty: 25 }, texture: 'p-tree', scale: 0.84, flipX: true },
  { tile: { tx: 12, ty: 23 }, texture: 'p-bench', scale: 0.9 },
  { tile: { tx: 16, ty: 23 }, texture: 'p-bench', scale: 0.9, flipX: true },
  { tile: { tx: 14, ty: 23 }, texture: 'p-fountain', scale: 0.8 },
  { tile: { tx: 19, ty: 20 }, texture: 'p-lamp', scale: 0.9 },
  { tile: { tx: 26, ty: 25 }, texture: 'p-lamp', scale: 0.9, flipX: true },

  // Residential garden details
  { tile: { tx: 6, ty: 31 }, texture: 'p-tree', scale: 0.9 },
  { tile: { tx: 6, ty: 33 }, texture: 'p-tree', scale: 0.84, flipX: true },
  { tile: { tx: 16, ty: 33 }, texture: 'p-tree', scale: 0.88 },
  { tile: { tx: 4, ty: 31 }, texture: 'p-bench', scale: 0.86 },
  { tile: { tx: 9, ty: 37 }, texture: 'p-bench', scale: 0.86, flipX: true },
  { tile: { tx: 4, ty: 35 }, texture: 'p-lamp', scale: 0.88 },
  { tile: { tx: 9, ty: 29 }, texture: 'p-lamp', scale: 0.88, flipX: true },

  // Waterfront service details
  { tile: { tx: 29, ty: 37 }, texture: 'p-container', scale: 0.92 },
  { tile: { tx: 30, ty: 38 }, texture: 'p-container', scale: 0.82, flipX: true },
  { tile: { tx: 31, ty: 37 }, texture: 'p-container', scale: 0.88 },
  { tile: { tx: 32, ty: 32 }, texture: 'p-crane', scale: 0.94, flipX: true },
  { tile: { tx: 28, ty: 33 }, texture: 'p-lamp', scale: 0.88 },
  { tile: { tx: 23, ty: 33 }, texture: 'p-tree', scale: 0.82 },
];

/** Centre plaza tile used by the city-centre landmark and camera framing. */
export const CITY_CENTER: TilePos = { tx: 22, ty: 22 };

/** A truck stops on the adjacent road tile rather than overlapping a landmark. */
export const BUILDING_DOOR: Record<BuildingId, TilePos> = {
  'build-factory': { tx: 8, ty: 10 },
  'test-lab': { tx: 27, ty: 9 },
  'security-hub': { tx: 31, ty: 14 },
  'packaging-station': { tx: 14, ty: 10 },
  'deployment-port': { tx: 33, ty: 34 },
};

/** Each closed route changes heading at a road junction. */
export const VEHICLE_ROUTES: readonly (readonly TilePos[])[] = [
  [
    { tx: 3, ty: 3 },
    { tx: 40, ty: 3 },
    { tx: 40, ty: 33 },
    { tx: 33, ty: 33 },
    { tx: 33, ty: 40 },
    { tx: 3, ty: 40 },
    { tx: 3, ty: 3 },
  ],
  [
    { tx: 3, ty: 3 },
    { tx: 18, ty: 3 },
    { tx: 18, ty: 10 },
    { tx: 27, ty: 10 },
    { tx: 27, ty: 3 },
    { tx: 3, ty: 3 },
  ],
  [
    { tx: 18, ty: 18 },
    { tx: 27, ty: 18 },
    { tx: 27, ty: 27 },
    { tx: 18, ty: 27 },
    { tx: 18, ty: 18 },
  ],
  [
    { tx: 3, ty: 18 },
    { tx: 10, ty: 18 },
    { tx: 10, ty: 27 },
    { tx: 3, ty: 27 },
    { tx: 3, ty: 18 },
  ],
  [
    { tx: 27, ty: 3 },
    { tx: 40, ty: 3 },
    { tx: 40, ty: 18 },
    { tx: 27, ty: 18 },
    { tx: 27, ty: 3 },
  ],
  [
    { tx: 18, ty: 27 },
    { tx: 33, ty: 27 },
    { tx: 33, ty: 40 },
    { tx: 18, ty: 40 },
    { tx: 18, ty: 27 },
  ],
];

/** Foot traffic circles the plaza, tech campus, pocket park and residential green. */
export const PEDESTRIAN_ROUTES: readonly (readonly TilePos[])[] = [
  [
    { tx: 20, ty: 19 },
    { tx: 24, ty: 19 },
    { tx: 24, ty: 24 },
    { tx: 24, ty: 25 },
    { tx: 20, ty: 25 },
    { tx: 20, ty: 20 },
    { tx: 20, ty: 19 },
  ],
  [
    { tx: 28, ty: 4 },
    { tx: 30, ty: 4 },
    { tx: 30, ty: 9 },
    { tx: 28, ty: 9 },
    { tx: 28, ty: 4 },
  ],
  [
    { tx: 11, ty: 19 },
    { tx: 17, ty: 19 },
    { tx: 17, ty: 26 },
    { tx: 11, ty: 26 },
    { tx: 11, ty: 19 },
  ],
  [
    { tx: 4, ty: 28 },
    { tx: 9, ty: 28 },
    { tx: 9, ty: 39 },
    { tx: 4, ty: 39 },
    { tx: 4, ty: 28 },
  ],
];

/** Build to test, test to security, security to package, then package to deploy. */
export const PIPELINE_LEGS: readonly (readonly TilePos[])[] = [
  [
    BUILDING_DOOR['build-factory'],
    { tx: 18, ty: 10 },
    { tx: 27, ty: 10 },
    BUILDING_DOOR['test-lab'],
  ],
  [
    BUILDING_DOOR['test-lab'],
    { tx: 27, ty: 10 },
    { tx: 31, ty: 10 },
    BUILDING_DOOR['security-hub'],
  ],
  [
    BUILDING_DOOR['security-hub'],
    { tx: 31, ty: 10 },
    { tx: 18, ty: 10 },
    BUILDING_DOOR['packaging-station'],
  ],
  [
    BUILDING_DOOR['packaging-station'],
    { tx: 18, ty: 10 },
    { tx: 18, ty: 27 },
    { tx: 33, ty: 27 },
    BUILDING_DOOR['deployment-port'],
  ],
];

/** North-west ring-road depot to the Build Factory door. */
export const EMERGENCY_ROUTE: readonly TilePos[] = [
  { tx: 3, ty: 3 },
  { tx: 3, ty: 10 },
  BUILDING_DOOR['build-factory'],
];
