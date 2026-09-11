import Phaser from 'phaser';

/**
 * The build output as a physical crate. One instance exists for the whole run,
 * so the same logical artifact is visibly handed from stage to stage instead of
 * being respawned at each landmark.
 */
export class PipelineArtifact {
  readonly sprite: Phaser.GameObjects.Image;

  private readonly scene: Phaser.Scene;
  private idleTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.sprite = scene.add.image(0, 0, 'fx-crate').setVisible(false);
  }

  /** Pops the crate out of a building and leaves it hovering above the ground. */
  appearAt(x: number, y: number): void {
    this.stopIdle();
    this.sprite.setVisible(true).setPosition(x, y - 10).setDepth(y + 4).setScale(0.2).setAlpha(1);
    this.scene.tweens.add({
      targets: this.sprite,
      scale: 1,
      y: y - 46,
      duration: 480,
      ease: 'Back.out',
      onComplete: () => this.startIdle(),
    });
  }

  /** Drops the crate onto a landmark and fades it into the building. */
  deliverTo(x: number, y: number, onDone: () => void): void {
    this.stopIdle();
    this.sprite.setVisible(true).setDepth(y + 4);
    this.scene.tweens.add({
      targets: this.sprite,
      x,
      y: y - 34,
      duration: 420,
      ease: 'Cubic.out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.sprite,
          y: y - 8,
          scale: 0.4,
          alpha: 0,
          duration: 340,
          ease: 'Quad.in',
          onComplete: () => {
            this.sprite.setVisible(false).setScale(1).setAlpha(1);
            onDone();
          },
        });
      },
    });
  }

  private startIdle() {
    this.idleTween = this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 6,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private stopIdle() {
    this.idleTween?.stop();
    this.idleTween = undefined;
  }

  hide(): void {
    this.stopIdle();
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setVisible(false).setScale(1).setAlpha(1);
  }
}
