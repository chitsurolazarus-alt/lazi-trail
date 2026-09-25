import * as THREE from 'three';

/**
 * Hand-painted shop signs and billboards, drawn onto one canvas at start-up.
 * Every name here is fictional; no real brands are used.
 */

export interface SignStyle {
  text: string;
  bg: string;
  fg: string;
  accent: string;
}

export const SHOP_SIGNS: readonly SignStyle[] = [
  { text: "MAMA THANDI'S SPAZA", bg: '#e63946', fg: '#fff4d6', accent: '#ffd23f' },
  { text: 'FRESH VEG & FRUIT', bg: '#2a9d4a', fg: '#fffbe6', accent: '#ffd23f' },
  { text: 'KASI KITCHEN', bg: '#ffb703', fg: '#5a1a0a', accent: '#e63946' },
  { text: 'UBUNTU AIRTIME', bg: '#3a86ff', fg: '#ffffff', accent: '#ffbe0b' },
  { text: 'SIPHO CUTS', bg: '#111827', fg: '#ffd23f', accent: '#f4f4f4' },
  { text: 'JOZI HARDWARE', bg: '#f97316', fg: '#1b1b1b', accent: '#ffffff' },
  { text: 'BRAAI CORNER', bg: '#7f1d1d', fg: '#ffe8c2', accent: '#f97316' },
  { text: 'TOWNSHIP TYRES', bg: '#1f2937', fg: '#fde047', accent: '#ef4444' },
];

export const BILLBOARDS: readonly SignStyle[] = [
  { text: 'KARROO COLA', bg: '#c1121f', fg: '#ffffff', accent: '#ffd166' },
  { text: 'BAOBAB BANK', bg: '#0b2a5b', fg: '#ffffff', accent: '#ff7a1a' },
  { text: 'KUDU MOBILE', bg: '#06d6a0', fg: '#053b2e', accent: '#ffffff' },
  { text: 'PROTEA AIR', bg: '#f72585', fg: '#ffffff', accent: '#ffd6ec' },
  { text: 'MZANSI FRESH MILK', bg: '#4cc9f0', fg: '#0b2a5b', accent: '#ffffff' },
  { text: 'RUN THE STADIUM', bg: '#ff7a1a', fg: '#0b2a5b', accent: '#ffffff' },
];

/** Atlas layout: shop signs on the top half (2 cols × 4 rows), billboards below (2 × 3). */
const SIZE = 1024;
const HEIGHT = 1280;
const SHOP_COLS = 2;
const SHOP_ROWS = 4;
const BB_COLS = 2;
const BB_ROWS = 3;

/** [u0, v0, u1, v1] in 0..1 texture space (v up). */
export type UvRect = readonly [number, number, number, number];

