import Phaser from 'phaser';
import { tileToWorld, type TilePos } from '../world/iso';

/**
 * The delivery vehicle that physically carries the build artifact between
 * pipeline landmarks. It follows hand authored road legs; there is no
 * pathfinding anywhere in this prototype.
 */
export class PipelineTruck {
  readonly sprite: Phaser.GameObjects.Image;

  private readonly scene: Phaser.Scene;
  /** Rides along with the truck while it is loaded. */
  private cargo?: Phaser.GameObjects.Image;
  private legTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, texture = 'a-pipeline-truck') {
    this.scene = scene;
    this.sprite = scene.add.image(0, 0, texture).setVisible(false);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  park(tile: TilePos): void {
    const { x, y } = tileToWorld(tile);
    this.sprite.setPosition(x, y).setDepth(y).setVisible(true);
  }

  load(cargo: Phaser.GameObjects.Image): void {
    this.cargo = cargo;
    cargo.setVisible(true);
    this.syncCargo();
  }

  unload(): Phaser.GameObjects.Image | undefined {
    const cargo = this.cargo;
    this.cargo = undefined;
    return cargo;
  }

  /**
   * Drives the waypoint list at a constant speed, chaining one tween per leg so
   * the truck turns at intersections instead of cutting corners.
   */
  drive(route: readonly TilePos[], speed: number, onArrive: () => void): void {
    const points = route.map((tile) => tileToWorld(tile));
    if (points.length === 0) {
      onArrive();
      return;
    }

    this.sprite.setVisible(true).setPosition(points[0].x, points[0].y).setDepth(points[0].y);
    this.syncCargo();

    const step = (index: number) => {
      if (index >= points.length) {
        onArrive();
        return;
      }
      const target = points[index];
      const distance = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, target.x, target.y);
      this.sprite.setFlipX(target.x < this.sprite.x);
      this.legTween = this.scene.tweens.add({
        targets: this.sprite,
        x: target.x,
        y: target.y,
        duration: Math.max(120, (distance / speed) * 1000),
        onUpdate: () => {
          this.sprite.setDepth(this.sprite.y);
          this.syncCargo();
        },
        onComplete: () => step(index + 1),
      });
    };
    step(1);
  }

  private syncCargo() {
    if (!this.cargo) return;
    this.cargo.setPosition(this.sprite.x, this.sprite.y - 22).setDepth(this.sprite.depth + 1);
  }

  stop(): void {
    this.legTween?.stop();
    this.legTween = undefined;
  }

  hide(): void {
    this.stop();
    this.cargo = undefined;
    this.sprite.setVisible(false);
  }
}
