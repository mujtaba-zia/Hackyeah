import Phaser from 'phaser';
import { TILE_H, TILE_W } from './iso';

/**
 * All art is generated at runtime as flat-shaded isometric forms so the city
 * stays self-contained and its objects keep a consistent ground anchor.
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

/** Window dots give large facades readable scale without separate assets. */
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
      g.fillRect(x + fx * (w / 2) - 4, wy - fx * (hh / 2) + hh / 2 - 4, 8, 9);
      g.fillRect(cx + fx * (w / 2) - 4, wy - (1 - fx) * (hh / 2) - 4, 8, 9);
    }
  }
}

function bake(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  originY: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
) {
  TEXTURE_ORIGIN[key] = { x: 0.5, y: originY };
  if (scene.textures.exists(key)) return;

  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
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

/** A building whose ground contact remains centred despite roof details. */
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
  bake(scene, key, w, canvasH, 1 - w / 4 / canvasH, (g) => {
    block(g, 0, headroom, w, h, faces);
    extras?.(g, 0, headroom);
  });
}

type PrFace = 'happy' | 'calm' | 'watching' | 'pacing' | 'annoyed' | 'angry';

/** Matching canvases and anchors keep a pull request in place as its mood changes. */
function prCharacter(scene: Phaser.Scene, key: string, body: number, face: PrFace) {
  bake(scene, key, 22, 34, 0.9, (g) => {
    g.fillStyle(0x35414c);
    g.fillRect(6, 27, 3, 5);
    g.fillRect(13, 27, 3, 5);
    g.fillStyle(body);
    g.fillRect(5, 15, 12, 13);
    g.fillRect(3, 18, 2, 7);
    g.fillRect(17, 18, 2, 7);
    g.fillStyle(0xf2c9a0);
    g.fillCircle(11, 9, 6);
    g.fillStyle(0x5a4038);
    g.fillRect(6, 3, 10, 3);
    g.fillStyle(0x273747);
    g.fillCircle(9, 9, 1);
    g.fillCircle(13, 9, 1);
    g.lineStyle(1, 0x70483d);

    switch (face) {
      case 'happy':
        g.beginPath();
        g.arc(11, 11, 3, 0, Math.PI);
        g.strokePath();
        break;
      case 'calm':
        g.lineBetween(9, 13, 13, 13);
        break;
      case 'watching':
        g.fillStyle(0x70483d);
        g.fillCircle(11, 13, 1);
        break;
      case 'pacing':
        g.lineBetween(10, 13, 12, 13);
        g.fillStyle(0xd89072);
        g.fillCircle(6, 13, 1);
        break;
      case 'annoyed':
        g.beginPath();
        g.arc(11, 14, 3, Math.PI, Math.PI * 2);
        g.strokePath();
        break;
      case 'angry':
        g.lineBetween(7, 7, 10, 8);
        g.lineBetween(15, 7, 12, 8);
        g.beginPath();
        g.arc(11, 14, 3, Math.PI, Math.PI * 2);
        g.strokePath();
        break;
    }
  });
}

