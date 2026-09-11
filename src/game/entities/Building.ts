import Phaser from 'phaser';
import { TEXTURE_ORIGIN } from '../world/textures';
import { tileToWorld, type TilePos } from '../world/iso';

export interface BuildingOptions {
  id: string;
  name: string;
  tile: TilePos;
  texture: string;
  /** Landmarks are clickable, labelled and stand out from decoration. */
  interactive?: boolean;
}

/**
 * A placed isometric building. Knows how to be selected/highlighted; knows
 * nothing about pipelines.
 */
export class Building extends Phaser.GameObjects.Container {
  readonly buildingId: string;
  readonly buildingName: string;
  readonly sprite: Phaser.GameObjects.Image;

  private readonly marker?: Phaser.GameObjects.Ellipse;
  private readonly label?: Phaser.GameObjects.Text;
  private selected = false;

  constructor(scene: Phaser.Scene, options: BuildingOptions) {
    const { x, y } = tileToWorld(options.tile);
    super(scene, x, y);
    this.buildingId = options.id;
    this.buildingName = options.name;

    if (options.interactive) {
      this.marker = scene.add.ellipse(0, 0, 120, 60, 0xffe27a, 0.0).setStrokeStyle(3, 0xffd166, 0);
      this.add(this.marker);
    }

    const origin = TEXTURE_ORIGIN[options.texture] ?? { x: 0.5, y: 1 };
    this.sprite = scene.add.image(0, 0, options.texture).setOrigin(origin.x, origin.y);
    this.add(this.sprite);

    if (options.interactive) {
      this.label = scene.add
        .text(0, 14, options.name.toUpperCase(), {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '13px',
          color: '#12202e',
          backgroundColor: '#ffffffcc',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5, 0);
      this.add(this.label);
      this.sprite.setInteractive({ pixelPerfect: true, useHandCursor: true });
      this.sprite.on('pointerover', () => this.setHovered(true));
      this.sprite.on('pointerout', () => this.setHovered(false));
    }

    this.setDepth(y);
    scene.add.existing(this);
  }

  private setHovered(hovered: boolean) {
    if (this.selected) return;
    this.sprite.setTint(hovered ? 0xdcecff : 0xffffff);
    this.marker?.setStrokeStyle(3, 0xffd166, hovered ? 0.6 : 0);
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.sprite.clearTint();
    this.marker?.setStrokeStyle(4, 0xffd166, selected ? 1 : 0);
    this.marker?.setFillStyle(0xffe27a, selected ? 0.25 : 0);
    this.label?.setColor(selected ? '#7a4b00' : '#12202e');
    this.scene.tweens.add({
      targets: this.sprite,
      scale: selected ? 1.06 : 1,
      duration: 160,
      ease: 'Back.out',
    });
  }
}
