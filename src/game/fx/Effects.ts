import Phaser from 'phaser';

/** A running effect. Safe to stop or destroy more than once. */
export interface FxHandle {
  stop(): void;
  destroy(): void;
}

interface Disposable {
  emitters?: Phaser.GameObjects.Particles.ParticleEmitter[];
  objects?: Phaser.GameObjects.GameObject[];
  tweens?: Phaser.Tweens.Tween[];
}

/**
 * Reusable visual effects shared by every city event.
 *
 * The whole point of this class is lifetime discipline: an event that ends must
 * leave nothing behind, because the city is soak tested for ten minutes with
 * disasters firing throughout. Every handle tracks what it created and removes
 * exactly that.
 */
export class Effects {
  private readonly scene: Phaser.Scene;
  private readonly live = new Set<FxHandle>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Number of effects still alive, used by the soak checks. */
  get liveCount(): number {
    return this.live.size;
  }

  private handle(parts: Disposable): FxHandle {
    let destroyed = false;
    const handle: FxHandle = {
      stop: () => {
        for (const emitter of parts.emitters ?? []) emitter.stop();
      },
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        for (const tween of parts.tweens ?? []) tween.stop();
        for (const emitter of parts.emitters ?? []) emitter.destroy();
        for (const object of parts.objects ?? []) object.destroy();
        this.live.delete(handle);
      },
    };
    this.live.add(handle);
    return handle;
  }

  /** Fire and forget emitters clean themselves up once the burst has faded. */
  private oneShot(emitter: Phaser.GameObjects.Particles.ParticleEmitter, lifespanMs: number) {
    this.scene.time.delayedCall(lifespanMs, () => emitter.destroy());
  }

  smoke(x: number, y: number, opts: { tint?: number; rate?: number; depth?: number } = {}): FxHandle {
    const emitter = this.scene.add
      .particles(x, y, 'fx-smoke', {
        speedY: { min: -40, max: -18 },
        speedX: { min: -12, max: 12 },
        scale: { start: 0.5, end: 1.5 },
        alpha: { start: 0.65, end: 0 },
        lifespan: 2000,
        frequency: opts.rate ?? 180,
      })
      .setDepth(opts.depth ?? y + 40);
    if (opts.tint !== undefined) emitter.setParticleTint(opts.tint);
    return this.handle({ emitters: [emitter] });
  }

  fire(x: number, y: number, depth?: number): FxHandle {
    const glow = this.scene.add.ellipse(x, y, 90, 44, 0xff8a3d, 0.35).setDepth((depth ?? y) - 1);
    const flames = this.scene.add
      .particles(x, y, 'fx-fire', {
        speedY: { min: -70, max: -34 },
        speedX: { min: -14, max: 14 },
        scale: { start: 1, end: 0.2 },
        alpha: { start: 0.95, end: 0 },
        lifespan: 700,
        frequency: 70,
      })
      .setDepth(depth ?? y + 2);
    const embers = this.scene.add
      .particles(x, y - 10, 'fx-spark', {
        speed: { min: 20, max: 70 },
        angle: { min: 250, max: 290 },
        scale: { start: 0.6, end: 0 },
        tint: 0xffc23d,
        lifespan: 1100,
        frequency: 220,
      })
      .setDepth(depth ?? y + 3);
    const pulse = this.scene.tweens.add({
      targets: glow,
      fillAlpha: { from: 0.2, to: 0.45 },
      scaleX: { from: 0.9, to: 1.1 },
      duration: 420,
      yoyo: true,
      repeat: -1,
    });
    return this.handle({ emitters: [flames, embers], objects: [glow], tweens: [pulse] });
  }

  sparks(x: number, y: number, tint = 0xffd166, count = 20): void {
    const emitter = this.scene.add
      .particles(x, y, 'fx-spark', {
        speed: { min: 60, max: 200 },
        angle: { min: 200, max: 340 },
        gravityY: 280,
        scale: { start: 0.9, end: 0 },
        tint,
        lifespan: 1000,
        emitting: false,
      })
      .setDepth(y + 5);
    emitter.explode(count);
    this.oneShot(emitter, 1400);
  }

  confetti(x: number, y: number, count = 40): void {
    const emitter = this.scene.add
      .particles(x, y, 'fx-confetti', {
        speed: { min: 90, max: 260 },
        angle: { min: 200, max: 340 },
        gravityY: 260,
        scale: { start: 1, end: 0.3 },
        rotate: { start: 0, end: 360 },
        tint: [0x4ade80, 0xffd166, 0x8fd0ff, 0xef5f8c],
        lifespan: 1800,
        emitting: false,
      })
      .setDepth(y + 6);
    emitter.explode(count);
    this.oneShot(emitter, 2200);
  }

  stars(x: number, y: number): void {
    const emitter = this.scene.add
      .particles(x, y, 'fx-star', {
        speed: { min: 20, max: 70 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 900,
        emitting: false,
      })
      .setDepth(y + 6);
    emitter.explode(10);
    this.oneShot(emitter, 1200);
  }

  explosion(x: number, y: number): void {
    const emitter = this.scene.add
      .particles(x, y, 'fx-fire', {
        speed: { min: 120, max: 320 },
        scale: { start: 1.4, end: 0 },
        lifespan: 700,
        emitting: false,
      })
      .setDepth(y + 7);
    emitter.explode(26);
    this.oneShot(emitter, 1000);
    this.dust(x, y);
    this.shake(0.008, 320);
  }

  dust(x: number, y: number): void {
    const emitter = this.scene.add
      .particles(x, y, 'fx-dust', {
        speed: { min: 40, max: 130 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.7, end: 1.6 },
        alpha: { start: 0.6, end: 0 },
        lifespan: 1300,
        emitting: false,
      })
      .setDepth(y + 4);
    emitter.explode(18);
    this.oneShot(emitter, 1600);
  }

  /** Chunks orbiting a point, used by the tornado. */
  debris(x: number, y: number, radius = 60): FxHandle {
    const chunks: Phaser.GameObjects.Image[] = [];
    const tweens: Phaser.Tweens.Tween[] = [];
    for (let i = 0; i < 7; i++) {
      const chunk = this.scene.add.image(x, y, 'fx-debris').setDepth(y + 8);
      const spin = { angle: (i / 7) * Math.PI * 2 };
      const height = 20 + i * 14;
      chunks.push(chunk);
      tweens.push(
        this.scene.tweens.add({
          targets: spin,
          angle: spin.angle + Math.PI * 2,
          duration: 900 + i * 90,
          repeat: -1,
          onUpdate: () => {
            chunk.setPosition(
              x + Math.cos(spin.angle) * radius,
              y - height + Math.sin(spin.angle) * (radius * 0.4),
            );
            chunk.setAngle(chunk.angle + 7);
          },
        }),
      );
    }
    return this.handle({ objects: chunks, tweens });
  }

  /** Translucent column of light, used by the UFO. */
  beam(x: number, y: number, height: number): FxHandle {
    const beam = this.scene.add
      .image(x, y, 'fx-beam')
      .setOrigin(0.5, 0)
      .setDisplaySize(90, height)
      .setAlpha(0)
      .setDepth(y + 9)
      .setBlendMode(Phaser.BlendModes.ADD);
    const fade = this.scene.tweens.add({ targets: beam, alpha: 0.9, duration: 400 });
    const shimmer = this.scene.tweens.add({
      targets: beam,
      scaleX: { from: 0.9, to: 1.08 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    });
    return this.handle({ objects: [beam], tweens: [fade, shimmer] });
  }

  /** Expanding ring that marks a trouble spot. */
  warningPulse(x: number, y: number): FxHandle {
    const ring = this.scene.add.ellipse(x, y, 60, 30).setStrokeStyle(3, 0xe4573d, 0.9).setDepth(y + 1);
    const pulse = this.scene.tweens.add({
      targets: ring,
      scaleX: 2.6,
      scaleY: 2.6,
      alpha: 0,
      duration: 1200,
      repeat: -1,
    });
    return this.handle({ objects: [ring], tweens: [pulse] });
  }

  /**
   * Citywide, deliberately sparse so it stays cheap. The spawn area covers the
   * whole world rather than the viewport at creation time, so panning during a
   * storm does not leave the wind behind.
   */
  wind(): FxHandle {
    const bounds = this.scene.cameras.main.getBounds();
    const emitter = this.scene.add
      .particles(0, 0, 'fx-dust', {
        x: { min: bounds.left, max: bounds.right },
        y: { min: bounds.top, max: bounds.bottom },
        speedX: { min: 220, max: 420 },
        speedY: { min: -20, max: 20 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.35, end: 0 },
        lifespan: 1400,
        frequency: 90,
      })
      .setDepth(2_000_000);
    return this.handle({ emitters: [emitter] });
  }

  shake(intensity = 0.006, durationMs = 400): void {
    this.scene.cameras.main.shake(durationMs, intensity);
  }

  flash(color: number, durationMs = 300): void {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    this.scene.cameras.main.flash(durationMs, r, g, b);
  }

  destroy(): void {
    for (const handle of [...this.live]) handle.destroy();
    this.live.clear();
  }
}
