import Phaser from 'phaser';

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.2;
const KEY_PAN_SPEED = 520; // world px per second at zoom 1

/** Desktop camera: left-drag pan, wheel zoom, WASD/arrows, reset. */
export class CameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly keys: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key[]>;
  private readonly home: { x: number; y: number; zoom: number };

  private dragging = false;
  private dragOrigin = new Phaser.Math.Vector2();
  private cameraOrigin = new Phaser.Math.Vector2();
  /** Squared pointer travel since press; lets the scene ignore clicks after a drag. */
  dragDistance = 0;

  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, home: { x: number; y: number; zoom: number }) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.home = home;

    const keyboard = scene.input.keyboard;
    const bind = (codes: string) => (keyboard ? codes.split(',').map((c) => keyboard.addKey(c.trim())) : []);
    this.keys = {
      up: bind('W,UP'),
      down: bind('S,DOWN'),
      left: bind('A,LEFT'),
      right: bind('D,RIGHT'),
    };

    scene.input.on('pointerdown', this.onPointerDown);
    scene.input.on('pointermove', this.onPointerMove);
    scene.input.on('pointerup', this.onPointerUp);
    scene.input.on('pointerupoutside', this.onPointerUp);
    scene.input.on('wheel', this.onWheel);

    this.reset(false);
  }

  private onPointerDown = (pointer: Phaser.Input.Pointer) => {
    if (!pointer.leftButtonDown()) return;
    this.dragging = true;
    this.dragDistance = 0;
    this.dragOrigin.set(pointer.x, pointer.y);
    this.cameraOrigin.set(this.camera.scrollX, this.camera.scrollY);
  };

  /** Set once the user moves the camera themselves; suppresses auto re-framing. */
  userMoved = false;

  private onPointerMove = (pointer: Phaser.Input.Pointer) => {
    if (!this.dragging) return;
    const dx = pointer.x - this.dragOrigin.x;
    const dy = pointer.y - this.dragOrigin.y;
    this.dragDistance = Math.max(this.dragDistance, dx * dx + dy * dy);
    if (this.wasDragged) this.userMoved = true;
    this.camera.setScroll(
      this.cameraOrigin.x - dx / this.camera.zoom,
      this.cameraOrigin.y - dy / this.camera.zoom,
    );
  };

  private onPointerUp = () => {
    this.dragging = false;
  };

  private onWheel = (_p: unknown, _o: unknown, _dx: number, dy: number) => {
    const zoom = Phaser.Math.Clamp(this.camera.zoom * (dy > 0 ? 0.88 : 1.12), MIN_ZOOM, MAX_ZOOM);
    this.camera.setZoom(zoom);
    this.userMoved = true;
  };

  /** True while the user is dragging, or has dragged more than a few pixels. */
  get wasDragged(): boolean {
    return this.dragDistance > 36;
  }

  update(_time: number, delta: number): void {
    const step = (KEY_PAN_SPEED * delta) / 1000 / this.camera.zoom;
    const isDown = (keys: Phaser.Input.Keyboard.Key[]) => keys.some((k) => k.isDown);
    let dx = 0;
    let dy = 0;
    if (isDown(this.keys.left)) dx -= step;
    if (isDown(this.keys.right)) dx += step;
    if (isDown(this.keys.up)) dy -= step;
    if (isDown(this.keys.down)) dy += step;
    if (dx === 0 && dy === 0) return;
    this.userMoved = true;
    this.camera.setScroll(this.camera.scrollX + dx, this.camera.scrollY + dy);
  }

  reset(animated = true): void {
    this.userMoved = false;
    this.dragDistance = 0;
    if (!animated) {
      this.camera.setZoom(this.home.zoom);
      this.camera.centerOn(this.home.x, this.home.y);
      return;
    }
    // Interpolate the camera's mid-point: `centerOn` is the only framing maths
    // used anywhere, so animated and instant resets cannot drift apart.
    const view = { x: this.camera.midPoint.x, y: this.camera.midPoint.y, zoom: this.camera.zoom };
    this.scene.tweens.add({
      targets: view,
      x: this.home.x,
      y: this.home.y,
      zoom: this.home.zoom,
      duration: 420,
      ease: 'Cubic.out',
      onUpdate: () => {
        this.camera.setZoom(view.zoom);
        this.camera.centerOn(view.x, view.y);
      },
    });
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown);
    this.scene.input.off('pointermove', this.onPointerMove);
    this.scene.input.off('pointerup', this.onPointerUp);
    this.scene.input.off('pointerupoutside', this.onPointerUp);
    this.scene.input.off('wheel', this.onWheel);
  }
}
