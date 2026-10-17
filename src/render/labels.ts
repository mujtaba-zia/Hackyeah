import * as THREE from "three";

export interface TextLabel {
  readonly sprite: THREE.Sprite;
  setText(text: string): void;
  dispose(): void;
}

interface LabelDrawing {
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
  scaleX: number;
  scaleY: number;
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  const radius = Math.min(12, height / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawLabel(text: string, foreground: string, background: string): LabelDrawing {
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("canvas-2d-unavailable");
  measureContext.font = "600 30px system-ui, sans-serif";
  const width = Math.min(512, Math.max(150, Math.ceil(measureContext.measureText(text).width + 42)));
  const height = 58;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas-2d-unavailable");
  context.font = "600 30px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = background;
  roundedRect(context, 2, 2, width - 4, height - 4);
  context.fill();
  context.fillStyle = foreground;
  context.fillText(text, width / 2, height / 2 + 1, width - 28);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  return { texture, material, scaleX: width / 90, scaleY: height / 90 };
}

/** Labels grow when zoomed out and shrink when zoomed in, within limits, so names stay readable. */
const MIN_ZOOM_COMPENSATION = 0.8;
const MAX_ZOOM_COMPENSATION = 4.5;

/** A canvas-drawn label that is safe for provider supplied text. */
export function createTextLabel(
  initialText: string,
  foreground = "#eef7ff",
  background = "rgba(20, 31, 50, 0.78)",
): TextLabel {
  let text = initialText;
  let drawing = drawLabel(text, foreground, background);
  const sprite = new THREE.Sprite(drawing.material);
  sprite.renderOrder = 30;
  sprite.scale.set(drawing.scaleX, drawing.scaleY, 1);
  // An orthographic camera scales sprites with zoom; counter it here. The world
  // matrix was computed before this hook, so refresh it for this frame.
  sprite.onBeforeRender = (_renderer, _scene, camera) => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const factor = Math.min(MAX_ZOOM_COMPENSATION, Math.max(MIN_ZOOM_COMPENSATION, 1 / camera.zoom));
    if (sprite.scale.x === drawing.scaleX * factor) return;
    sprite.scale.set(drawing.scaleX * factor, drawing.scaleY * factor, 1);
    sprite.updateMatrixWorld();
  };
  return {
    sprite,
    setText(nextText: string): void {
      if (nextText === text) return;
      text = nextText;
      drawing.texture.dispose();
      drawing.material.dispose();
      drawing = drawLabel(text, foreground, background);
      sprite.material = drawing.material;
      sprite.scale.set(drawing.scaleX, drawing.scaleY, 1);
    },
    dispose(): void {
      drawing.texture.dispose();
      drawing.material.dispose();
    },
  };
}
