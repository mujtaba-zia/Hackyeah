import type * as THREE from 'three';
import type { Picker } from './Picker';
import type { ThreeRenderer } from './ThreeRenderer';

/**
 * What every world system is handed.
 *
 * Declared in its own module so the systems, the effects library and the event
 * controllers all share one definition instead of importing each other.
 */
export interface WorldContext {
  scene: THREE.Scene;
  renderer: ThreeRenderer;
  picker: Picker;
}
