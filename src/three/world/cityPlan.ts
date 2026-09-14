import type { BuildingId, CityId, Vec3 } from '../../domain/ids';

export type { BuildingId, CityId, Vec3 } from '../../domain/ids';

export interface CityDef {
  id: CityId;
  name: string;
  center: Vec3;
  radius: number;
  tone: number;
}

/** The role a landmark plays, which drives its silhouette and its tooltip. */
export type LandmarkKind = 'build' | 'test' | 'security' | 'package' | 'port' | 'review' | 'merge';

export interface LandmarkDef {
  id: BuildingId;
  city: CityId;
  name: string;
  kind: LandmarkKind;
  position: Vec3;
  footprint: { w: number; d: number; h: number };
  description: string;
}

export interface BlockDef {
  position: Vec3;
  w: number;
  d: number;
  h: number;
  tone: number;
}

export interface RoadDef {
  from: Vec3;
  to: Vec3;
  width: number;
}

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

const GEO_TONES: readonly number[] = [3, 2, 4, 0, 3, 2];
const B3D_TONES: readonly number[] = [1, 0, 5, 1, 5, 0];

function point(x: number, z: number, y = 0): Vec3 {
  return { x, y, z };
}

function road(from: Vec3, to: Vec3, width: number): RoadDef {
  return { from, to, width };
}

function rectangularRoads(minX: number, minZ: number, maxX: number, maxZ: number, width: number): RoadDef[] {
  return [
    road(point(minX, minZ), point(maxX, minZ), width),
    road(point(maxX, minZ), point(maxX, maxZ), width),
    road(point(maxX, maxZ), point(minX, maxZ), width),
    road(point(minX, maxZ), point(minX, minZ), width),
  ];
}

function gridRoads(xs: readonly number[], zs: readonly number[], minX: number, minZ: number, maxX: number, maxZ: number, width: number): RoadDef[] {
  const roads: RoadDef[] = [];

  for (const x of xs) roads.push(road(point(x, minZ), point(x, maxZ), width));
  for (const z of zs) roads.push(road(point(minX, z), point(maxX, z), width));

  return roads;
}

export const CITIES: readonly CityDef[] = [
  {
    id: 'geo',
    name: 'Geo',
    center: point(0, 0),
    radius: 60,
    tone: 0x789ab3,
  },
  {
    id: 'b3d',
    name: 'b3d',
    center: point(110, 0),
    radius: 28,
    tone: 0xd9ac65,
  },
];

export const WATER: { center: Vec3; w: number; d: number } = {
  center: point(70, 0),
  w: 24,
  d: 160,
};

