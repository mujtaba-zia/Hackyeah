import * as THREE from 'three';
import { Effects3D } from '../fx/Effects3D';
import { CityEventStage } from './CityEventStage';
import { gameStore } from '../../game/state/gameStore';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 300);
camera.position.set(0, 35, 55);
scene.add(camera);
camera.updateMatrixWorld(true);
const callbacks = new Set<(dtSeconds: number, elapsed: number) => void>();
const renderer = {
  camera,
  onFrame(callback: (dtSeconds: number, elapsed: number) => void): () => void {
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  },
};
const landmarks = new Map();
for (const id of ['geo-build', 'geo-test', 'geo-security', 'geo-package', 'geo-port', 'geo-review', 'geo-merge', 'b3d-build', 'b3d-test']) {
  const landmark = new THREE.Group();
  scene.add(landmark);
  landmarks.set(id, landmark);
}
const baseSceneChildren = scene.children.length;
const fx = new Effects3D({ scene, renderer, picker: {} } as never);
const stage = new CityEventStage(
  { scene, renderer, picker: {} } as never,
  { fx, landmarks, damp(): void {} } as never,
);
stage.attach();
const event = {
  id: 'tornado',
  key: 'smoke',
  name: 'Tornado',
  blurb: 'Visual only',
  severity: 'major',
  startedAtSim: 0,
  endsAtReal: 10,
  focus: { x: 100, y: 0, z: 0 },
} as never;
gameStore.bus.emit({ type: 'CITY_EVENT_STARTED', event });
if (stage.activeCount !== 1) throw new Error('stage did not start the controller');
for (let frame = 0; frame < 5; frame += 1) {
  for (const callback of [...callbacks]) callback(0.1, frame * 0.1);
}
gameStore.bus.emit({ type: 'CITY_EVENT_ENDED', eventId: 'tornado' } as never);
if (stage.activeCount !== 0 || fx.liveCount !== 0 || scene.children.length !== baseSceneChildren) {
  throw new Error('stage did not clean up a finished event');
}
gameStore.bus.emit({ type: 'CITY_EVENT_STARTED', event });
gameStore.bus.emit({ type: 'SIM_RESET', seed: 1, snapshot: {} } as never);
if (stage.activeCount !== 0 || fx.liveCount !== 0 || scene.children.length !== baseSceneChildren) {
  throw new Error('stage did not clean up on simulation reset');
}
stage.destroy();
stage.destroy();
if (camera.children.length !== 1) throw new Error('stage did not release the edge marker');
fx.destroy();
if (camera.children.length !== 0 || callbacks.size !== 0) throw new Error('effects did not release after stage teardown');
console.log('stage smoke passed');
