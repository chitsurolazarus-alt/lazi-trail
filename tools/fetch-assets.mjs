/**
 * Downloads and optimises every third-party asset used by Lazi Trail, then rewrites the asset
 * table in CREDITS.md. Only CC0 / CC-BY assets belong here.
 *
 *   node tools/fetch-assets.mjs            # fetch anything missing
 *   node tools/fetch-assets.mjs --force    # re-download everything
 *
 * Textures  -> Poly Haven (CC0), resized and converted to WebP (diffuse / normal / ARM packed map)
 * HDRIs     -> Poly Haven (CC0), 1k .hdr
 * Models    -> Quaternius via Poly Pizza (CC0), unused animations pruned, meshopt-compressed GLB
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'assets');
const FORCE = process.argv.includes('--force');

/** key -> [Poly Haven id, max texture size] */
const TEXTURES = {
  road: ['asphalt_02', 1024],
  pavement: ['concrete_pavers', 1024],
  brick: ['brick_wall_02', 1024],
  plaster: ['painted_plaster_wall', 1024],
  concrete: ['concrete_wall_007', 1024],
  corrugated: ['corrugated_iron', 1024],
  gravel: ['gravel_floor', 1024],
  rust: ['rusty_metal_02', 512],
  metal: ['metal_plate', 512],
  wood: ['wood_planks', 512],
  ground: ['dry_ground_rocks', 512],
  rock: ['rock_face', 512],
  boxmetal: ['box_profile_metal_sheet', 512],
};

/** zone -> Poly Haven HDRI id */
const HDRIS = {
  morning: 'kloofendal_43d_clear_puresky',
  midday: 'kloofendal_48d_partly_cloudy_puresky',
  golden: 'mpumalanga_veld_puresky',
  evening: 'kloppenheim_06_puresky',
};

/** key -> [Poly Pizza model id, GLB url, display name, animations to keep] */
const MODELS = {
  lazi: [
    'kZ3DmIoGip',
    '90a9e2d4-053f-42f1-99a2-8f5e1180ea7f',
    'Casual Character',
    [
      'Idle',
      'Idle_Neutral',
      'Run',
      'Walk',
      'Roll',
      'HitRecieve',
      'HitRecieve_2',
      'Death',
      'Wave',
      'Interact',
    ],
  ],
  thief: [
    'gKLBoRsyKe',
    'bcd66ec5-5e81-4901-a222-47abc875fe2a',
    'Hoodie Character',
    ['Idle_Neutral', 'Run', 'Walk', 'Interact', 'Wave', 'HitRecieve'],
  ],
  dog: [
    'y4wdQpg767',
    'ba6d0ee3-bcc0-4ef0-9d3c-a3e245b41c77',
    'Shiba Inu',
    ['Idle', 'Gallop', 'Gallop_Jump', 'Attack', 'Walk'],
  ],
  ped_worker: [
    'Yg2bQZO6Hj',
    '3a5f3056-ffe6-42eb-bd52-122afcbd22b2',
    'Worker',
    ['Walk', 'Idle_Neutral'],
  ],
  ped_business: [
    'JFrLIKqvCH',
    'e599abbe-7d73-488c-9d7e-3ead281e705c',
    'Business Man',
    ['Walk', 'Idle_Neutral'],
  ],
  ped_farmer: [
    '7pn3R6hPvE',
    '81f2f0cf-6f53-4b57-92ea-dba0928620f2',
    'Farmer',
    ['Walk', 'Idle_Neutral'],
  ],
};

const exists = (p) =>
  fs.access(p).then(
    () => true,
    () => false,
  );
const fetchBuf = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'lazi-trail-asset-fetch' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
};
const fetchJson = async (url) => JSON.parse((await fetchBuf(url)).toString());
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const credits = { textures: [], hdris: [], models: [] };

async function authorsOf(id) {
  const info = await fetchJson(`https://api.polyhaven.com/info/${id}`);
  return { name: info.name, authors: Object.keys(info.authors ?? {}).join(', ') };
}

