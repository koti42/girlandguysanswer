/*
 * KEŞİF sim — Kamp: kamp ateşi, çadırlar, sandıklar, yatak, tezgah + ocak, bayrak direği. Güvenli (yaratıksız) bölge.
 * Başlangıç kampı (çapa) doğuş noktasının yakınındadır ve ilerleme için gerekli temel eşyaları içerir.
 */
import { SEA_LEVEL } from './constants.js';
import { B } from './blocks.js';
import {
  NullW, buildBeacon, hf, paletteFor,
} from './structuresKit.js';
import {
  beaconEntry, boxOf, chestEntry, fitPlatform, makePlan, signEntry,
} from './structuresPlan.js';
import { platform, terraform } from './structuresTerrain.js';

const R = 11;
const MARGIN = 5;
const SAFE = 26;

const TIPS_STARTER = [
  'Kamp: güvenli bölge, burada yaratıklar doğmaz. İlk iş: ağaç kes, tezgah yap, ardından kazma!',
  'İpucu: Meşale yaratıkları uzak tutar. Mağaralara girerken yanında meşale taşı.',
];
const TIPS = [
  'Kamp: güvenli bölge. Sandıktan malzeme al, yatakta dinlen; yatak doğuş noktanı belirler.',
  'İpucu: Tezgah ve ocağı kampta kullan; demir alet için cevheri ocakta erit.',
  'İpucu: Kule ve yapıların ışık hüzmesi uzaktan görünür. Rengi zorluğu gösterir.',
];

/** A-çadır: yerel (lx0,lz0)'dan +lz boyunca 5 uzunluk; kesit 5 geniş. */
function tent(L, lx0, lz0, cloth, cloth2, openEnd) {
  const prof = [[-2, 0], [-2, 1], [-1, 2], [0, 3], [1, 2], [2, 1], [2, 0]];
  for (let lz = 0; lz < 5; lz++) {
    prof.forEach(([dx, ly]) => L.set(lx0 + dx, ly, lz0 + lz, ((lz & 1) === 0 ? cloth : cloth2)));
  }
  // kapalı uç
  const z = openEnd ? lz0 + 4 : lz0;
  [[-1, 0], [-1, 1], [0, 0], [0, 1], [0, 2], [1, 0], [1, 1]].forEach(([dx, ly]) => L.set(lx0 + dx, ly, z, cloth2));
  // iç zemin
  L.fill(lx0 - 1, -1, lz0, lx0 + 1, -1, lz0 + 4, B.CLOTH_WHITE);
}

export const KAMP = {
  key: 'kamp',
  name: 'Kamp',
  plan(env) {
    const reach = R + MARGIN + 3;
    const site = env.site({
      hx: 9, hz: 9, maxVar: 9, jx: 26, jz: 26, tries: 40, nx: 4,
      rect: (x, z) => platform(x, z, R, MARGIN, { len: 18 }).rect,
      circle: (x, z) => ({ x, z, r: reach }),
    });
    if (!site) return null;
    env.biome = env.biomeAt(site.x, site.z);
    const pal = paletteFor(env.zone, env.biome);
    const floorY = Math.max(SEA_LEVEL + 2, Math.round(site.stats.median));
    const cx = site.x;
    const cz = site.z;
    const f = env.rng.int(0, 3);
    const O = { x: cx, y: floorY + 1, z: cz };
    const L0 = NullW.local(O, f);
    const starter = !!(env.extra && env.extra.starter);
    const chests = [];
    const c1 = L0.toWorld(-5, 0, 4);
    chests.push(chestEntry(env, c1.x, c1.y, c1.z, { kind: 'kamp', index: 0 }));
    const c2 = L0.toWorld(6, 0, -4);
    chests.push(chestEntry(env, c2.x, c2.y, c2.z, { kind: 'kamp', index: 1 }));
    const bed = L0.toWorld(-6, 0, 3);
    const bench = L0.toWorld(6, 0, -2);
    const furnace = L0.toWorld(7, 0, -2);
    const tips = starter ? TIPS_STARTER : [TIPS[Math.floor(env.rng.next() * TIPS.length)]];
    const sgW = L0.toWorld(0, 0, 7);
    const ent = L0.toWorld(0, 0, -6);
    const tier = Math.max(1, Math.min(5, env.difficulty));
    const pole = L0.toWorld(-8, 0, -6);
    const { plat, margin } = fitPlatform(env, site, R, MARGIN, { len: 18 }, (m) => ({ x: cx, z: cz, r: R + m + 3 }));
    const rect = plat.rect;
    const pub = {
      name: starter ? 'Başlangıç Kampı' : env.name,
      x: cx,
      y: floorY + 1,
      z: cz,
      bounds: boxOf(cx - R, floorY - 2, cz - R, cx + R, floorY + 26, cz + R),
      chests,
      entrance: { x: ent.x, y: ent.y, z: ent.z },
      signs: [signEntry(sgW.x, sgW.y, sgW.z, tips.join(' '))],
      beds: [{ x: bed.x, y: bed.y, z: bed.z }],
      stations: [{ x: bench.x, y: bench.y, z: bench.z, kind: 'tezgah' }, { x: furnace.x, y: furnace.y, z: furnace.z, kind: 'ocak' }],
      safeRadius: SAFE,
      starter,
      beacon: beaconEntry(pole.x, pole.z, floorY + 12, floorY + 30, 2),
      tags: ['güvenli', 'kamp'],
    };
    const build = (W) => {
      if (!W.has(rect.x0, rect.z0, rect.x1, rect.z1)) return;
      const L = W.local(O, f);
      terraform(W, plat.shape, floorY, margin);
      drawCamp(L, pal, chests, tier);
      W.set(sgW.x, sgW.y, sgW.z, B.SIGN);
      buildBeacon(W, pole.x, pole.z, floorY + 12, floorY + 30, 2);
    };
    return makePlan(env, Object.assign({}, pub, { rect, build }));
  },
};

