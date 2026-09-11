import Phaser from 'phaser';
import { Building, type BuildingOptions } from './Building';

export interface WorkVisuals {
  /** Sprite that spins or pulses while the building is working. */
  activity: 'gear' | 'scan';
  /** Icon that pops on success. */
  successIcon: 'fx-check' | 'fx-shield';
  /** Industrial sites puff smoke while working. */
  smoke: boolean;
}

/** Worker sprites shown at full load. Two workers per concurrent job. */
const MAX_WORKERS = 6;

/**
 * A landmark that visibly works.
 *
 * The API is split deliberately:
 *   setBusy / setWorkload  continuous state, re-applied on every simulation tick
 *   flashSuccess / flashFailure / burstConfetti  one-shot spectacle from events
 *
 * Keeping them apart means the four times a second state sync can never cancel
 * an explosion mid animation, and the building still consumes normalized state
 * only, so the mock simulator and a future Azure DevOps adapter look identical.
 */
export class WorkBuilding extends Building {
  private readonly visuals: WorkVisuals;
  private readonly activity: Phaser.GameObjects.Image;
  private readonly workers: Phaser.GameObjects.Image[] = [];
  private readonly workerTweens: (Phaser.Tweens.Tween | undefined)[] = [];
  private readonly glow: Phaser.GameObjects.Ellipse;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;

  private busyTweens: Phaser.Tweens.Tween[] = [];
  private busy = false;
  private workload = 0;
  private failing = false;

  constructor(scene: Phaser.Scene, options: BuildingOptions, visuals: WorkVisuals) {
    super(scene, options);
    this.visuals = visuals;

    this.glow = scene.add.ellipse(0, 6, 180, 90, 0xffd166, 0).setDepth(-1);
    this.addAt(this.glow, 0);

    const activityKey = visuals.activity === 'gear' ? 'fx-gear' : 'fx-scan';
    this.activity = scene.add.image(-4, -this.sprite.displayHeight - 6, activityKey).setVisible(false);
    this.add(this.activity);

    // A fixed pool of worker sprites, revealed as the building gets busier.
    for (let i = 0; i < MAX_WORKERS; i++) {
      const worker = scene.add
        .image(-40 + (i % 3) * 30, 6 + Math.floor(i / 3) * 12, 'a-worker')
        .setVisible(false);
      this.workers.push(worker);
      this.workerTweens.push(undefined);
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

  /** Shared pipeline stage sites: is any run being processed here right now. */
  setBusy(busy: boolean): void {
    if (busy === this.busy) return;
    this.busy = busy;
    this.refreshActivity();
  }

  /**
   * Repository factories: how many jobs this building hosts. Workers, machinery
   * and smoke scale with it, so the workload is readable without a tooltip.
   */
  setWorkload(runningJobs: number, failing: boolean): void {
    if (runningJobs === this.workload && failing === this.failing) return;
    this.workload = runningJobs;
    this.failing = failing;

    const wanted = Math.min(MAX_WORKERS, runningJobs * 2);
    this.workers.forEach((worker, i) => {
      const shouldShow = i < wanted;
      if (shouldShow === worker.visible) return;
      worker.setVisible(shouldShow);
      if (shouldShow) {
        this.workerTweens[i] = this.scene.tweens.add({
          targets: worker,
          y: worker.y - 6,
          duration: 380 + i * 40,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      } else {
        this.workerTweens[i]?.stop();
        this.workerTweens[i] = undefined;
      }
    });

    this.refreshActivity();
  }

  private get working(): boolean {
    return this.busy || this.workload > 0;
  }

  private refreshActivity() {
    if (this.working) {
      this.startBusyAnimation();
      if (this.visuals.smoke && !this.failing) {
        this.smoke.setParticleTint(0xffffff);
        this.smoke.start();
      }
      return;
    }
    this.stopBusyAnimation();
    if (!this.failing) this.smoke.stop();
  }

  private startBusyAnimation() {
    if (this.busyTweens.length > 0) return;
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
  }

  private stopBusyAnimation() {
    for (const tween of this.busyTweens) tween.stop();
    this.busyTweens = [];
    this.activity.setVisible(false);
    this.glow.setFillStyle(0xffd166, 0);
  }

  flashSuccess(): void {
    this.sparks.setParticleTint(0x4ade80);
    this.sparks.explode(20);
    this.popIcon(this.visuals.successIcon);
    this.glow.setFillStyle(0x4ade80, 0.4);
    this.scene.tweens.add({
      targets: this.glow,
      fillAlpha: this.working ? 0.2 : 0,
      duration: 900,
    });
  }

  flashFailure(): void {
    this.sparks.setParticleTint(0xff9d5c);
    this.sparks.explode(22);
    this.popIcon('fx-alert');
    this.sprite.setTint(0xffb3b3);
    this.smoke.setParticleTint(0x333333);
    this.smoke.start();
    this.scene.time.delayedCall(2600, () => {
      this.sprite.clearTint();
      if (!this.failing) this.refreshActivity();
    });

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
  }

  /** Big celebration used when a deploy lands. */
  burstConfetti(): void {
    this.sparks.setParticleTint(0xffd166);
    this.sparks.explode(50);
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
          delay: 600,
          onComplete: () => icon.destroy(),
        });
      },
    });
  }
}