async function doTextures() {
  await fs.mkdir(path.join(OUT, 'textures'), { recursive: true });
  for (const [key, [id, size]] of Object.entries(TEXTURES)) {
    const meta = await authorsOf(id);
    credits.textures.push({ key, id, ...meta });
    const files = await fetchJson(`https://api.polyhaven.com/files/${id}`);
    const jobs = [
      ['diff', files.Diffuse['1k'].jpg.url, 80],
      ['nor', files.nor_gl['1k'].jpg.url, 88],
      ['arm', files.arm['1k'].jpg.url, 80],
    ];
    for (const [suffix, url, quality] of jobs) {
      const out = path.join(OUT, 'textures', `${key}_${suffix}.webp`);
      if (!FORCE && (await exists(out))) continue;
      const buf = await fetchBuf(url);
      const info = await sharp(buf)
        .resize(size, size, { fit: 'inside' })
        .webp({ quality })
        .toFile(out);
      console.log(`texture ${key}_${suffix}.webp  ${kb(info.size)}`);
    }
  }
}

async function doHdris() {
  await fs.mkdir(path.join(OUT, 'hdri'), { recursive: true });
  for (const [key, id] of Object.entries(HDRIS)) {
    const meta = await authorsOf(id);
    credits.hdris.push({ key, id, ...meta });
    const out = path.join(OUT, 'hdri', `${key}_1k.hdr`);
    if (!FORCE && (await exists(out))) continue;
    const files = await fetchJson(`https://api.polyhaven.com/files/${id}`);
    const buf = await fetchBuf(files.hdri['1k'].hdr.url);
    await fs.writeFile(out, buf);
    console.log(`hdri ${key}_1k.hdr  ${kb(buf.length)}`);
  }
}

async function doModels() {
  await fs.mkdir(path.join(OUT, 'models'), { recursive: true });
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  for (const [key, [pizzaId, uuid, name, keep]] of Object.entries(MODELS)) {
    credits.models.push({ key, name, pizzaId });
    const out = path.join(OUT, 'models', `${key}.glb`);
    if (!FORCE && (await exists(out))) continue;
    const doc = await io.readBinary(
      new Uint8Array(await fetchBuf(`https://static.poly.pizza/${uuid}.glb`)),
    );
    const root = doc.getRoot();
    const wanted = new Set(keep);
    const seen = new Set();
    for (const anim of root.listAnimations()) {
      // Clips are named "Run" or "CharacterArmature|Run" (animals ship both). Normalise to the
      // bare name, keep only the wanted ones, and drop duplicates.
      const base = anim.getName().split('|').pop();
      if (!wanted.has(base) || seen.has(base)) anim.dispose();
      else {
        seen.add(base);
        anim.setName(base);
      }
    }
    await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const bin = await io.writeBinary(doc);
    await fs.writeFile(out, bin);
    console.log(`model ${key}.glb  ${kb(bin.length)}  (${root.listAnimations().length} anims)`);
  }
}

const MARK_START = '<!-- ASSETS:START -->';
const MARK_END = '<!-- ASSETS:END -->';

async function writeCredits() {
  const rows = [];
  rows.push('| Asset | Author | Source | Licence |', '| ----- | ------ | ------ | ------- |');
  for (const t of credits.textures) {
    rows.push(
      `| PBR texture "${t.name}" (${t.key}) | ${t.authors} | [Poly Haven](https://polyhaven.com/a/${t.id}) | CC0 1.0 |`,
    );
  }
  for (const h of credits.hdris) {
    rows.push(
      `| HDRI "${h.name}" (${h.key} sky) | ${h.authors} | [Poly Haven](https://polyhaven.com/a/${h.id}) | CC0 1.0 |`,
    );
  }
  for (const m of credits.models) {
    rows.push(
      `| 3D model "${m.name}" (${m.key}) | Quaternius | [Poly Pizza](https://poly.pizza/m/${m.pizzaId}) | CC0 1.0 |`,
    );
  }
  const file = path.join(ROOT, 'CREDITS.md');
  const current = await fs.readFile(file, 'utf8');
  const block = `${MARK_START}\n${rows.join('\n')}\n${MARK_END}`;
  const next = current.includes(MARK_START)
    ? current.replace(new RegExp(`${MARK_START}[\\s\\S]*${MARK_END}`), block)
    : `${current.trimEnd()}\n\n${block}\n`;
  await fs.writeFile(file, next);
}

await doTextures();
await doHdris();
await doModels();
await writeCredits();
console.log('done');
