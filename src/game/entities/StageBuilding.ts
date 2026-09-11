import Phaser from 'phaser';
import type { StageStatus } from '../state/gameState';
import { Building, type BuildingOptions } from './Building';

export interface StageVisuals {
  /** Sprite that spins or pulses while the stage is working. */
  activity: 'gear' | 'scan';
  /** Icon that pops on success. */
  successIcon: 'fx-check' | 'fx-shield';
  /** Industrial sites puff smoke while working. */
  smoke: boolean;
}

/**
 * A landmark that reacts to its pipeline stage. It consumes a `StageStatus` and
 * nothing else, so it does not care whether the event came from the demo
 * controls, a scripted run or a future Azure DevOps adapter.
 */
export class StageBuilding extends Building {
  private readonly visuals: StageVisuals;
  private readonly activity: Phaser.GameObjects.Image;
  private readonly workers: Phaser.GameObjects.Image[] = [];
  private readonly glow: Phaser.GameObjects.Ellipse;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;

  private busyTweens: Phaser.Tweens.Tween[] = [];
  private status: StageStatus = 'pending';

  constructor(scene: Phaser.Scene, options: BuildingOptions, visuals: StageVisuals) {
    super(scene, options);
    this.visuals = visuals;

    this.glow = scene.add.ellipse(0, 6, 180, 90, 0xffd166, 0).setDepth(-1);
    this.addAt(this.glow, 0);

    const activityKey = visuals.activity === 'gear' ? 'fx-gear' : 'fx-scan';
    this.activity = scene.add
      .image(-4, -this.sprite.displayHeight - 6, activityKey)
      .setVisible(false);
    this.add(this.activity);

    for (const dx of [-32, 22]) {
      const worker = scene.add.image(dx, 12, 'a-worker').setVisible(false);
      this.workers.push(worker);
      this.add(worker);
    }

    // Particles live in world space so they are not clipped by the container.
    this.smoke = scene.add
      .particles(this.x - 16, this.y - this.sprite.displayHeight - 10, 'fx-smoke', {
        speedY: { min: -34, max: -16 },
        speedX: { min: -10, max: 10 },
        scale: { start: 0.5, end: 1.3 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 1800,
        frequency: 240,
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

  setStageStatus(status: StageStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.stopBusyAnimation();

    switch (status) {
      case 'running':
        this.startBusyAnimation();
        break;
      case 'success':
        this.celebrate();
        break;
      case 'failed':
        this.malfunction();
        break;
      case 'pending':
        this.sprite.clearTint();
        this.glow.setFillStyle(0xffd166, 0);
        break;
    }
  }

  private startBusyAnimation() {
    this.sprite.clearTint();
    this.activity.setVisible(true).setAngle(0).setScale(1).setAlpha(1);
    this.glow.setFillStyle(0xffd166, 0.2);

    this.busyTweens.push(
      this.visuals.activity === 'gear'
        ? this.scene.tweens.add({ targets: this.activity, angle: 360, duration: 1800, repeat: -1 })
        : this.scene.tweens.add({
            targets: this.activity,
            scale: { from: 0.6, to: 1.25 },
            alpha: { from: 0.95, to: 0.25 },
            duration: 900,
            repeat: -1,
          }),
      this.scene.tweens.add({
        targets: this.glow,
        fillAlpha: { from: 0.12, to: 0.4 },
        duration: 700,
        yoyo: true,
        repeat: -1,
      }),
    );

    if (this.visuals.smoke) {
      this.smoke.setParticleTint(0xffffff);
      this.smoke.start();
    }

    this.workers.forEach((worker, i) => {
      worker.setVisible(true);
      this.busyTweens.push(
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

  private stopBusyAnimation() {
    for (const tween of this.busyTweens) tween.stop();
    this.busyTweens = [];
    this.smoke.stop();
    this.activity.setVisible(false);
    for (const worker of this.workers) worker.setVisible(false).setY(12);
  }

  private celebrate() {
    this.glow.setFillStyle(0x4ade80, 0.45);
    this.sprite.setTint(0xd6ffd9);
    this.sparks.setParticleTint(0x4ade80);
    this.sparks.explode(24);
    this.popIcon(this.visuals.successIcon);
    this.scene.tweens.add({
      targets: this.glow,
      fillAlpha: 0.18,
      duration: 800,
      onComplete: () => this.sprite.clearTint(),
    });
  }

  private malfunction() {
    this.glow.setFillStyle(0xef4444, 0.4);
    this.sprite.setTint(0xffb3b3);
    this.sparks.setParticleTint(0xff9d5c);
    this.sparks.explode(22);
    this.smoke.setParticleTint(0x333333);
    this.smoke.start();
    this.scene.time.delayedCall(2400, () => {
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
      fillAlpha: { from: 0.45, to: 0.12 },
      duration: 300,
      yoyo: true,
      repeat: 6,
    });
  }

  /** Big celebration used when the whole pipeline lands. */
  burstConfetti(): void {
    this.sparks.setParticleTint(0xffd166);
    this.sparks.explode(60);
  }

  private popIcon(texture: string) {
    const icon = this.scene.add
      .image(this.x, this.y - this.sprite.displayHeight - 26, texture)
      .setDepth(this.depth + 3)
      .setScale(0.2);
    this.scene.tweens.add({
      targets: icon,
      scale: 1,
      y: icon.y - 32,
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
