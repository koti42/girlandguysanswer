/*
 * KEŞİF sim — Bulmaca Türbesi: tek bulmaca odası (yüzeyde, kademeli piramit çatılı) + arkasında hazine odası.
 * Bulmacanın arka kapısı çözülünce açılır; kasada ödül sandıkları durur. Önünde sütunlu ön avlu.
 */
import { SEA_LEVEL } from './constants.js';
import { B } from './blocks.js';
import {
  buildChamber, buildPuzzleRoom, chainOrigin, chamberSize, clampDifficulty, getPuzzle, makeCtx,
  puzzleTypesForDifficulty, registeredPuzzleTypes,
} from './puzzles/index.js';
import {
  NullW, buildBeacon, corridor, paletteFor,
} from './structuresKit.js';
import {
  beaconEntry, boxOf, chestEntry, facingToward, fitPlatform, makePlan, signEntry,
} from './structuresPlan.js';
import { terraform } from './structuresTerrain.js';
import { localRect } from './structuresTempleBuild.js';

const VAULT = { w: 7, d: 7, h: 5 };
const ZONE_D = [[1, 2], [2, 2], [3, 3], [4, 4], [5, 5]];
const FORE = 14; // ön avlu uzunluğu

export const TURBE = {
  key: 'turbe',
  name: 'Bulmaca Türbesi',
  plan(env) {
    const types = registeredPuzzleTypes();
    if (types.length === 0) return null;
    const zd = ZONE_D[Math.min(4, env.zone)];
    const want = env.rng.int(zd[0], zd[1]);
    let pool = puzzleTypesForDifficulty(want);
    if (pool.length === 0) pool = types;
    const type = pool[Math.floor(env.rng.next() * pool.length)];
    const impl = getPuzzle(type);
    const difficulty = clampDifficulty(impl, want);
    const fp = impl.footprint(difficulty);
    const sz = chamberSize(fp.w, fp.d, fp.h);
    const hw = (Math.max(sz.w, VAULT.w) >> 1) + 5; // teras yarı genişlik
    const len = FORE + 2 + sz.d + 6 + VAULT.d + 4; // toplam teras uzunluğu
    const rr = Math.max(hw, len >> 1) + 12;
    const site = env.site({
      hx: Math.min(hw, 10), hz: Math.min(len / 2, 14), maxVar: 14, jx: 28, jz: 28, tries: 40, nx: 4, nz: 5,
      rect: (x, z) => ({ x0: x - rr, z0: z - rr, x1: x + rr, z1: z + rr }),
    });
    if (!site) return null;
    env.biome = env.biomeAt(site.x, site.z);
    const pal = paletteFor(env.zone, env.biome);
    const floorY = Math.max(SEA_LEVEL + 2, Math.round(site.stats.median));
    const f = facingToward(-site.x, -site.z);
    // çerçeve: kutu merkezi (site) → odanın origin'i (chamber 1) lz = -(len/2) + FORE + 2
    const base = NullW.local({ x: site.x, y: floorY + 1, z: site.z }, f);
    const o0 = base.toWorld(0, 0, -(len >> 1) + FORE + 2);
    const O = { x: o0.x, y: floorY + 1, z: o0.z };
    const L0 = NullW.local(O, f);
    const vaultO = chainOrigin(O, f, sz.d);
    const VL = NullW.local(vaultO, f);
    const puzzle = {
      id: env.id + '#1', type, origin: { x: O.x, y: O.y, z: O.z }, facing: f, difficulty, zone: env.zone, structureId: env.id,
    };
    const chests = [];
    [-2, 0, 2].forEach((lx, i) => {
      const w = VL.toWorld(lx, 0, VAULT.d - 2);
      chests.push(chestEntry(env, w.x, w.y, w.z, { kind: i === 1 ? 'ödül' : 'sandık', block: i === 1 ? 'ödül' : 'sandık', index: i }));
    });
    const tl = localRect(L0, -hw, -FORE - 2, hw, sz.d + 6 + VAULT.d + 4);
    const { plat, margin } = fitPlatform(env, { x: (tl.x0 + tl.x1) >> 1, z: (tl.z0 + tl.z1) >> 1, stats: site.stats }, { x0: tl.x0, z0: tl.z0, x1: tl.x1, z1: tl.z1 }, 7, { len: 18 });
    const rect = plat.rect;
    const ent = L0.toWorld(0, 0, -9);
    const sg = L0.toWorld(-3, 0, -6);
    const ridge = sz.h + 2 + Math.min((sz.w >> 1) + 2, (sz.d >> 1) + 2);
    const roofTop = floorY + 1 + ridge + 2;
    const tier = Math.max(1, Math.min(5, env.difficulty));
    const text = 'Bulmaca Türbesi: İçerideki bulmacayı çöz; arka kapı açılınca hazine odasındaki sandıklar senin. '
      + 'Çözemezsen kapıdan çıkıp yeniden dene, oda sıfırlanır.';
    const cm = L0.toWorld(0, 0, sz.d >> 1);
    const pub = {
      name: env.name,
      x: cm.x,
      y: floorY + 1,
      z: cm.z,
      bounds: boxOf(tl.x0, floorY - 3, tl.z0, tl.x1, roofTop + 40, tl.z1),
      puzzles: [puzzle],
      chests,
      signs: [signEntry(sg.x, sg.y, sg.z, text)],
      entrance: { x: ent.x, y: floorY + 1, z: ent.z },
      beacon: beaconEntry(cm.x, cm.z, roofTop + 2, Math.min(120, roofTop + 40), tier),
      tags: ['bulmaca', 'hazine'],
    };
    const build = (W) => {
      if (!W.has(rect.x0, rect.z0, rect.x1, rect.z1)) return;
      const L = W.local(O, f);
      terraform(W, plat.shape, floorY, margin);
      const bind = { setBlock: (x, y, z, id) => W.set(x, y, z, id), getBlock: (x, y, z) => W.get(x, y, z) };
      const clip = { x0: W.bx0, z0: W.bz0, x1: W.bx1, z1: W.bz1 };
      drawForecourt(L, pal, sz);
      corridor(L, { lx0: -1, lz0: sz.d + 2, lx1: 1, lz1: sz.d + 3 }, 3, pal, 5);
      buildPuzzleRoom(puzzle, Object.assign({ seed: env.seed, clip }, bind));
      const ctx = makeCtx(Object.assign({
        id: env.id + '#vault', worldSeed: env.seed, origin: vaultO, facing: f, zone: env.zone, difficulty: env.difficulty, clip,
      }, bind));
      buildChamber(ctx, { w: VAULT.w, d: VAULT.d, h: VAULT.h, doorFront: true, doorBack: false });
      drawVault(L, pal, sz, chests);
      drawRoof(L, pal, sz);
      W.set(sg.x, sg.y, sg.z, B.SIGN);
      const top = O.y + ridge + 2;
      buildBeacon(W, L.wx(0, sz.d >> 1), L.wz(0, sz.d >> 1), top + 1, Math.min(120, top + 39), tier);
    };
    return makePlan(env, Object.assign({}, pub, { rect, build }));
  },
};

