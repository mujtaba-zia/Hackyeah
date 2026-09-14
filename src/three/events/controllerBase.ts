import * as THREE from 'three';
import type { BuildingId, Vec3 } from '../../domain/ids';
import { TrackedController, type EventStageContext } from './types';
import { EventVisuals } from './visuals';

/** Gives each controller one disposable root for its procedural props. */
export abstract class VisualEventController extends TrackedController {
  protected begin(ctx: EventStageContext): EventVisuals {
    this.ctx = ctx;
    const visuals = new EventVisuals();
    ctx.scene.add(visuals.root);
    this.track(visuals.root, () => visuals.dispose());
    return visuals;
  }

  /** Landmarks can be nested, so use their world transform when available. */
  protected landmarkPoint(id: BuildingId, fallback: Vec3): Vec3 {
    const landmark = this.ctx.landmarks.get(id);
    if (!landmark) return fallback;
    const position = new THREE.Vector3();
    landmark.getWorldPosition(position);
    return { x: position.x, y: position.y, z: position.z };
  }
}
