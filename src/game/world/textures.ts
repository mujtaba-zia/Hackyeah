import Phaser from 'phaser';
import { TILE_H, TILE_W } from './iso';

/**
 * All art is generated at runtime as simple flat-shaded isometric blocks.
 * Placeholder-quality by intent (Milestone 1): readable > beautiful.
 *
 * Every generated texture registers its origin here so sprites can be anchored
 * on the centre of their ground tile.
 */
export const TEXTURE_ORIGIN: Record<string, { x: number; y: number }> = {};

interface Faces {
  top: number;
  left: number;
  right: number;
}

const pts = (...coords: [number, number][]): Phaser.Math.Vector2[] =>
  coords.map(([x, y]) => new Phaser.Math.Vector2(x, y));

/** Draws an isometric cuboid; (x, y) is the top-left of its top diamond. */
function block(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, faces: Faces) {
  const hh = w / 2;
  const cx = x + w / 2;
  g.fillStyle(faces.left);
  g.fillPoints(pts([x, y + hh / 2], [cx, y + hh], [cx, y + hh + h], [x, y + hh / 2 + h]), true);
  g.fillStyle(faces.right);
  g.fillPoints(pts([cx, y + hh], [x + w, y + hh / 2], [x + w, y + hh / 2 + h], [cx, y + hh + h]), true);
  g.fillStyle(faces.top);
  g.fillPoints(pts([cx, y], [x + w, y + hh / 2], [cx, y + hh], [x, y + hh / 2]), true);
}

/** Window dots on both visible side faces of a block. */
function windows(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  _h: number,
  rows: number,
  color = 0xfff3b0,
) {
  const hh = w / 2;
  const cx = x + w / 2;
  g.fillStyle(color, 0.95);
  for (let r = 0; r < rows; r++) {
    const wy = y + hh + 14 + r * 18;
    for (let c = 0; c < 2; c++) {
      const fx = 0.3 + c * 0.36;
      // left face slopes down towards the left, right face towards the right
      g.fillRect(x + fx * (w / 2) - 4, wy - fx * (hh / 2) + hh / 2 - 4, 8, 9);
      g.fillRect(cx + fx * (w / 2) - 4, wy - (1 - fx) * (hh / 2) - 4, 8, 9);
    }
  }
}

function bake(scene: Phaser.Scene, key: string, w: number, h: number, originY: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
  TEXTURE_ORIGIN[key] = { x: 0.5, y: originY };
}

/** Diamond ground tile. */
function tile(scene: Phaser.Scene, key: string, fill: number, edge: number, detail?: (g: Phaser.GameObjects.Graphics) => void) {
  bake(scene, key, TILE_W, TILE_H, 0.5, (g) => {
    g.fillStyle(fill);
    g.fillPoints(pts([TILE_W / 2, 0], [TILE_W, TILE_H / 2], [TILE_W / 2, TILE_H], [0, TILE_H / 2]), true);
    g.lineStyle(1, edge, 0.5);
    g.strokePoints(pts([TILE_W / 2, 0], [TILE_W, TILE_H / 2], [TILE_W / 2, TILE_H], [0, TILE_H / 2]), true);
    detail?.(g);
  });
}

/**
 * A building whose footprint is `w` wide and body `h` tall, plus optional roof
 * decoration drawn in the same local coordinate space.
 */
function building(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  faces: Faces,
  extras?: (g: Phaser.GameObjects.Graphics, x: number, y: number) => void,
  headroom = 0,
) {
  const hh = w / 2;
  const canvasH = hh + h + headroom;
  // Ground contact point sits a quarter of the tile width above the bottom edge.
  bake(scene, key, w, canvasH, 1 - w / 4 / canvasH, (g) => {
    block(g, 0, headroom, w, h, faces);
    extras?.(g, 0, headroom);
  });
}

