import Phaser from 'phaser';
import type { PrMood } from '../state/gameState';
import { tileToWorld, type TilePos } from '../world/iso';

const MOOD_TEXTURE: Record<PrMood, string> = {
  happy: 'pr-happy',
  calm: 'pr-calm',
  watching: 'pr-watching',
  pacing: 'pr-pacing',
  annoyed: 'pr-annoyed',
  angry: 'pr-angry',
};

/** Walking speed in world pixels per second. */
const WALK_SPEED = 46;

/**
 * A pull request as a citizen. One character is either a single PR or a group
 * of similar PRs from one repository, shown with a count badge so a busy
 * repository does not bury Review Hall under stacked sprites.
 */
export class PRCharacter {
  readonly sprite: Phaser.GameObjects.Image;
  /** Stable key: a PR id, or `group:<repoId>`. */
  readonly key: string;

  private readonly scene: Phaser.Scene;
  private readonly badge: Phaser.GameObjects.Image;
  private readonly badgeText: Phaser.GameObjects.Text;
  private mood: PrMood = 'happy';
  private idleTween?: Phaser.Tweens.Tween;
  private walkTween?: Phaser.Tweens.Tween;
  /** True while a scripted walk is in progress, so state churn cannot restart it. */
  walking = false;

  constructor(scene: Phaser.Scene, key: string, tile: TilePos, repoColor: number) {
    this.scene = scene;
    this.key = key;

    const { x, y } = tileToWorld(tile);
    this.sprite = scene.add.image(x, y, MOOD_TEXTURE.happy).setDepth(y);

    this.badge = scene.add.image(x + 10, y - 30, 'pr-badge').setTint(repoColor).setDepth(y + 1);
    this.badgeText = scene.add
      .text(x + 10, y - 30, '', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(y + 2);
    this.setCount(1);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  setMood(mood: PrMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.sprite.setTexture(MOOD_TEXTURE[mood]);
    this.restartIdle();
  }

  /** Group characters show a count; single PRs show only the repository badge. */
  setCount(count: number): void {
    const grouped = count > 1;
    this.badgeText.setText(grouped ? `${count}` : '');
    this.badge.setScale(grouped ? 1 : 0.6);
  }

  /** Idle behaviour reads the mood: calm bobbing through to angry shaking. */
  private restartIdle() {
    this.idleTween?.stop();
    if (this.walking) return;

    const base = { targets: this.sprite, yoyo: true, repeat: -1, ease: 'Sine.inOut' as const };
    switch (this.mood) {
      case 'angry':
        this.idleTween = this.scene.tweens.add({ ...base, angle: { from: -7, to: 7 }, duration: 110 });
        break;
      case 'annoyed':
        this.idleTween = this.scene.tweens.add({ ...base, angle: { from: -4, to: 4 }, duration: 240 });
        break;
      case 'pacing':
        this.idleTween = this.scene.tweens.add({
          ...base,
          x: { from: this.sprite.x - 12, to: this.sprite.x + 12 },
          duration: 1400,
          onUpdate: () => this.syncBadge(),
        });
        break;
      case 'watching':
        this.idleTween = this.scene.tweens.add({ ...base, scaleY: { from: 1, to: 0.94 }, duration: 700 });
        break;
      default:
        this.idleTween = this.scene.tweens.add({
          ...base,
          y: { from: this.sprite.y, to: this.sprite.y - 4 },
          duration: 900,
          onUpdate: () => this.syncBadge(),
        });
        break;
    }
  }

  private syncBadge() {
    this.badge.setPosition(this.sprite.x + 10, this.sprite.y - 30).setDepth(this.sprite.y + 1);
    this.badgeText.setPosition(this.badge.x, this.badge.y).setDepth(this.sprite.y + 2);
    this.sprite.setDepth(this.sprite.y);
  }

  /** Walks a waypoint list, then parks. Chained tweens, no pathfinding. */
  walk(route: readonly TilePos[], onArrive?: () => void): void {
    this.idleTween?.stop();
    this.walking = true;
    const points = route.map((tile) => tileToWorld(tile));

    const step = (index: number) => {
      if (index >= points.length) {
        this.walking = false;
        this.sprite.setAngle(0);
        this.restartIdle();
        onArrive?.();
        return;
      }
      const target = points[index];
      const distance = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, target.x, target.y);
      this.sprite.setFlipX(target.x < this.sprite.x);
      this.walkTween = this.scene.tweens.add({
        targets: this.sprite,
        x: target.x,
        y: target.y,
        duration: Math.max(120, (distance / WALK_SPEED) * 1000),
        onUpdate: () => this.syncBadge(),
        onComplete: () => step(index + 1),
      });
    };
    step(0);
  }

  /** Short hop to a waiting spot without a full route. */
  moveTo(tile: TilePos, onArrive?: () => void): void {
    this.walk([tile], onArrive);
  }

  /** Merge celebration: a jump, confetti and then removal. */
  celebrate(onDone: () => void): void {
    this.idleTween?.stop();
    this.walkTween?.stop();
    this.walking = true;
    this.scene.add
      .particles(this.sprite.x, this.sprite.y - 20, 'fx-confetti', {
        speed: { min: 70, max: 190 },
        angle: { min: 200, max: 340 },
        gravityY: 300,
        lifespan: 1200,
        scale: { start: 1, end: 0 },
        tint: [0x4ade80, 0xffd166, 0x8fd0ff],
        emitting: false,
      })
      .explode(28);

    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 26,
      duration: 260,
      yoyo: true,
      repeat: 1,
      onUpdate: () => this.syncBadge(),
      onComplete: () => {
        this.scene.tweens.add({
          targets: [this.sprite, this.badge, this.badgeText],
          alpha: 0,
          duration: 320,
          onComplete: onDone,
        });
      },
    });
  }

  destroy(): void {
    this.idleTween?.stop();
    this.walkTween?.stop();
    this.sprite.destroy();
    this.badge.destroy();
    this.badgeText.destroy();
  }
}