export function createTextures(scene: Phaser.Scene): void {
  // ---- terrain ------------------------------------------------------------
  tile(scene, 't-grass', 0x7ec850, 0x6cb544, (g) => {
    g.fillStyle(0x8fd861, 0.7);
    g.fillEllipse(22, 16, 10, 5);
    g.fillEllipse(42, 20, 8, 4);
  });
  tile(scene, 't-grass2', 0x76c04a, 0x6cb544, (g) => {
    g.fillStyle(0x96d968, 0.45);
    g.fillEllipse(18, 18, 12, 4);
  });
  tile(scene, 't-road', 0x89929c, 0x707983, (g) => {
    g.fillStyle(0xe8edf2, 0.85);
    g.fillEllipse(TILE_W / 2, TILE_H / 2, 12, 4);
  });
  tile(scene, 't-sidewalk', 0xd8d3c8, 0xbeb8ac, (g) => {
    g.lineStyle(1, 0xbeb8ac, 0.7);
    g.lineBetween(14, 16, 50, 16);
  });
  tile(scene, 't-plaza', 0xe3d9c0, 0xcdc2a6, (g) => {
    g.lineStyle(1, 0xcdc2a6, 0.8);
    g.lineBetween(TILE_W / 2, 0, TILE_W / 2, TILE_H);
    g.lineBetween(0, TILE_H / 2, TILE_W, TILE_H / 2);
  });
  tile(scene, 't-water', 0x4aa3d8, 0x3d8dbd, (g) => {
    g.lineStyle(2, 0x87ccef, 0.8);
    g.lineBetween(14, 16, 26, 22);
    g.lineBetween(36, 12, 50, 18);
  });
  tile(scene, 't-dock', 0xb7895c, 0x8e6848, (g) => {
    g.lineStyle(2, 0x7a563b, 0.75);
    g.lineBetween(12, 12, 52, 20);
    g.lineBetween(12, 20, 52, 28);
  });
  tile(scene, 't-asphalt', 0x68727c, 0x565f68, (g) => {
    g.fillStyle(0x9aa3ad, 0.5);
    g.fillEllipse(26, 16, 6, 3);
    g.fillEllipse(42, 20, 5, 2);
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
    'b-security',
    98,
    62,
    { top: 0x284d82, left: 0x162d5c, right: 0x1f4072 },
    (g, x, y) => {
      windows(g, x, y, 98, 62, 2, 0x8edfff);
      // A cyan scanner arch marks the secure entry at the front facade.
      g.fillStyle(0x58e3ff);
      g.fillRect(x + 30, y + 31, 5, 22);
      g.fillRect(x + 63, y + 31, 5, 22);
      g.fillEllipse(x + 49, y + 31, 43, 18);
      g.fillStyle(0x284d82);
      g.fillEllipse(x + 49, y + 34, 31, 10);
      // The roof shield lets the building read clearly at city scale.
      g.fillStyle(0xaeefff);
      g.fillPoints(
        pts([x + 49, y + 8], [x + 61, y + 15], [x + 57, y + 31], [x + 49, y + 38], [x + 41, y + 31], [x + 37, y + 15]),
        true,
      );
      g.fillStyle(0x2f77b5);
      g.fillPoints(pts([x + 49, y + 14], [x + 55, y + 18], [x + 52, y + 28], [x + 49, y + 31], [x + 46, y + 28], [x + 43, y + 18]), true);
    },
    24,
  );
  building(
    scene,
    'b-packaging',
    122,
    42,
    { top: 0xd9c3a2, left: 0x8c735d, right: 0xb69b7d },
    (g, x, y) => {
      windows(g, x, y, 122, 42, 1, 0xffe4a3);
      // Conveyor and dark loading bay make the long low station legible.
      g.fillStyle(0x3c4752);
      g.fillRect(x + 12, y + 42, 75, 7);
      g.fillStyle(0xffc23d);
      for (let i = 0; i < 4; i++) g.fillCircle(x + 20 + i * 18, y + 45, 4);
      g.fillStyle(0x26313d);
      g.fillRect(x + 91, y + 44, 22, 20);
      g.fillStyle(0xf0b25c);
      g.fillRect(x + 95, y + 46, 14, 4);
    },
    18,
  );
  building(
    scene,
    'b-port',
    96,
    40,
    { top: 0xb9c2cc, left: 0x6d7a86, right: 0x94a1ad },
    (g, x, y) => {
      g.fillStyle(0xe4573d);
      g.fillRect(x + 40, y - 34, 8, 46);
      g.fillRect(x + 40, y - 34, 40, 7);
      g.lineStyle(2, 0x3d454d);
      g.lineBetween(x + 76, y - 27, x + 76, y - 6);
      g.fillStyle(0x3fa66b);
      g.fillRect(x + 12, y + 18, 24, 16);
      g.fillStyle(0x3f7fa6);
      g.fillRect(x + 58, y + 26, 24, 16);
    },
    38,
  );
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
  building(
    scene,
    'b-frontend',
    96,
    60,
    { top: 0xa47bd8, left: 0x63448d, right: 0x8060b1 },
    (g, x, y) => {
      windows(g, x, y, 96, 60, 2, 0xf1ddff);
      g.fillStyle(0xdcc8ff);
      g.fillRect(x + 44, y - 20, 8, 24);
      g.fillStyle(0x64e6ff);
      g.fillCircle(x + 48, y - 22, 5);
      g.fillStyle(0x7450a0);
      g.fillRect(x + 21, y + 30, 12, 18);
      g.fillRect(x + 63, y + 30, 12, 18);
    },
    28,
  );
  building(
    scene,
    'b-data',
    102,
    54,
    { top: 0xf0c85b, left: 0xa67829, right: 0xd4aa43 },
    (g, x, y) => {
      windows(g, x, y, 102, 54, 1, 0xfff0b3);
      g.fillStyle(0xd8d1bc);
      g.fillRect(x + 17, y - 18, 18, 39);
      g.fillRect(x + 65, y - 14, 18, 35);
      g.fillEllipse(x + 26, y - 18, 18, 10);
      g.fillEllipse(x + 74, y - 14, 18, 10);
      g.fillStyle(0x9d8250);
      g.fillRect(x + 24, y + 5, 4, 18);
      g.fillRect(x + 72, y + 9, 4, 16);
    },
    26,
  );
  building(
    scene,
    'b-infra',
    94,
    54,
    { top: 0x8dc978, left: 0x4b7b4e, right: 0x6eaa67 },
    (g, x, y) => {
      windows(g, x, y, 94, 54, 1, 0xe3ffd5);
      g.fillStyle(0x4d6c50);
      g.fillRect(x + 17, y + 18, 8, 38);
      g.fillRect(x + 67, y + 22, 8, 34);
      g.fillRect(x + 21, y + 24, 50, 7);
      g.fillStyle(0x9de89a);
      g.fillCircle(x + 71, y + 22, 5);
      g.fillStyle(0x35563e);
      g.fillRect(x + 41, y - 12, 11, 25);
      g.fillStyle(0x73d67d);
      g.fillRect(x + 41, y - 12, 11, 5);
    },
    18,
  );
  building(
    scene,
    'b-reviewhall',
    104,
    58,
    { top: 0xf7efdd, left: 0xc0b293, right: 0xe1d4b6 },
    (g, x, y) => {
      g.fillStyle(0xfffbef);
      g.fillPoints(pts([x + 52, y - 27], [x + 85, y + 5], [x + 19, y + 5]), true);
      g.fillStyle(0xd4b66e);
      g.fillRect(x + 20, y + 5, 64, 4);
      g.fillStyle(0xfff8e8);
      g.fillRect(x + 24, y + 50, 8, 42);
      g.fillRect(x + 42, y + 50, 8, 42);
      g.fillRect(x + 60, y + 50, 8, 42);
      g.fillRect(x + 78, y + 50, 8, 42);
      g.fillStyle(0xc7b693);
      g.fillRect(x + 21, y + 48, 14, 4);
      g.fillRect(x + 39, y + 48, 14, 4);
      g.fillRect(x + 57, y + 48, 14, 4);
      g.fillRect(x + 75, y + 48, 14, 4);
      g.fillStyle(0x546276);
      g.fillRect(x + 48, y + 73, 12, 19);
      g.fillStyle(0xe5d8bd);
      g.fillRect(x + 29, y + 91, 46, 6);
      g.fillRect(x + 35, y + 97, 34, 5);
    },
    32,
  );
  building(
    scene,
    'b-mergegate',
    76,
    40,
    { top: 0xaeb8b8, left: 0x657174, right: 0x8c999a },
    (g, x, y) => {
      g.fillStyle(0x58666a);
      g.fillRect(x + 11, y + 35, 10, 37);
      g.fillRect(x + 55, y + 35, 10, 37);
      g.fillEllipse(x + 38, y + 37, 56, 26);
      g.fillStyle(0x2e4241);
      g.fillEllipse(x + 38, y + 41, 38, 15);
      g.fillStyle(0x75ee8c);
      g.fillCircle(x + 38, y + 28, 7);
      g.fillStyle(0xe1fff0);
      g.fillCircle(x + 38, y + 28, 3);
      g.fillStyle(0xc2ccd0);
      g.fillRect(x + 19, y + 69, 38, 5);
    },
    30,
  );

  // ---- decorative structures ---------------------------------------------
  building(scene, 'p-house-a', 56, 34, { top: 0xf2b4a0, left: 0xc9dbe8, right: 0xe6f0f7 }, (g, x, y) => {
    windows(g, x, y, 56, 34, 1);
  });
  building(scene, 'p-house-b', 56, 46, { top: 0x8fc7f0, left: 0xdcd2c2, right: 0xf3ecdf }, (g, x, y) => {
    windows(g, x, y, 56, 46, 2);
  });
  building(scene, 'p-apartment-a', 68, 72, { top: 0xd7a0ad, left: 0x9b6076, right: 0xbe7f91 }, (g, x, y) => {
    windows(g, x, y, 68, 72, 3);
  });
  building(scene, 'p-apartment-b', 72, 84, { top: 0xc9a96a, left: 0x806843, right: 0xa98c5b }, (g, x, y) => {
    windows(g, x, y, 72, 84, 4, 0xffe9a6);
  });
  building(scene, 'p-office-a', 76, 88, { top: 0xa8d8e6, left: 0x4d7b99, right: 0x6ca8c5 }, (g, x, y) => {
    windows(g, x, y, 76, 88, 4, 0xd7fbff);
  });
  building(scene, 'p-office-b', 82, 104, { top: 0xb5c5d9, left: 0x596b82, right: 0x7894ae }, (g, x, y) => {
    windows(g, x, y, 82, 104, 5, 0xe8f6ff);
    g.fillStyle(0x44566f);
    g.fillRect(x + 37, y - 14, 8, 18);
  }, 16);
  building(scene, 'p-shop', 54, 38, { top: 0xf2cc75, left: 0xa87342, right: 0xd99c55 }, (g, x, y) => {
    g.fillStyle(0xfff3cf);
    g.fillRect(x + 13, y + 31, 28, 8);
  });
  building(scene, 'p-cafe', 52, 36, { top: 0xe4775d, left: 0x9c4c40, right: 0xc96050 }, (g, x, y) => {
    g.fillStyle(0xffe5a6);
    g.fillRect(x + 14, y + 28, 25, 7);
    g.fillStyle(0x5d4037);
    g.fillRect(x + 24, y + 35, 5, 12);
  });
  building(scene, 'p-techoffice', 78, 94, { top: 0x75c8d8, left: 0x2e6d8e, right: 0x4b9fba }, (g, x, y) => {
    windows(g, x, y, 78, 94, 4, 0xbdf7ff);
    g.fillStyle(0x5df0d6);
    g.fillRect(x + 34, y - 12, 10, 16);
  }, 14);
  building(scene, 'p-warehouse', 82, 46, { top: 0xb0aca3, left: 0x6f716e, right: 0x92918b }, (g, x, y) => {
    g.fillStyle(0x39424c);
    g.fillRect(x + 29, y + 42, 25, 18);
    g.fillStyle(0xd8d2c6);
    g.fillRect(x + 34, y + 45, 15, 3);
  });
  building(scene, 'p-factory', 76, 52, { top: 0xd88a55, left: 0x984f37, right: 0xbd6844 }, (g, x, y) => {
    windows(g, x, y, 76, 52, 2, 0xffdf9f);
    g.fillStyle(0xddd3c6);
    g.fillRect(x + 45, y - 20, 10, 28);
    g.fillStyle(0xb63d3d);
    g.fillRect(x + 45, y - 20, 10, 5);
  }, 24);
  building(scene, 'p-server', 60, 70, { top: 0x566a91, left: 0x293954, right: 0x3c5278 }, (g, x, y) => {
    windows(g, x, y, 60, 70, 3, 0x65e8ff);
    g.fillStyle(0x65e8ff);
    g.fillRect(x + 27, y + 30, 6, 6);
    g.fillRect(x + 27, y + 48, 6, 6);
  });

  // ---- small props --------------------------------------------------------
  bake(scene, 'p-tree', 44, 62, 0.88, (g) => {
    g.fillStyle(0x8a5a3b);
    g.fillRect(20, 38, 6, 20);
    g.fillStyle(0x3f9e4d);
    g.fillCircle(22, 28, 15);
    g.fillStyle(0x4fba5c);
    g.fillCircle(17, 22, 11);
    g.fillCircle(28, 24, 9);
  });
  bake(scene, 'p-bench', 44, 28, 0.88, (g) => {
    g.fillStyle(0x71462b);
    g.fillRect(7, 14, 30, 6);
    g.fillRect(10, 20, 4, 6);
    g.fillRect(30, 20, 4, 6);
    g.fillStyle(0xb57943);
    g.fillRect(7, 9, 30, 4);
  });
  bake(scene, 'p-lamp', 20, 54, 0.92, (g) => {
    g.fillStyle(0x38404a);
    g.fillRect(8, 14, 4, 36);
    g.fillStyle(0xffe5a6);
    g.fillCircle(10, 11, 8);
    g.fillStyle(0x59636f);
    g.fillRect(5, 6, 10, 4);
  });
  bake(scene, 'p-container', 46, 40, 0.82, (g) => {
    block(g, 3, 5, 40, 14, { top: 0x4a8cc2, left: 0x27618e, right: 0x367baa });
    g.fillStyle(0xd9e8f5, 0.8);
    g.fillRect(13, 24, 17, 3);
  });
  bake(scene, 'p-crane', 76, 102, 0.86, (g) => {
    g.fillStyle(0xe8ad3d);
    g.fillRect(34, 30, 8, 62);
    g.fillRect(34, 30, 36, 7);
    g.fillStyle(0x35414c);
    g.fillRect(66, 37, 2, 34);
    g.fillRect(61, 68, 12, 4);
    g.fillStyle(0xbe7d2b);
    g.fillRect(27, 90, 22, 6);
  });
  bake(scene, 'p-fountain', 58, 42, 0.82, (g) => {
    g.fillStyle(0xb9c7cb);
    g.fillEllipse(29, 28, 52, 20);
    g.fillStyle(0x4aa3d8);
    g.fillEllipse(29, 26, 42, 14);
    g.fillStyle(0xe5f7ff);
    g.fillRect(26, 8, 6, 19);
    g.fillEllipse(29, 8, 20, 8);
  });

  // ---- vehicles -----------------------------------------------------------
  bake(scene, 'a-car', 38, 32, 0.82, (g) => {
    block(g, 2, 7, 34, 8, { top: 0xef5f5f, left: 0xa83b3b, right: 0xd14f4f });
    g.fillStyle(0x2e3440, 0.85);
    g.fillRect(21, 10, 8, 6);
  });
  bake(scene, 'a-car2', 38, 32, 0.82, (g) => {
    block(g, 2, 7, 34, 8, { top: 0x4db5b0, left: 0x287671, right: 0x35948e });
    g.fillStyle(0xd8fbff, 0.85);
    g.fillRect(21, 10, 8, 6);
  });
  bake(scene, 'a-van', 44, 36, 0.82, (g) => {
    block(g, 2, 7, 40, 13, { top: 0x88c85c, left: 0x4f8740, right: 0x69aa4b });
    g.fillStyle(0xd8f5ff, 0.85);
    g.fillRect(26, 11, 10, 7);
  });
  bake(scene, 'a-truck', 52, 40, 0.82, (g) => {
    block(g, 2, 11, 48, 12, { top: 0xd9a441, left: 0x9a6b2e, right: 0xc38835 });
    g.fillStyle(0x4d5b69);
    g.fillRect(7, 20, 19, 7);
    g.fillStyle(0xd8f5ff);
    g.fillRect(29, 14, 10, 7);
  });
  bake(scene, 'a-bus', 62, 42, 0.82, (g) => {
    block(g, 2, 10, 58, 14, { top: 0x8f6bc2, left: 0x5b418d, right: 0x7857aa });
    g.fillStyle(0xdff7ff);
    for (let i = 0; i < 4; i++) g.fillRect(17 + i * 9, 15, 6, 6);
    g.fillStyle(0x9deaff);
    g.fillRect(49, 14, 7, 8);
  });
  bake(scene, 'a-firetruck', 56, 42, 0.82, (g) => {
    block(g, 2, 10, 52, 13, { top: 0xe04f49, left: 0x9f302f, right: 0xc63d39 });
    g.fillStyle(0xf8f8f2);
    g.fillRect(8, 18, 22, 4);
    g.fillRect(35, 14, 11, 7);
    g.fillStyle(0xc9d5df);
    g.fillRect(18, 5, 28, 3);
  });
  bake(scene, 'a-pipeline-truck', 62, 46, 0.82, (g) => {
    block(g, 2, 13, 58, 13, { top: 0xffc23d, left: 0xb97118, right: 0xe89422 });
    g.fillStyle(0x273747);
    g.fillRect(7, 22, 30, 6);
    g.fillStyle(0xbdf7ff);
    g.fillRect(42, 16, 11, 7);
    // The bright artifact crate makes this truck distinct from ambient traffic.
    block(g, 19, 4, 22, 8, { top: 0x62e8d1, left: 0x218f8d, right: 0x3fbbb3 });
    g.fillStyle(0xffffff);
    g.fillRect(27, 11, 7, 3);
  });

  // ---- actors -------------------------------------------------------------
  bake(scene, 'a-worker', 20, 34, 0.9, (g) => {
    g.fillStyle(0x3b6ea8);
    g.fillRect(6, 16, 9, 14);
    g.fillStyle(0xf2c9a0);
    g.fillCircle(10, 12, 6);
    g.fillStyle(0xffc23d);
    g.fillEllipse(10, 7, 16, 9);
  });
  bake(scene, 'a-ped-a', 18, 32, 0.9, (g) => {
    g.fillStyle(0xf0c7a2);
    g.fillCircle(9, 9, 5);
    g.fillStyle(0x4d94d6);
    g.fillRect(5, 15, 8, 12);
    g.fillStyle(0x35414c);
    g.fillRect(5, 27, 3, 4);
    g.fillRect(10, 27, 3, 4);
  });
  bake(scene, 'a-ped-b', 18, 32, 0.9, (g) => {
    g.fillStyle(0x8f5b42);
    g.fillCircle(9, 9, 5);
    g.fillStyle(0xe4775d);
    g.fillRect(5, 15, 8, 12);
    g.fillStyle(0x35414c);
    g.fillRect(5, 27, 3, 4);
    g.fillRect(10, 27, 3, 4);
  });
  bake(scene, 'a-ped-c', 18, 32, 0.9, (g) => {
    g.fillStyle(0xd29b73);
    g.fillCircle(9, 9, 5);
    g.fillStyle(0x8f70c8);
    g.fillRect(5, 15, 8, 12);
    g.fillStyle(0x35414c);
    g.fillRect(5, 27, 3, 4);
    g.fillRect(10, 27, 3, 4);
  });

  // ---- pull request actors -----------------------------------------------
  prCharacter(scene, 'pr-happy', 0x55bd70, 'happy');
  prCharacter(scene, 'pr-calm', 0x5c9fb8, 'calm');
  prCharacter(scene, 'pr-watching', 0xe5b84f, 'watching');
  prCharacter(scene, 'pr-pacing', 0xe99546, 'pacing');
  prCharacter(scene, 'pr-annoyed', 0xdb704f, 'annoyed');
  prCharacter(scene, 'pr-angry', 0xc74d4d, 'angry');
  bake(scene, 'pr-badge', 24, 24, 0.5, (g) => {
    g.fillStyle(0x3d4a55);
    g.fillCircle(12, 12, 11);
    g.fillStyle(0xffffff);
    g.fillCircle(12, 12, 9);
    g.lineStyle(1, 0xd8e7ef);
    g.strokeCircle(12, 12, 9);
  });

  // ---- stage effects ------------------------------------------------------
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
  bake(scene, 'fx-shield', 46, 50, 0.5, (g) => {
    g.fillStyle(0x4c9cff, 0.95);
    g.fillPoints(pts([23, 3], [42, 11], [38, 34], [23, 46], [8, 34], [4, 11]), true);
    g.lineStyle(3, 0xd9fbff);
    g.beginPath();
    g.moveTo(14, 25);
    g.lineTo(21, 32);
    g.lineTo(33, 17);
    g.strokePath();
  });
  bake(scene, 'fx-scan', 52, 52, 0.5, (g) => {
    g.fillStyle(0x4ce7ff, 0.24);
    g.fillCircle(26, 26, 23);
    g.lineStyle(2, 0x75efff, 0.95);
    g.strokePoints(pts([26, 4], [48, 26], [26, 48], [4, 26]), true);
    g.lineBetween(8, 26, 44, 26);
    g.lineBetween(26, 8, 26, 44);
    g.fillStyle(0xffffff);
    g.fillCircle(26, 26, 3);
  });
  bake(scene, 'fx-crate', 32, 32, 0.82, (g) => {
    block(g, 2, 5, 28, 10, { top: 0x62e8d1, left: 0x218f8d, right: 0x3fbbb3 });
    g.fillStyle(0xffffff);
    g.fillRect(12, 17, 8, 3);
    g.fillStyle(0xffd166);
    g.fillRect(14, 8, 4, 10);
  });
  bake(scene, 'fx-confetti', 10, 10, 0.5, (g) => {
    g.fillStyle(0xffd166);
    g.fillRect(1, 1, 8, 8);
    g.fillStyle(0xffffff, 0.75);
    g.fillRect(2, 2, 3, 3);
  });

  createMilestone4Art(scene);
}

/**
 * Milestone 4 additions: reusable effect art, city event actors, extra worker
 * states and small environment detail. Kept in its own pass so the Milestone 1
 * to 3 art above stays untouched and easy to compare.
 */
function createMilestone4Art(scene: Phaser.Scene): void {
  // ---- road and ground detail ---------------------------------------------
  tile(scene, 't-roadline', 0x9aa3ad, 0x8a929b, (g) => {
    // Dashes run along the isometric road axis rather than the screen axis.
    g.fillStyle(0xe8edf2, 0.9);
    for (let i = -1; i <= 1; i++) {
      g.fillEllipse(TILE_W / 2 + i * 16, TILE_H / 2 + i * 8, 9, 4);
    }
  });
  tile(scene, 't-crosswalk', 0x9aa3ad, 0x8a929b, (g) => {
    g.fillStyle(0xf2f6fa, 0.92);
    for (let i = -2; i <= 2; i++) {
      g.fillEllipse(TILE_W / 2 + i * 11, TILE_H / 2 - i * 5, 7, 13);
    }
  });
  tile(scene, 't-parking', 0x8d949c, 0x7d848b, (g) => {
    g.lineStyle(2, 0xe8edf2, 0.7);
    g.lineBetween(14, 12, 34, 22);
    g.lineBetween(30, 6, 50, 16);
  });
  tile(scene, 't-garden', 0x6fbe4a, 0x5da33d, (g) => {
    g.fillStyle(0x8a5a3b, 0.65);
    g.fillEllipse(TILE_W / 2, TILE_H / 2, 34, 16);
    g.fillStyle(0xff6b8b);
    g.fillCircle(26, 15, 2.4);
    g.fillStyle(0xffe066);
    g.fillCircle(36, 18, 2.4);
    g.fillStyle(0xffffff);
    g.fillCircle(31, 12, 2.2);
  });

  // ---- effect art used by the Effects library ------------------------------
  bake(scene, 'fx-fire', 26, 34, 0.9, (g) => {
    g.fillStyle(0xff6b2c);
    g.fillEllipse(13, 22, 22, 24);
    g.fillStyle(0xffa62c);
    g.fillEllipse(13, 25, 14, 17);
    g.fillStyle(0xffe57a);
    g.fillEllipse(13, 28, 7, 9);
  });
  bake(scene, 'fx-dust', 26, 26, 0.5, (g) => {
    g.fillStyle(0xd9cfbb, 0.5);
    g.fillCircle(13, 13, 12);
    g.fillStyle(0xefe7d6, 0.6);
    g.fillCircle(10, 10, 7);
  });
  bake(scene, 'fx-debris', 14, 12, 0.5, (g) => {
    g.fillStyle(0x6c5a44);
    g.fillPoints(pts([0, 4], [7, 0], [14, 5], [9, 12], [2, 10]), true);
  });
  bake(scene, 'fx-beam', 64, 170, 0.02, (g) => {
    // Brightest at the top so it reads as light cast downward from the saucer.
    for (let i = 0; i < 17; i++) {
      const t = i / 16;
      g.fillStyle(0x9ff5c8, 0.42 * (1 - t) + 0.05);
      const halfWidth = 8 + t * 24;
      g.fillRect(32 - halfWidth, i * 10, halfWidth * 2, 11);
    }
  });
  bake(scene, 'fx-star', 20, 20, 0.5, (g) => {
    g.fillStyle(0xfff6c2);
    g.fillPoints(pts([10, 0], [13, 7], [20, 10], [13, 13], [10, 20], [7, 13], [0, 10], [7, 7]), true);
  });
  bake(scene, 'fx-drop', 6, 16, 0.5, (g) => {
    g.fillStyle(0xbfe4ff, 0.8);
    g.fillRect(2, 0, 2, 16);
  });

  // ---- city event actors ---------------------------------------------------
  bake(scene, 'ev-tornado', 96, 156, 0.96, (g) => {
    // Stacked ellipses from a wide top to a narrow foot read as a funnel.
    for (let i = 0; i < 13; i++) {
      const t = i / 12;
      g.fillStyle(0x8b93a3, 0.32 + t * 0.28);
      g.fillEllipse(48 + Math.sin(t * 5) * 9, 8 + t * 140, 78 - t * 62, 22 - t * 13);
    }
    g.fillStyle(0x5f6674, 0.5);
    g.fillEllipse(48, 148, 34, 12);
  });
  bake(scene, 'ev-ufo', 124, 66, 0.5, (g) => {
    g.fillStyle(0x9ff5c8, 0.35);
    g.fillEllipse(62, 44, 118, 26);
    g.fillStyle(0x8f9bb3);
    g.fillEllipse(62, 40, 112, 30);
    g.fillStyle(0xb9c6dd);
    g.fillEllipse(62, 34, 96, 22);
    g.fillStyle(0x7de8ff, 0.9);
    g.fillEllipse(62, 20, 46, 30);
    g.fillStyle(0xd8fbff, 0.8);
    g.fillEllipse(54, 16, 18, 12);
    g.fillStyle(0xffd166);
    for (let i = 0; i < 5; i++) g.fillCircle(24 + i * 19, 44, 5);
  });
  bake(scene, 'ev-bug', 38, 30, 0.85, (g) => {
    g.fillStyle(0x2f3b2a);
    g.fillEllipse(19, 17, 26, 18);
    g.fillStyle(0x6bbf4a);
    g.fillEllipse(19, 15, 22, 14);
    g.fillStyle(0x2f3b2a);
    for (const dx of [-9, 0, 9]) {
      g.fillRect(19 + dx - 1, 20, 2, 8);
      g.fillRect(19 + dx - 6, 24, 6, 2);
    }
    g.lineStyle(2, 0x2f3b2a);
    g.lineBetween(14, 8, 9, 1);
    g.lineBetween(24, 8, 29, 1);
    g.fillStyle(0xffffff);
    g.fillCircle(15, 12, 3);
    g.fillCircle(23, 12, 3);
    g.fillStyle(0x1b1b1b);
    g.fillCircle(15, 12, 1.5);
    g.fillCircle(23, 12, 1.5);
  });
  bake(scene, 'ev-meteor', 60, 44, 0.5, (g) => {
    g.fillStyle(0xff8a3d, 0.55);
    g.fillPoints(pts([2, 22], [30, 8], [30, 36]), true);
    g.fillStyle(0xffd166, 0.7);
    g.fillPoints(pts([12, 22], [32, 14], [32, 30]), true);
    g.fillStyle(0x5a4636);
    g.fillCircle(42, 22, 15);
    g.fillStyle(0x7a6350);
    g.fillCircle(38, 18, 6);
  });
  bake(scene, 'ev-crater', 120, 62, 0.5, (g) => {
    g.fillStyle(0x6b5a46, 0.9);
    g.fillEllipse(60, 31, 116, 56);
    g.fillStyle(0x4c3f31, 0.95);
    g.fillEllipse(60, 33, 88, 40);
    g.fillStyle(0x3a2f25);
    g.fillEllipse(60, 34, 54, 22);
  });
  bake(scene, 'ev-float', 74, 54, 0.86, (g) => {
    block(g, 4, 18, 66, 16, { top: 0xffd166, left: 0xd08a1f, right: 0xf3b23c });
    g.fillStyle(0x4ec3f7);
    g.fillRect(20, 8, 34, 14);
    g.fillStyle(0xffffff);
    g.fillRect(26, 12, 22, 5);
    g.fillStyle(0xef5f8c);
    g.fillCircle(18, 6, 6);
    g.fillStyle(0x7ce38b);
    g.fillCircle(32, 3, 6);
    g.fillStyle(0x8fd0ff);
    g.fillCircle(46, 6, 6);
  });
  bake(scene, 'ev-rainbow', 420, 210, 0.5, (g) => {
    const bands = [0xff6b6b, 0xffa62c, 0xffe066, 0x6bd47e, 0x5bb8ff, 0xa06bff];
    bands.forEach((color, i) => {
      g.lineStyle(14, color, 0.55);
      g.beginPath();
      g.arc(210, 205, 190 - i * 15, Math.PI, 0);
      g.strokePath();
    });
  });
  for (const [key, tint] of [
    ['ev-sign-a', 0xffffff],
    ['ev-sign-b', 0xffe9a8],
    ['ev-sign-c', 0xd8f0ff],
  ] as const) {
    bake(scene, key, 40, 54, 0.95, (g) => {
      g.fillStyle(0x8a5a3b);
      g.fillRect(18, 26, 4, 26);
      g.fillStyle(tint);
      g.fillRect(2, 2, 36, 26);
      g.lineStyle(2, 0x35506b, 0.9);
      g.strokeRect(2, 2, 36, 26);
      g.fillStyle(0x35506b, 0.75);
      g.fillRect(7, 8, 26, 3);
      g.fillRect(7, 14, 20, 3);
      g.fillRect(7, 20, 24, 3);
    });
  }
  bake(scene, 'ev-balloon', 60, 86, 0.9, (g) => {
    g.fillStyle(0xef5f8c);
    g.fillEllipse(30, 30, 52, 56);
    g.fillStyle(0xffd166);
    g.fillEllipse(30, 30, 18, 56);
    g.lineStyle(1, 0x8a5a3b);
    g.lineBetween(18, 54, 24, 70);
    g.lineBetween(42, 54, 36, 70);
    g.fillStyle(0x8a5a3b);
    g.fillRect(22, 68, 16, 12);
  });
  bake(scene, 'ev-firework', 24, 24, 0.5, (g) => {
    g.fillStyle(0xffffff);
    g.fillCircle(12, 12, 5);
    g.fillStyle(0xffe066, 0.9);
    g.fillCircle(12, 12, 9);
  });

  // ---- extra worker states -------------------------------------------------
  const worker = (
    key: string,
    shirt: number,
    draw: (g: Phaser.GameObjects.Graphics) => void,
  ) => {
    bake(scene, key, 26, 38, 0.9, (g) => {
      g.fillStyle(shirt);
      g.fillRect(8, 18, 10, 15);
      g.fillStyle(0xf2c9a0);
      g.fillCircle(13, 13, 6);
      draw(g);
    });
  };
  worker('a-worker-hammer', 0x3b6ea8, (g) => {
    g.fillStyle(0xffc23d);
    g.fillEllipse(13, 8, 16, 9);
    g.fillStyle(0x8a5a3b);
    g.fillRect(19, 10, 3, 12);
    g.fillStyle(0x6b7480);
    g.fillRect(17, 8, 8, 5);
  });
  worker('a-worker-cheer', 0x3fa66b, (g) => {
    g.fillStyle(0xf2c9a0);
    g.fillRect(3, 8, 4, 11);
    g.fillRect(19, 8, 4, 11);
    g.fillStyle(0x1b1b1b);
    g.fillCircle(11, 12, 1.4);
    g.fillCircle(15, 12, 1.4);
    g.lineStyle(1.6, 0x1b1b1b);
    g.beginPath();
    g.arc(13, 15, 3, 0, Math.PI);
    g.strokePath();
  });
  worker('a-worker-panic', 0xe4573d, (g) => {
    g.fillStyle(0xf2c9a0);
    g.fillRect(2, 6, 4, 10);
    g.fillRect(20, 6, 4, 10);
    g.fillStyle(0xffffff);
    g.fillCircle(11, 12, 2.4);
    g.fillCircle(16, 12, 2.4);
    g.fillStyle(0x1b1b1b);
    g.fillCircle(11, 12, 1.2);
    g.fillCircle(16, 12, 1.2);
    g.fillEllipse(13, 17, 5, 4);
  });
  worker('a-firefighter', 0xc9342a, (g) => {
    g.fillStyle(0xf5d547);
    g.fillEllipse(13, 7, 18, 10);
    g.fillStyle(0xf5d547);
    g.fillRect(8, 24, 10, 3);
    g.fillStyle(0x2f3b4a);
    g.fillRect(17, 20, 8, 3);
  });
  worker('a-repair', 0xf5a524, (g) => {
    g.fillStyle(0xfff08a);
    g.fillRect(8, 20, 10, 4);
    g.fillStyle(0xffc23d);
    g.fillEllipse(13, 8, 16, 9);
    g.fillStyle(0x6b7480);
    g.fillRect(18, 26, 9, 7);
  });

  // ---- environment detail --------------------------------------------------
  bake(scene, 'p-flowers', 30, 20, 0.8, (g) => {
    g.fillStyle(0x4fba5c);
    g.fillEllipse(15, 14, 22, 8);
    for (const [x, y, c] of [
      [8, 10, 0xff6b8b],
      [15, 7, 0xffe066],
      [22, 11, 0xa06bff],
      [12, 13, 0xffffff],
    ] as const) {
      g.fillStyle(c);
      g.fillCircle(x, y, 2.6);
    }
  });
  bake(scene, 'p-rock', 26, 18, 0.85, (g) => {
    g.fillStyle(0x9aa3ad);
    g.fillPoints(pts([2, 14], [8, 4], [18, 3], [24, 12], [14, 17]), true);
    g.fillStyle(0xb7c0c9);
    g.fillPoints(pts([8, 8], [16, 6], [18, 11], [10, 12]), true);
  });
  bake(scene, 'p-shrub', 30, 24, 0.86, (g) => {
    g.fillStyle(0x3f9e4d);
    g.fillCircle(11, 14, 9);
    g.fillCircle(20, 15, 8);
    g.fillStyle(0x4fba5c);
    g.fillCircle(14, 10, 7);
  });
  bake(scene, 'p-fence', 54, 26, 0.85, (g) => {
    g.fillStyle(0xe8e2d4);
    for (let i = 0; i < 4; i++) g.fillRect(4 + i * 14, 6, 4, 16);
    g.fillStyle(0xd6cfbe);
    g.fillRect(2, 10, 50, 3);
    g.fillRect(2, 17, 50, 3);
  });
  bake(scene, 'p-streetlight', 26, 62, 0.94, (g) => {
    g.fillStyle(0x6b7480);
    g.fillRect(11, 12, 4, 46);
    g.fillRect(11, 12, 12, 3);
    g.fillStyle(0xfff3b0);
    g.fillEllipse(21, 16, 10, 6);
  });
  bake(scene, 'p-trafficlight', 24, 58, 0.94, (g) => {
    g.fillStyle(0x4a545f);
    g.fillRect(10, 20, 4, 34);
    g.fillStyle(0x2f3b4a);
    g.fillRect(6, 4, 13, 22);
    g.fillStyle(0xe4573d);
    g.fillCircle(12, 9, 3);
    g.fillStyle(0xf5d547);
    g.fillCircle(12, 15, 3);
    g.fillStyle(0x3fd07a);
    g.fillCircle(12, 21, 3);
  });
  bake(scene, 'p-busstop', 54, 44, 0.88, (g) => {
    g.fillStyle(0x4a545f);
    g.fillRect(6, 12, 3, 28);
    g.fillRect(44, 12, 3, 28);
    g.fillStyle(0x8fd0ff, 0.7);
    g.fillRect(8, 14, 37, 22);
    g.fillStyle(0x35506b);
    g.fillRect(4, 8, 46, 6);
  });
  bake(scene, 'p-billboard', 78, 66, 0.92, (g) => {
    g.fillStyle(0x6b7480);
    g.fillRect(20, 34, 5, 30);
    g.fillRect(53, 34, 5, 30);
    g.fillStyle(0xffffff);
    g.fillRect(6, 4, 66, 34);
    g.fillStyle(0x3b6ea8);
    g.fillRect(10, 8, 58, 26);
    g.fillStyle(0xffd166);
    g.fillRect(16, 14, 26, 5);
    g.fillRect(16, 23, 40, 5);
  });
  bake(scene, 'p-watertower', 70, 104, 0.93, (g) => {
    g.fillStyle(0x6b7480);
    for (const dx of [12, 34, 52]) g.fillRect(dx, 48, 5, 52);
    g.fillStyle(0x8a939f);
    g.fillRect(10, 66, 50, 4);
    g.fillStyle(0xb7c0c9);
    g.fillEllipse(35, 40, 62, 30);
    g.fillStyle(0xd7dee4);
    g.fillEllipse(35, 30, 62, 30);
    g.fillStyle(0x3b6ea8);
    g.fillRect(22, 26, 26, 6);
  });
  bake(scene, 'p-cone', 18, 22, 0.9, (g) => {
    g.fillStyle(0xe4573d);
    g.fillTriangle(9, 2, 16, 18, 2, 18);
    g.fillStyle(0xffffff);
    g.fillRect(4, 11, 10, 3);
  });
  bake(scene, 'p-scaffold', 76, 92, 0.92, (g) => {
    g.lineStyle(3, 0xd7a13c);
    for (const dx of [8, 36, 64]) g.lineBetween(dx, 20, dx, 88);
    for (const dy of [30, 50, 70, 86]) g.lineBetween(8, dy, 64, dy);
    g.fillStyle(0xbfc8d2, 0.5);
    g.fillRect(10, 22, 54, 64);
  });
  bake(scene, 'p-garbage', 34, 26, 0.85, (g) => {
    g.fillStyle(0x4a545f);
    g.fillEllipse(17, 18, 30, 12);
    g.fillStyle(0x6b7480);
    g.fillRect(6, 8, 22, 12);
    g.fillStyle(0x8a939f);
    g.fillEllipse(17, 8, 24, 8);
  });
  bake(scene, 'p-foodtruck', 60, 40, 0.86, (g) => {
    block(g, 4, 10, 52, 16, { top: 0xffe066, left: 0xc99a1f, right: 0xf0c33c });
    g.fillStyle(0x2f3b4a);
    g.fillRect(14, 16, 18, 8);
    g.fillStyle(0xef5f8c);
    g.fillRect(6, 6, 48, 5);
  });
  building(scene, 'p-tower-a', 62, 96, { top: 0x9fd6ff, left: 0x35608c, right: 0x5a92c4 }, (g, x, y) => {
    windows(g, x, y, 62, 96, 4, 0xe8f6ff);
  }, 8);
  building(scene, 'p-tower-b', 58, 116, { top: 0xd8c7ff, left: 0x584a80, right: 0x8172b8 }, (g, x, y) => {
    windows(g, x, y, 58, 116, 5, 0xf3ecff);
  }, 8);
}
