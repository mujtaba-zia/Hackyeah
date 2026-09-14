/**
 * Renderer neutral identifiers shared by the domain and the renderer.
 *
 * The simulation, the state model and the city event director must not depend
 * on three.js, so the ids and the plain point type live here. `src/three` builds
 * its world data on top of these, never the other way round.
 */

export type CityId = 'geo' | 'b3d';

export type BuildingId =
  | 'geo-build'
  | 'geo-test'
  | 'geo-security'
  | 'geo-package'
  | 'geo-port'
  | 'geo-review'
  | 'geo-merge'
  | 'b3d-build'
  | 'b3d-test';

/** A world point in metres. Y is up. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
