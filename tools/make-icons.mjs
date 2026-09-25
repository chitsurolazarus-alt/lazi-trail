// Generates the favicon, PWA icons and the social-share image from code and one gameplay
// screenshot (tools/og-source.jpg). Run:  npm run icons
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
await fs.mkdir(path.join(PUBLIC, 'icons'), { recursive: true });

const ORANGE = '#ff7a1a';
const BLUE = '#0b2a5b';

/** The badge: a deep-blue tile, an orange disc, a blue "L" and speed lines. */
function badge({ rounded, scale }) {
  const bg = rounded
    ? `<rect width="512" height="512" rx="112" fill="${BLUE}"/>`
    : `<rect width="512" height="512" fill="${BLUE}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${bg}
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="272" cy="256" r="168" fill="${ORANGE}"/>
    <path d="M232 150h52v152h96v50H232z" fill="${BLUE}"/>
    <g stroke="#f6f3ea" stroke-width="14" stroke-linecap="round">
      <path d="M62 196h74"/><path d="M40 256h96"/><path d="M62 316h74"/>
    </g>
  </g>
</svg>`;
}

const svgFavicon = badge({ rounded: true, scale: 1 });
await fs.writeFile(path.join(PUBLIC, 'favicon.svg'), svgFavicon);

const png = async (svg, size, file) =>
  sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, file));

await png(svgFavicon, 512, 'icons/icon-512.png');
await png(svgFavicon, 192, 'icons/icon-192.png');
await png(svgFavicon, 32, 'favicon-32.png');
// iOS rounds the corners itself: give it a full-bleed tile.
await png(badge({ rounded: false, scale: 0.92 }), 180, 'apple-touch-icon.png');
// Maskable: content inside the central 80% "safe zone".
await png(badge({ rounded: false, scale: 0.72 }), 512, 'icons/icon-maskable-512.png');

/* ---- social share image, 1200 x 630 */
const W = 1200;
const H = 630;
const shot = await sharp(path.join(ROOT, 'tools', 'og-source.jpg'))
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .toBuffer();
const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${BLUE}" stop-opacity="0.96"/>
      <stop offset="0.55" stop-color="${BLUE}" stop-opacity="0.78"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0.05"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="0" y="0" width="14" height="${H}" fill="${ORANGE}"/>
  <text x="70" y="270" font-family="Trebuchet MS, Segoe UI, Arial, sans-serif" font-weight="900" font-size="132" fill="${ORANGE}">Lazi Trail</text>
  <text x="74" y="340" font-family="Trebuchet MS, Segoe UI, Arial, sans-serif" font-weight="700" font-size="40" fill="#f6f3ea">A 3D endless runner through</text>
  <text x="74" y="390" font-family="Trebuchet MS, Segoe UI, Arial, sans-serif" font-weight="700" font-size="40" fill="#f6f3ea">South African streets.</text>
  <text x="74" y="540" font-family="Trebuchet MS, Segoe UI, Arial, sans-serif" font-weight="700" font-size="28" fill="#f6f3ea" fill-opacity="0.85">Play free in your browser  ·  Built by Lazarus Chitsuro</text>
</svg>`;
await sharp(shot)
  .composite([{ input: Buffer.from(overlay) }])
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile(path.join(PUBLIC, 'og-image.jpg'));

console.log('icons and og-image written to public/');