export const LANDMARKS: readonly LandmarkDef[] = [
  {
    id: 'geo-build',
    city: 'geo',
    name: 'Build Factory',
    kind: 'build',
    position: point(-40, -24),
    footprint: { w: 10, d: 10, h: 14 },
    description: 'Build Factory turns Geo source changes into repeatable artifacts.',
  },
  {
    id: 'geo-test',
    city: 'geo',
    name: 'Test Lab',
    kind: 'test',
    position: point(-24, -24),
    footprint: { w: 10, d: 10, h: 19 },
    description: 'Test Lab runs the checks that keep Geo releases trustworthy.',
  },
  {
    id: 'geo-security',
    city: 'geo',
    name: 'Security Hub',
    kind: 'security',
    position: point(-8, -24),
    footprint: { w: 10, d: 10, h: 16 },
    description: 'Security Hub protects each Geo artifact before it travels onward.',
  },
  {
    id: 'geo-package',
    city: 'geo',
    name: 'Packaging Station',
    kind: 'package',
    position: point(8, -24),
    footprint: { w: 10, d: 10, h: 11 },
    description: 'Packaging Station prepares finished Geo artifacts for delivery.',
  },
  {
    id: 'geo-port',
    city: 'geo',
    name: 'Deployment Port',
    kind: 'port',
    position: point(40, 8),
    footprint: { w: 10, d: 10, h: 12 },
    description: 'Deployment Port sends approved Geo releases across the waterfront.',
  },
  {
    id: 'geo-review',
    city: 'geo',
    name: 'Review Hall',
    kind: 'review',
    position: point(8, 8),
    footprint: { w: 10, d: 10, h: 14 },
    description: 'Review Hall brings Geo collaborators together to discuss pull requests.',
  },
  {
    id: 'geo-merge',
    city: 'geo',
    name: 'Merge Gate',
    kind: 'merge',
    position: point(24, 8),
    footprint: { w: 10, d: 10, h: 11 },
    description: 'Merge Gate welcomes approved Geo changes into the main branch.',
  },
  {
    id: 'b3d-build',
    city: 'b3d',
    name: 'Build Factory',
    kind: 'build',
    position: point(92, -6),
    footprint: { w: 7, d: 7, h: 9 },
    description: 'Build Factory turns b3d source changes into compact artifacts.',
  },
  {
    id: 'b3d-test',
    city: 'b3d',
    name: 'Test Lab',
    kind: 'test',
    position: point(104, -6),
    footprint: { w: 7, d: 7, h: 11 },
    description: 'Test Lab checks b3d changes before they leave the small city.',
  },
];

const GEO_ROAD_XS: readonly number[] = [-48, -32, -16, 0, 16, 32, 48];
const GEO_ROAD_ZS: readonly number[] = [-48, -32, -16, 0, 16, 32, 48];
const B3D_ROAD_XS: readonly number[] = [86, 98, 110, 122, 134];
const B3D_ROAD_ZS: readonly number[] = [-24, -12, 0, 12, 24];

export const ROADS: readonly RoadDef[] = [
  ...gridRoads(GEO_ROAD_XS, GEO_ROAD_ZS, -52, -52, 52, 52, 4),
  ...rectangularRoads(-54, -54, 54, 54, 4.4),
  ...gridRoads(B3D_ROAD_XS, B3D_ROAD_ZS, 86, -24, 134, 24, 3),
  ...rectangularRoads(84, -26, 136, 26, 3.2),
  // This is the only road that spans the channel.
  road(point(48, 0), point(88, 0), 5),
];

export const VEHICLE_ROUTES: readonly (readonly Vec3[])[] = [
  [
    point(-54, -54),
    point(54, -54),
    point(54, 54),
    point(-54, 54),
    point(-54, -54),
  ],
  [
    point(-32, -32),
    point(32, -32),
    point(32, 32),
    point(-32, 32),
    point(-32, -32),
  ],
  [
    point(-48, -16),
    point(16, -16),
    point(16, 32),
    point(-48, 32),
    point(-48, -16),
  ],
  [
    point(84, -26),
    point(136, -26),
    point(136, 26),
    point(84, 26),
    point(84, -26),
  ],
  [
    point(98, -12),
    point(122, -12),
    point(122, 12),
    point(98, 12),
    point(98, -12),
  ],
  [
    point(-16, 0),
    point(52, 0),
    point(88, 0),
    point(110, 0),
    point(110, 24),
    point(86, 24),
    point(86, 0),
    point(52, 0),
    point(-16, 0),
  ],
];

export const PEDESTRIAN_ROUTES: readonly (readonly Vec3[])[] = [
  [
    point(0, 0),
    point(16, 0),
    point(16, 16),
    point(0, 16),
    point(0, 0),
  ],
  [
    point(-16, 0),
    point(32, 0),
    point(32, 16),
    point(-16, 16),
    point(-16, 0),
  ],
  [
    point(-16, -16),
    point(16, -16),
    point(16, 16),
    point(-16, 16),
    point(-16, -16),
  ],
  [
    point(-32, 0),
    point(0, 0),
    point(0, 32),
    point(-32, 32),
    point(-32, 0),
  ],
];

