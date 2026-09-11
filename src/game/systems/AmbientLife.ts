import Phaser from 'phaser';
import { CITY_CENTER, TERRAIN_H, TERRAIN_W } from '../world/cityLayout';
import { tileToWorld, type TilePos } from '../world/iso';

/**
 * Cheap decoration that is not traffic or pedestrians: clouds, the plaza
 * fountain and industrial chimney smoke. Tween driven, no update loop.
 */
export function createAmbientLife(scene: Phaser.Scene, chimneys: readonly TilePos[]): void {
  const west = tileToWorld({ tx: 0, ty: TERRAIN_H });
  const east = tileToWorld({ tx: TERRAIN_W, ty: 0 });
  const span = east.x - west.x;

  for (let i = 0; i < 5; i++) {
    const cloud = scene.add
      .image(west.x + (span / 5) * i, -420 + i * 190, 'fx-cloud')
      .setDepth(1_000_000)
      .setAlpha(0.7)
      .setScale(0.9 + (i % 3) * 0.35);
    scene.tweens.add({
      targets: cloud,
      x: cloud.x + span + 600,
      duration: 90_000 + i * 12_000,
      repeat: -1,
      delay: i * 5_000,
    });
  }

  const center = tileToWorld(CITY_CENTER);
  scene.add
    .particles(center.x, center.y - 40, 'fx-spark', {
      speed: { min: 34, max: 76 },
      angle: { min: 250, max: 290 },
      gravityY: 170,
      scale: { start: 0.5, end: 0 },
      tint: 0x9fdcff,
      lifespan: 950,
      frequency: 80,
    })
    .setDepth(center.y + 1);

  // Industrial district keeps working even when no pipeline is running.
  for (const tile of chimneys) {
    const { x, y } = tileToWorld(tile);
    scene.add
      .particles(x, y - 70, 'fx-smoke', {
        speedY: { min: -26, max: -12 },
        speedX: { min: -8, max: 8 },
        scale: { start: 0.4, end: 1.1 },
        alpha: { start: 0.45, end: 0 },
        lifespan: 2600,
        frequency: 700,
      })
      .setDepth(y + 1);
  }
}
