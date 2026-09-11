import Phaser from 'phaser';
import type { PipelineStatus } from '../state/gameState';
import { Building, type BuildingOptions } from './Building';

/**
 * The first reactive entity. It consumes normalized game state only:
 * `setStatus` for durable state, `celebrate`/`malfunction` for one-shot
 * feedback. It never learns where the pipeline data came from.
 */
export class BuildFactory extends Building {
  private readonly gear: Phaser.GameObjects.Image;
  private readonly workers: Phaser.GameObjects.Image[] = [];
  private readonly glow: Phaser.GameObjects.Ellipse;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;

  private runningTweens: Phaser.Tweens.Tween[] = [];
  private status: PipelineStatus = 'idle';

  constructor(scene: Phaser.Scene, options: BuildingOptions) {
    super(scene, options);

    this.glow = scene.add.ellipse(0, 6, 170, 84, 0xffd166, 0).setDepth(-1);
    this.addAt(this.glow, 0);

    this.gear = scene.add.image(-6, -this.sprite.displayHeight - 8, 'fx-gear').setVisible(false);
    this.add(this.gear);

    for (const dx of [-34, 20]) {
      const worker = scene.add.image(dx, 10, 'a-worker').setVisible(false);
      this.workers.push(worker);
      this.add(worker);
    }

    // Chimney smoke, in world space so particles are not clipped by the container.
    this.smoke = scene.add
      .particles(this.x - 18, this.y - this.sprite.displayHeight - 14, 'fx-smoke', {
        speedY: { min: -34, max: -16 },
        speedX: { min: -10, max: 10 },
        scale: { start: 0.5, end: 1.3 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 1800,
        frequency: 220,
      })
      .setDepth(this.depth + 1)
      .stop();

    this.sparks = scene.add
      .particles(this.x, this.y - 40, 'fx-spark', {
        speed: { min: 60, max: 190 },
        angle: { min: 200, max: 340 },
        gravityY: 260,
        scale: { start: 0.9, end: 0 },
        lifespan: 1100,
        emitting: false,
      })
      .setDepth(this.depth + 2);
  }

  setStatus(status: PipelineStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.stopRunningAnimation();

    switch (status) {
      case 'running':
        this.startRunningAnimation();
        break;
      case 'success':
        this.celebrate();
        break;
      case 'failed':
        this.malfunction();
        break;
      case 'idle':
        this.sprite.clearTint();
        this.glow.setFillStyle(0xffd166, 0);
        break;
    }
  }

  private startRunningAnimation() {
    this.gear.setVisible(true).setAngle(0);
    this.smoke.setParticleTint(0xffffff);
    this.smoke.start();
    this.runningTweens.push(
      this.scene.tweens.add({ targets: this.gear, angle: 360, duration: 1800, repeat: -1 }),
      this.scene.tweens.add({
        targets: this.glow,
        fillAlpha: { from: 0.12, to: 0.4 },
        duration: 700,
        yoyo: true,
        repeat: -1,
      }),
    );
    this.glow.setFillStyle(0xffd166, 0.2);

    this.workers.forEach((worker, i) => {
      worker.setVisible(true);
      this.runningTweens.push(
        this.scene.tweens.add({
          targets: worker,
          y: worker.y - 7,
          duration: 420,
          delay: i * 180,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        }),
      );
    });
  }

  private stopRunningAnimation() {
    for (const tween of this.runningTweens) tween.stop();
    this.runningTweens = [];
    this.smoke.stop();
    this.gear.setVisible(false);
    for (const worker of this.workers) worker.setVisible(false).setY(10);
  }

  private celebrate() {
    this.glow.setFillStyle(0x4ade80, 0.45);
    this.sprite.setTint(0xd6ffd9);
    this.sparks.setParticleTint(0x4ade80);
    this.sparks.explode(26);
    this.popIcon('fx-check');
    this.scene.tweens.add({
      targets: this.glow,
      fillAlpha: 0.15,
      duration: 900,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.glow.setFillStyle(0x4ade80, 0.2),
    });
  }

  private malfunction() {
    this.glow.setFillStyle(0xef4444, 0.4);
    this.sprite.setTint(0xffb3b3);
    this.sparks.setParticleTint(0xff9d5c);
    this.sparks.explode(22);
    this.smoke.setParticleTint(0x333333);
    this.smoke.start();
    this.scene.time.delayedCall(2200, () => {
      if (this.status === 'failed') this.smoke.stop();
    });
    this.popIcon('fx-alert');

    // Cartoon wobble, not destruction.
    const baseX = this.sprite.x;
    this.scene.tweens.add({
      targets: this.sprite,
      x: { from: baseX - 6, to: baseX + 6 },
      duration: 60,
      yoyo: true,
      repeat: 8,
      onComplete: () => this.sprite.setX(baseX),
    });
    this.scene.tweens.add({
      targets: this.glow,
      fillAlpha: { from: 0.45, to: 0.1 },
      duration: 300,
      yoyo: true,
      repeat: 6,
    });
  }

  private popIcon(texture: string) {
    const icon = this.scene.add
      .image(this.x, this.y - this.sprite.displayHeight - 30, texture)
      .setDepth(this.depth + 3)
      .setScale(0.2);
    this.scene.tweens.add({
      targets: icon,
      scale: 1,
      y: icon.y - 34,
      duration: 520,
      ease: 'Back.out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: icon,
          alpha: 0,
          duration: 700,
          delay: 700,
          onComplete: () => icon.destroy(),
        });
      },
    });
  }
}