export class SignAtlas {
  readonly texture: THREE.CanvasTexture;
  private readonly shop: UvRect[] = [];
  private readonly billboard: UvRect[] = [];
  private readonly graffiti: UvRect[] = [];

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#888';
      ctx.fillRect(0, 0, SIZE, HEIGHT);
      const half = SIZE / 2;
      const shopW = SIZE / SHOP_COLS;
      const shopH = half / SHOP_ROWS;
      SHOP_SIGNS.forEach((s, i) => {
        const cx = i % SHOP_COLS;
        const cy = Math.floor(i / SHOP_COLS);
        const x = cx * shopW;
        const y = cy * shopH;
        drawSign(ctx, s, x, y, shopW, shopH, 46);
        this.shop.push(rect(x, y, shopW, shopH));
      });
      const bbW = SIZE / BB_COLS;
      const bbH = 384 / BB_ROWS;
      BILLBOARDS.forEach((s, i) => {
        const cx = i % BB_COLS;
        const cy = Math.floor(i / BB_COLS);
        const x = cx * bbW;
        const y = half + cy * bbH;
        drawSign(ctx, s, x, y, bbW, bbH, 52);
        this.billboard.push(rect(x, y, bbW, bbH));
      });
      const gW = SIZE / 2;
      const gH = 192;
      GRAFFITI.forEach((g, i) => {
        const x = (i % 2) * gW;
        const y = 896 + Math.floor(i / 2) * gH;
        drawGraffiti(ctx, g, x, y, gW, gH);
        this.graffiti.push(rect(x, y, gW, gH));
      });
    }
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  shopRect(i: number): UvRect {
    return this.shop[i % this.shop.length] as UvRect;
  }

  billboardRect(i: number): UvRect {
    return this.billboard[i % this.billboard.length] as UvRect;
  }

  graffitiRect(i: number): UvRect {
    return this.graffiti[i % this.graffiti.length] as UvRect;
  }

  get graffitiCount(): number {
    return this.graffiti.length;
  }

  get shopCount(): number {
    return this.shop.length;
  }

  get billboardCount(): number {
    return this.billboard.length;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/** Canvas y is down, UV v is up: flip when converting. */
function rect(x: number, y: number, w: number, h: number): UvRect {
  return [x / SIZE, 1 - (y + h) / HEIGHT, (x + w) / SIZE, 1 - y / HEIGHT];
}

/** Original street-art panels (bubble lettering on a painted wall). */
const GRAFFITI: ReadonlyArray<{ text: string; wall: string; fill: string[]; outline: string }> = [
  { text: 'MZANSI', wall: '#5b6270', fill: ['#ff7a1a', '#ffd23f'], outline: '#0b2a5b' },
  { text: 'LAZI', wall: '#7a5c4a', fill: ['#3a86ff', '#7ae1ff'], outline: '#ffffff' },
  { text: 'JOZI', wall: '#3f5a52', fill: ['#ff4d8d', '#ffb3d1'], outline: '#1b1b1b' },
  { text: 'RUN!', wall: '#4a4a5e', fill: ['#7cff6b', '#f6ff7a'], outline: '#0b2a5b' },
];

function drawGraffiti(
  ctx: CanvasRenderingContext2D,
  g: { text: string; wall: string; fill: string[]; outline: string },
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = g.wall;
  ctx.fillRect(x, y, w, h);
  // paint drips and specks
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 40; i++) ctx.fillRect(x + ((i * 53) % w), y + ((i * 37) % h), 3, 3);
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, g.fill[0] as string);
  grad.addColorStop(1, g.fill[1] as string);
  ctx.font = `900 ${Math.round(h * 0.72)}px "Arial Black", "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = g.outline;
  ctx.strokeText(g.text, x + w / 2, y + h / 2 + 4);
  ctx.fillStyle = grad;
  ctx.fillText(g.text, x + w / 2, y + h / 2 + 4);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.strokeText(g.text, x + w / 2 - 2, y + h / 2 + 1);
  ctx.fillStyle = g.fill[0] as string;
  for (const [sx, sy, r] of [
    [0.1, 0.25, 8],
    [0.92, 0.7, 10],
    [0.06, 0.8, 6],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + w * sx, y + h * sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSign(
  ctx: CanvasRenderingContext2D,
  s: SignStyle,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
): void {
  ctx.fillStyle = s.bg;
  ctx.fillRect(x, y, w, h);
  // Painted border and a slightly uneven inner frame for the hand-painted look
  ctx.strokeStyle = s.accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
  ctx.strokeStyle = s.fg;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 15, y + 14, w - 30, h - 27);

  ctx.fillStyle = s.fg;
  ctx.font = `900 ${fontSize}px "Trebuchet MS", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Shrink to fit, in case the name is long
  let size = fontSize;
  while (ctx.measureText(s.text).width > w - 50 && size > 14) {
    size -= 2;
    ctx.font = `900 ${size}px "Trebuchet MS", "Arial Black", sans-serif`;
  }
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowOffsetY = 3;
  ctx.fillText(s.text, x + w / 2, y + h / 2 + 2);
  ctx.shadowColor = 'transparent';
}