/** Roadside doors keep artifact traffic out of landmark footprints. */
const GEO_PIPELINE_DOORS = {
  build: point(-40, -16),
  test: point(-24, -16),
  security: point(-8, -16),
  package: point(8, -16),
  port: point(40, 0),
};

export const PIPELINE_LEGS: readonly (readonly Vec3[])[] = [
  [GEO_PIPELINE_DOORS.build, GEO_PIPELINE_DOORS.test],
  [GEO_PIPELINE_DOORS.test, GEO_PIPELINE_DOORS.security],
  [GEO_PIPELINE_DOORS.security, GEO_PIPELINE_DOORS.package],
  [
    GEO_PIPELINE_DOORS.package,
    point(32, -16),
    point(32, 0),
    GEO_PIPELINE_DOORS.port,
  ],
];

export const PR_SPAWN: Vec3 = point(-40, 32);

export const REVIEW_WAITING_SPOTS: readonly Vec3[] = [
  point(5, 15),
  point(8, 15),
  point(11, 15),
  point(15, 5),
  point(15, 8),
  point(15, 11),
  point(5, 1),
  point(8, 1),
  point(11, 1),
  point(1, 5),
  point(1, 8),
  point(1, 11),
];

const REVIEW_DOOR = point(8, 0);
const MERGE_DOOR = point(24, 0);

export const PR_ROUTE_TO_REVIEW: readonly Vec3[] = [
  PR_SPAWN,
  point(-16, 32),
  point(-16, 16),
  point(0, 16),
  point(0, 0),
  REVIEW_DOOR,
];

export const PR_ROUTE_TO_MERGE: readonly Vec3[] = [
  REVIEW_DOOR,
  point(16, 0),
  MERGE_DOOR,
];

export const PR_ROUTE_BACK: readonly Vec3[] = [
  REVIEW_DOOR,
  point(0, 0),
  point(0, 16),
  point(-16, 16),
  point(-16, 32),
  PR_SPAWN,
];

const PARK_CLEARINGS: readonly Rect[] = [
  { x: -24, z: 8, w: 12, d: 12 },
  { x: -24, z: 24, w: 12, d: 12 },
  { x: -8, z: 8, w: 12, d: 12 },
  { x: 8, z: 24, w: 12, d: 12 },
];

const ROUTE_WAYPOINTS: readonly Vec3[] = [
  ...VEHICLE_ROUTES.flat(),
  ...PEDESTRIAN_ROUTES.flat(),
  ...PIPELINE_LEGS.flat(),
  PR_SPAWN,
  ...REVIEW_WAITING_SPOTS,
  ...PR_ROUTE_TO_REVIEW,
  ...PR_ROUTE_TO_MERGE,
  ...PR_ROUTE_BACK,
];

function overlap(left: Rect, right: Rect, gap = 0): boolean {
  return (
    Math.abs(left.x - right.x) < (left.w + right.w) / 2 + gap &&
    Math.abs(left.z - right.z) < (left.d + right.d) / 2 + gap
  );
}

function roadRect(definition: RoadDef): Rect {
  const dx = definition.to.x - definition.from.x;
  const dz = definition.to.z - definition.from.z;

  if (Math.abs(dx) >= Math.abs(dz)) {
    return {
      x: (definition.from.x + definition.to.x) / 2,
      z: definition.from.z,
      w: Math.abs(dx) + definition.width,
      d: definition.width,
    };
  }

  return {
    x: definition.from.x,
    z: (definition.from.z + definition.to.z) / 2,
    w: definition.width,
    d: Math.abs(dz) + definition.width,
  };
}