export function createTextures(scene: Phaser.Scene): void {
  // ---- terrain ------------------------------------------------------------
  tile(scene, 't-grass', 0x7ec850, 0x6cb544, (g) => {
    g.fillStyle(0x8fd861, 0.7);
    g.fillEllipse(22, 16, 10, 5);
    g.fillEllipse(42, 20, 8, 4);
  });
  tile(scene, 't-grass2', 0x76c04a, 0x6cb544);
  tile(scene, 't-road', 0x9aa3ad, 0x8a929b, (g) => {
    g.fillStyle(0xe8edf2, 0.85);
    g.fillEllipse(TILE_W / 2, TILE_H / 2, 12, 4);
  });
  tile(scene, 't-plaza', 0xe3d9c0, 0xcdc2a6, (g) => {
    g.lineStyle(1, 0xcdc2a6, 0.8);
    g.lineBetween(TILE_W / 2, 0, TILE_W / 2, TILE_H);
  });
  tile(scene, 't-water', 0x4aa3d8, 0x3d8dbd, (g) => {
    g.lineStyle(2, 0x87ccef, 0.8);
    g.lineBetween(14, 16, 26, 22);
    g.lineBetween(36, 12, 50, 18);
  });

  // ---- decorative props ---------------------------------------------------
  building(scene, 'p-house-a', 56, 34, { top: 0xf2b4a0, left: 0xc9dbe8, right: 0xe6f0f7 }, (g, x, y) => {
    windows(g, x, y, 56, 34, 1);
  });
  building(scene, 'p-house-b', 56, 46, { top: 0x8fc7f0, left: 0xdcd2c2, right: 0xf3ecdf }, (g, x, y) => {
    windows(g, x, y, 56, 46, 2);
  });
  bake(scene, 'p-tree', 44, 62, 0.88, (g) => {
    g.fillStyle(0x8a5a3b);
    g.fillRect(20, 38, 6, 20);
    g.fillStyle(0x3f9e4d);
    g.fillCircle(22, 28, 15);
    g.fillStyle(0x4fba5c);
    g.fillCircle(17, 22, 11);
    g.fillCircle(28, 24, 9);
  });

  // ---- landmarks ----------------------------------------------------------
  building(
    scene,
    'b-factory',
    104,
    64,
    { top: 0xf0a13a, left: 0xb8642a, right: 0xe0813a },
    (g, x, y) => {
      windows(g, x, y, 104, 64, 2, 0xfff0c0);
      // chimneys on the roof
      g.fillStyle(0xd8d2c6);
      g.fillRect(x + 32, y - 26, 14, 34);
      g.fillRect(x + 56, y - 18, 12, 28);
      g.fillStyle(0xb63d3d);
      g.fillRect(x + 32, y - 26, 14, 6);
      g.fillRect(x + 56, y - 18, 12, 6);
    },
    30,
  );
  building(
    scene,
    'b-testlab',
    92,
    56,
    { top: 0x7fd4e8, left: 0x3f7fa6, right: 0x5fa8cc },
    (g, x, y) => {
      windows(g, x, y, 92, 56, 2, 0xd9fbff);
      g.fillStyle(0xbdf0fb, 0.95);
      g.fillCircle(x + 46, y + 18, 20);
      g.fillStyle(0x8fdcef);
      g.fillCircle(x + 46, y + 18, 12);
    },
    22,
  );
  building(
    scene,
    'b-reviewhall',
    92,
    52,
    { top: 0xf3ead3, left: 0xbfb49a, right: 0xdfd5bd },
    (g, x, y) => {
      // portico columns across the front faces
      g.fillStyle(0xfffaf0);
      for (let i = 0; i < 4; i++) {
        g.fillRect(x + 12 + i * 10, y + 30 + i * 5, 7, 26);
        g.fillRect(x + 50 + i * 10, y + 45 - i * 5, 7, 26);
      }
      g.fillStyle(0xa6c8e8);
      g.fillPoints(pts([x + 46, y - 18], [x + 92, y + 5], [x + 46, y + 28], [x, y + 5]), true);
    },
    20,
  );
  building(
    scene,
    'b-port',
    96,
    40,
    { top: 0xb9c2cc, left: 0x6d7a86, right: 0x94a1ad },
    (g, x, y) => {
      // crane
      g.fillStyle(0xe4573d);
      g.fillRect(x + 40, y - 34, 8, 46);
      g.fillRect(x + 40, y - 34, 40, 7);
      g.lineStyle(2, 0x3d454d);
      g.lineBetween(x + 76, y - 27, x + 76, y - 6);
      // containers
      g.fillStyle(0x3fa66b);
      g.fillRect(x + 12, y + 18, 24, 16);
      g.fillStyle(0x3f7fa6);
      g.fillRect(x + 58, y + 26, 24, 16);
    },
    38,
  );
  // City Center: plaza block with a fountain on top.
  building(
    scene,
    'b-citycenter',
    80,
    30,
    { top: 0xf7efdd, left: 0xc3b79c, right: 0xe2d7bd },
    (g, x, y) => {
      g.fillStyle(0x4aa3d8);
      g.fillEllipse(x + 40, y + 18, 46, 23);
      g.fillStyle(0xdfe9ef);
      g.fillRect(x + 37, y + 2, 6, 16);
    },
    10,
  );

  // ---- ambient + effects --------------------------------------------------
  bake(scene, 'a-car', 34, 26, 0.8, (g) => {
    block(g, 2, 4, 30, 8, { top: 0xef5f5f, left: 0xa83b3b, right: 0xd14f4f });
    g.fillStyle(0x2e3440, 0.8);
    g.fillRect(10, 6, 12, 6);
  });
  bake(scene, 'a-worker', 20, 34, 0.9, (g) => {
    g.fillStyle(0x3b6ea8);
    g.fillRect(6, 16, 9, 14);
    g.fillStyle(0xf2c9a0);
    g.fillCircle(10, 12, 6);
    g.fillStyle(0xffc23d);
    g.fillEllipse(10, 7, 16, 9);
  });
  bake(scene, 'fx-gear', 40, 40, 0.5, (g) => {
    g.fillStyle(0xffd166);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillRect(20 + Math.cos(a) * 15 - 4, 20 + Math.sin(a) * 15 - 4, 8, 8);
    }
    g.fillCircle(20, 20, 14);
    g.fillStyle(0x8a6a1f);
    g.fillCircle(20, 20, 5);
  });
  bake(scene, 'fx-spark', 12, 12, 0.5, (g) => {
    g.fillStyle(0xffffff);
    g.fillCircle(6, 6, 5);
  });
  bake(scene, 'fx-smoke', 22, 22, 0.5, (g) => {
    g.fillStyle(0x5a5a5a, 0.55);
    g.fillCircle(11, 11, 10);
    g.fillStyle(0x7d7d7d, 0.7);
    g.fillCircle(9, 9, 6);
  });
  bake(scene, 'fx-check', 46, 46, 0.5, (g) => {
    g.fillStyle(0x2fbf6d);
    g.fillCircle(23, 23, 22);
    g.lineStyle(6, 0xffffff);
    g.beginPath();
    g.moveTo(12, 24);
    g.lineTo(20, 32);
    g.lineTo(34, 14);
    g.strokePath();
  });
  bake(scene, 'fx-alert', 46, 46, 0.5, (g) => {
    g.fillStyle(0xe4573d);
    g.fillTriangle(23, 2, 45, 42, 1, 42);
    g.fillStyle(0xffffff);
    g.fillRect(20, 14, 6, 16);
    g.fillRect(20, 33, 6, 6);
  });
  bake(scene, 'fx-cloud', 120, 56, 0.5, (g) => {
    g.fillStyle(0xffffff, 0.75);
    g.fillCircle(40, 32, 22);
    g.fillCircle(68, 28, 26);
    g.fillCircle(94, 34, 18);
    g.fillRect(30, 32, 70, 20);
  });
  bake(scene, 'fx-ring', 8, 8, 0.5, (g) => {
    g.fillStyle(0xffffff);
    g.fillRect(0, 0, 8, 8);
  });
}