function drawCamp(L, p, chests, tier) {
  /* zemin: toprak yol halkası */
  L.paint(-R, -1, -R, R, -1, R, (lx, ly, lz) => {
    const d2 = lx * lx + lz * lz;
    if (d2 > R * R) return -1;
    if (d2 <= 20) return hf(L.wx(lx, lz), 0, L.wz(lx, lz), 3) < 0.4 ? p.path : B.GRAVEL;
    if (d2 <= 40 && hf(L.wx(lx, lz), 0, L.wz(lx, lz), 4) < 0.35) return p.path;
    return -1;
  });
  /* kamp ateşi */
  L.set(0, -1, 0, B.REDSTONE_ORE);
  L.set(0, 0, 0, p.torch);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      L.set(dx, 0, dz, B.COBBLE);
      L.set(dx, -1, dz, B.COBBLE);
    }
  }
  // kütük oturaklar
  for (const [lx, lz] of [[3, 0], [-3, 1], [0, 3], [1, -3]]) L.set(lx, 0, lz, p.log);
  /* çadırlar */
  tent(L, -6, 1, p.accent, p.accent2, false);
  tent(L, 4, 4, p.accent2, p.accent, true);
  // çadır içi
  L.set(-7, 0, 3, B.BED);
  L.W.set(chests[0].x, chests[0].y, chests[0].z, chests[0].block);
  L.set(-5, 1, 2, p.lamp);
  /* açık ocak/tezgah barınağı */
  for (const [lx, lz] of [[5, -3], [8, -3], [5, -1], [8, -1]]) L.fill(lx, 0, lz, lx, 2, lz, p.fence);
  L.fill(5, 3, -3, 8, 3, -1, p.accent);
  L.set(6, 0, -2, B.WORKBENCH);
  L.set(7, 0, -2, B.FURNACE);
  L.W.set(chests[1].x, chests[1].y, chests[1].z, chests[1].block);
  /* fener direkleri */
  for (const [lx, lz] of [[-8, 5], [8, 6], [-3, -8], [3, 9]]) {
    L.fill(lx, 0, lz, lx, 2, lz, p.fence);
    L.set(lx, 3, lz, p.lamp);
  }
  /* bayrak direği (siluet) */
  L.fill(-8, 0, -6, -8, 9, -6, p.fence);
  L.fill(-7, 7, -6, -5, 9, -6, p.accent);
  L.set(-6, 8, -6, p.accent2);
  L.set(-8, 10, -6, p.lamp);
  /* sandık yanı + tabela */
  /* küçük kaya/çiçek süsleri */
  for (let k = 0; k < 7; k++) {
    const lx = Math.round(9 * Math.sin(k * 0.9 + 0.4));
    const lz = Math.round(9 * Math.cos(k * 0.9 + 0.4));
    L.setAir(lx, 0, lz, k % 2 === 0 ? B.FLOWER_YELLOW : B.FLOWER_RED);
  }
  void tier;
}