function isBuildable(block: BlockDef): boolean {
  const bounds: Rect = { x: block.position.x, z: block.position.z, w: block.w, d: block.d };

  if (PARK_CLEARINGS.some((park) => overlap(bounds, park, 0.35))) return false;
  if (LANDMARKS.some((building) => overlap(bounds, { x: building.position.x, z: building.position.z, w: building.footprint.w, d: building.footprint.d }, 0.5))) return false;
  if (ROADS.some((street) => overlap(bounds, roadRect(street), 0.35))) return false;

  return !ROUTE_WAYPOINTS.some((waypoint) => (
    Math.abs(waypoint.x - block.position.x) <= block.w / 2 + 0.75 &&
    Math.abs(waypoint.z - block.position.z) <= block.d / 2 + 0.75
  ));
}

function geoBlockHeight(x: number, z: number, variation: number): number {
  const distance = Math.hypot(x, z);
  const base = distance < 18 ? 22 : distance < 36 ? 11 : 5;
  return base + variation * 2.4;
}

function addGeoBlocks(blocks: BlockDef[]): void {
  const parcelCenters: readonly number[] = [-40, -24, -8, 8, 24, 40];
  const offsets: readonly number[] = [-3.7, 0, 3.7];

  for (let xIndex = 0; xIndex < parcelCenters.length; xIndex += 1) {
    for (let zIndex = 0; zIndex < parcelCenters.length; zIndex += 1) {
      for (let column = 0; column < offsets.length; column += 1) {
        for (let row = 0; row < offsets.length; row += 1) {
          const seed = xIndex * 23 + zIndex * 17 + column * 5 + row * 3;
          const widthVariation = seed % 4;
          const depthVariation = (seed + 1) % 4;
          const heightVariation = (seed + 2) % 5;
          const tone = GEO_TONES[seed % GEO_TONES.length];
          const block: BlockDef = {
            position: point(parcelCenters[xIndex] + offsets[column], parcelCenters[zIndex] + offsets[row]),
            w: 2.45 + widthVariation * 0.18,
            d: 2.45 + depthVariation * 0.18,
            h: geoBlockHeight(parcelCenters[xIndex], parcelCenters[zIndex], heightVariation),
            tone,
          };

          if (isBuildable(block)) blocks.push(block);
        }
      }
    }
  }
}

function addB3dBlocks(blocks: BlockDef[]): void {
  const parcelXs: readonly number[] = [92, 104, 116, 128];
  const parcelZs: readonly number[] = [-18, -6, 6, 18];
  const offsets: readonly number[] = [-2.4, 0, 2.4];

  for (let xIndex = 0; xIndex < parcelXs.length; xIndex += 1) {
    for (let zIndex = 0; zIndex < parcelZs.length; zIndex += 1) {
      for (let column = 0; column < offsets.length; column += 1) {
        for (let row = 0; row < offsets.length; row += 1) {
          const seed = xIndex * 19 + zIndex * 13 + column * 5 + row * 3;
          const widthVariation = seed % 4;
          const depthVariation = (seed + 2) % 4;
          const heightVariation = (seed + 1) % 4;
          const tone = B3D_TONES[seed % B3D_TONES.length];
          const block: BlockDef = {
            position: point(parcelXs[xIndex] + offsets[column], parcelZs[zIndex] + offsets[row]),
            w: 1.55 + widthVariation * 0.13,
            d: 1.55 + depthVariation * 0.13,
            h: 3.5 + heightVariation * 1.15,
            tone,
          };

          if (isBuildable(block)) blocks.push(block);
        }
      }
    }
  }
}

function createBlocks(): readonly BlockDef[] {
  const blocks: BlockDef[] = [];
  addGeoBlocks(blocks);
  addB3dBlocks(blocks);
  return blocks;
}

/** Ordinary blocks stay out of streets, landmark plots and public clearings. */
export const BLOCKS: readonly BlockDef[] = createBlocks();

export function cityOf(id: BuildingId): CityId {
  return landmark(id).city;
}

export function landmark(id: BuildingId): LandmarkDef {
  const definition = LANDMARKS.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown landmark: ${id}`);
  return definition;
}