function drawForecourt(L, p, sz) {
  const w2 = (sz.w >> 1) + 2;
  L.paint(-w2 - 3, -1, -FORE, w2 + 3, -1, -3, (lx, ly, lz) => {
    if (lz > -4 && Math.abs(lx) > w2) return -1;
    if (Math.abs(lx) <= 1 && lz % 3 === 0) return p.glow;
    return ((lx + lz) & 1) === 0 ? p.floor : p.floorAlt;
  });
  for (let lz = -12; lz <= -6; lz += 3) {
    for (const lx of [-4, 4]) {
      L.fill(lx, 0, lz, lx, 4, lz, p.pillar);
      L.set(lx, 5, lz, p.trim);
      L.set(lx, 6, lz, p.lamp);
    }
  }
  L.fill(-w2 - 1, 0, -3, -w2 - 1, 2, -3, p.pillar);
  L.fill(w2 + 1, 0, -3, w2 + 1, 2, -3, p.pillar);
  L.set(-w2 - 1, 3, -3, p.lamp);
  L.set(w2 + 1, 3, -3, p.lamp);
}

function drawVault(L, p, sz, chests) {
  const off = sz.d + 6;
  const x0 = -((VAULT.w - 1) >> 1);
  const x1 = x0 + VAULT.w - 1;
  for (let lx = x0 + 1; lx <= x1 - 1; lx += 2) {
    L.set(lx, 0, off + VAULT.d - 1, p.log);
    L.set(lx, 1, off + VAULT.d - 1, B.BOOKSHELF);
  }
  for (let lz = off + 1; lz < off + VAULT.d - 1; lz++) L.set(0, -1, lz, p.accent);
  for (let i = 0; i < chests.length; i++) L.W.set(chests[i].x, chests[i].y, chests[i].z, chests[i].block);
}

/** Kademeli piramit çatı (dikdörtgen kabuk üzerinde). */
function drawRoof(L, p, sz) {
  const h = sz.h;
  const x0 = -((sz.w - 1) >> 1) - 3;
  const x1 = x0 + sz.w + 5;
  let a = x0;
  let b = x1;
  let c = -3;
  let d = sz.d + 2;
  for (let k = 0; a < b - 1 && c < d - 1; k++) {
    const y = h + 2 + k;
    L.fill(a, y, c, b, y, d, (k & 1) === 0 ? p.roof : p.roofAlt);
    L.set(a, y, c, p.trim);
    L.set(b, y, c, p.trim);
    L.set(a, y, d, p.trim);
    L.set(b, y, d, p.trim);
    a++;
    b--;
    c++;
    d--;
  }
  const cx = Math.floor((a + b) / 2);
  const cz = sz.d >> 1;
  const top = h + 2 + Math.min((sz.w >> 1) + 2, (sz.d >> 1) + 2);
  L.fill(cx, top, cz, cx, top + 1, cz, p.glow);
  L.set(cx, top + 2, cz, p.lamp);
}
