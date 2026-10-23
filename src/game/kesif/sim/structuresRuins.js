/*
 * KEŞİF sim — Harabe (yıkık salon + sandık), Hazine (X işaretli gömülü sandık), Gizli Mağara (tünel + cevherli oda + sandık).
 */
import { SEA_LEVEL } from './constants.js';
import { B } from './blocks.js';
import { heightAt } from './worldgen.js';
import {
  NullW, buildBeacon, hf, paletteFor,
} from './structuresKit.js';
import {
  beaconEntry, boxOf, chestEntry, fitPlatform, makePlan, signEntry,
} from './structuresPlan.js';
import { circleShape, platform, terraform } from './structuresTerrain.js';
import { localRect } from './structuresTempleBuild.js';
import { FACINGS, localToWorld } from './puzzles/kitGeometry.js';

const LORE = [
  'Burası bir zamanlar bir kervan durağıydı. Taşlar hâlâ geçmişi fısıldıyor.',
  'Eski bir yazıt: "Kristalleri toplayan, mühürleri açar."',
  'Yıkık duvarların arasında bir şeyler parlıyor. Tahtayı kırmadan sandığa yaklaş.',
  'Not: Gece olunca yaratıklar çoğalır. Meşalen yanında olsun.',
  'Bir gezgin yazmış: "Yüksek kulelere çık, harita seni sever."',
];

/* ------------------------------------------------------------------------------------------------
 * Harabe
 * ---------------------------------------------------------------------------------------------- */
const HX = 11;
const HZ = 8;

export const HARABE = {
  key: 'harabe',
  name: 'Harabe',
  plan(env) {
    const site = env.site({
      hx: HX, hz: HZ, maxVar: 11, jx: 28, jz: 28, tries: 40, nx: 4, nz: 4,
      rect: (x, z) => platform(x, z, { x0: x - HX - 2, z0: z - HX - 2, x1: x + HX + 2, z1: z + HX + 2 }, 5, { len: 18 }).rect,
    });
    if (!site) return null;
    env.biome = env.biomeAt(site.x, site.z);
    const pal = paletteFor(env.zone, env.biome);
    const floorY = Math.max(SEA_LEVEL + 2, Math.round(site.stats.median));
    const f = env.rng.int(0, 3);
    const O = { x: site.x, y: floorY + 1, z: site.z };
    const L0 = NullW.local(O, f);
    const chests = [];
    const a = L0.toWorld(0, 1, HZ - 1);
    chests.push(chestEntry(env, a.x, a.y, a.z, { kind: 'sandık', index: 0 }));
    const b = L0.toWorld(-HX + 2, 0, -HZ + 3);
    chests.push(chestEntry(env, b.x, b.y, b.z, { kind: 'sandık', index: 1 }));
    const sg = L0.toWorld(-3, 0, -HZ - 1);
    const entH = L0.toWorld(0, 0, -HZ + 1);
    const tl = localRect(L0, -HX, -HZ, HX, HZ);
    const { plat, margin } = fitPlatform(env, site, { x0: tl.x0, z0: tl.z0, x1: tl.x1, z1: tl.z1 }, 5, { len: 18 });
    const rect = plat.rect;
    const tier = Math.max(1, Math.min(5, env.difficulty));
    const lore = LORE[Math.floor(env.rng.next() * LORE.length)];
    const pub = {
      name: env.name,
      x: site.x,
      y: floorY + 1,
      z: site.z,
      bounds: boxOf(tl.x0, floorY - 2, tl.z0, tl.x1, floorY + 28, tl.z1),
      chests,
      entrance: { x: entH.x, y: entH.y, z: entH.z },
      signs: [signEntry(sg.x, sg.y, sg.z, 'Harabe: ' + lore)],
      beacon: beaconEntry(site.x, site.z, floorY + 9, floorY + 30, tier),
      tags: ['harabe', 'sandık'],
    };
    const build = (W) => {
      if (!W.has(rect.x0, rect.z0, rect.x1, rect.z1)) return;
      const L = W.local(O, f);
      terraform(W, plat.shape, floorY, margin);
      drawRuin(L, pal, env, chests);
      W.set(sg.x, sg.y, sg.z, B.SIGN);
      buildBeacon(W, site.x, site.z, floorY + 9, floorY + 30, tier);
    };
    return makePlan(env, Object.assign({}, pub, { rect, build }));
  },
};

function drawRuin(L, p, env, chests) {
  const snow = p.path === B.SNOW;
  const mossy = env.zone === 1 || env.biome === 'bataklik' || env.biome === 'orman';
  const wx = (lx, lz) => L.wx(lx, lz);
  const wz = (lx, lz) => L.wz(lx, lz);
  const r = (lx, ly, lz, s) => hf(wx(lx, lz), ly, wz(lx, lz), s);
  /* zemin */
  L.paint(-HX, -1, -HZ, HX, -1, HZ, (lx, ly, lz) => {
    const k = r(lx, 0, lz, 7);
    if (k < 0.16) return p.wallAlt;
    if (k < 0.24) return mossy ? p.moss : B.GRAVEL;
    if (k < 0.27) return B.COBBLE;
    return ((lx + lz) & 1) === 0 ? p.floor : p.floorAlt;
  });
  L.fill(-HX, -3, -HZ, HX, -2, HZ, p.base);
  /* çevre duvarı (yıkık) */
  for (let lz = -HZ; lz <= HZ; lz++) {
    for (let lx = -HX; lx <= HX; lx++) {
      if (Math.abs(lx) !== HX && Math.abs(lz) !== HZ) continue;
      if (lz === -HZ && Math.abs(lx) <= 2) continue; // kapı boşluğu
      if (lx === -HX && lz >= -1 && lz <= 2) continue; // yan gedik
      const corner = Math.abs(lx) >= HX - 2 && Math.abs(lz) >= HZ - 2;
      let h = 5 - Math.floor(r(lx, 1, lz, 11) * 6) + (corner ? 2 : 0);
      if (h < 0) h = 0;
      if (h > 7) h = 7;
      for (let ly = 0; ly < h; ly++) {
        const q = r(lx, ly, lz, 12 + ly);
        L.set(lx, ly, lz, q < 0.2 ? p.wallAlt : (q < 0.3 && mossy ? p.moss : p.wall));
      }
      if (snow && h > 0 && r(lx, h, lz, 31) < 0.8) L.set(lx, h, lz, B.SNOW);
      if (mossy && h > 2 && r(lx, 8, lz, 33) < 0.4) L.fill(lx, Math.max(0, h - 3), lz + (lz === -HZ ? 1 : (lz === HZ ? -1 : 0)), lx, h - 1, lz + (lz === -HZ ? 1 : (lz === HZ ? -1 : 0)), B.VINE);
    }
  }
  /* sütunlar (kırık) */
  for (const lx of [-6, 6]) {
    for (const lz of [-4, 0, 4]) {
      const h = 2 + Math.floor(r(lx, 2, lz, 21) * 5);
      L.fill(lx, 0, lz, lx, h - 1, lz, p.pillar);
      if (h >= 6) L.set(lx, h, lz, p.trim);
    }
  }
  /* devrik sütunlar */
  for (let k = 0; k < 3; k++) {
    const lx = -8 + k * 7 + Math.floor(r(k, 3, 0, 22) * 3);
    const lz = -2 + Math.floor(r(k, 4, 1, 23) * 6) - 2;
    const along = r(k, 5, 2, 24) < 0.5;
    for (let i = 0; i < 4; i++) L.setAir(along ? lx + i : lx, 0, along ? lz : lz + i, p.pillar);
  }
  /* kapı kemeri */
  L.fill(-3, 0, -HZ, -3, 6, -HZ, p.pillar);
  L.fill(3, 0, -HZ, 3, 4 + Math.floor(r(3, 0, -HZ, 25) * 3), -HZ, p.pillar);
  L.fill(-3, 7, -HZ, -1, 7, -HZ, p.trim);
  L.set(-3, 8, -HZ, p.lamp);
  /* kürsü (arka orta) + sandık + kitaplıklar */
  L.fill(-2, 0, HZ - 3, 2, 0, HZ - 1, p.trim);
  L.fill(-1, 0, HZ - 2, 1, 0, HZ - 1, p.floor);
  L.set(0, 1, HZ - 1, 0);
  L.set(-2, 1, HZ - 1, B.BOOKSHELF);
  L.set(2, 1, HZ - 1, B.BOOKSHELF);
  L.set(-2, 2, HZ - 1, B.BOOKSHELF);
  L.set(-2, 1, HZ - 3, p.lamp);
  L.set(2, 1, HZ - 3, p.lamp);
  for (let i = 0; i < chests.length; i++) L.W.set(chests[i].x, chests[i].y, chests[i].z, chests[i].block);
  L.set(-HX + 2, -1, -HZ + 3, p.glow);
  /* ışıklı kemer sütunu: uzaktan görünür siluet */
  L.fill(0, 0, 0, 0, 8, 0, p.pillar);
  L.set(0, 9, 0, p.glow);
  /* kum/kar yığınları */
  if (p.path === B.SAND || p.path === B.SNOW) {
    for (let k = 0; k < 12; k++) {
      const lx = Math.floor(r(k, 6, 0, 41) * 21) - 10;
      const lz = Math.floor(r(k, 7, 1, 42) * 15) - 7;
      if (Math.abs(lx) <= 2 && lz <= -5) continue; // giriş açık kalsın
      L.setAir(lx, 0, lz, p.path);
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Hazine
 * ---------------------------------------------------------------------------------------------- */
export const HAZINE = {
  key: 'hazine',
  name: 'Gömülü Hazine',
  plan(env) {
    const reach = 12;
    const site = env.site({
      hx: 4, hz: 4, maxVar: 6, dry: true, jx: 28, jz: 28, tries: 40, nx: 3,
      rect: (x, z) => ({ x0: x - reach, z0: z - reach, x1: x + reach, z1: z + reach }),
    });
    if (!site) return null;
    env.biome = env.biomeAt(site.x, site.z);
    const pal = paletteFor(env.zone, env.biome);
    const floorY = Math.max(SEA_LEVEL + 2, Math.round(site.stats.median));
    if (floorY < 16) return null;
    const f = env.rng.int(0, 3);
    const O = { x: site.x, y: floorY + 1, z: site.z };
    const L0 = NullW.local(O, f);
    const chests = [];
    const c0 = L0.toWorld(0, -5, 0);
    chests.push(chestEntry(env, c0.x, c0.y, c0.z, { kind: 'hazine', block: 'ödül', index: 0 }));
    const c1 = L0.toWorld(1, -5, 1);
    chests.push(chestEntry(env, c1.x, c1.y, c1.z, { kind: 'hazine', index: 1 }));
    const sg = L0.toWorld(4, 0, -2);
    const entZ = L0.toWorld(2, 0, 2);
    const pole = L0.toWorld(5, 0, 5);
    const rect = { x0: site.x - reach, z0: site.z - reach, x1: site.x + reach, z1: site.z + reach };
    const pub = {
      name: env.name,
      x: site.x,
      y: floorY + 1,
      z: site.z,
      bounds: boxOf(site.x - 7, floorY - 8, site.z - 7, site.x + 7, floorY + 22, site.z + 7),
      chests,
      entrance: { x: entZ.x, y: entZ.y, z: entZ.z },
      buried: true,
      signs: [signEntry(sg.x, sg.y, sg.z, 'Kırmızı X işaretinin altında bir şey saklı. Kürek işine yarar, ama dikkatli kaz!')],
      beacon: beaconEntry(pole.x, pole.z, floorY + 9, floorY + 22, 1),
      tags: ['hazine', 'gömülü'],
    };
    const build = (W) => {
      if (!W.has(rect.x0, rect.z0, rect.x1, rect.z1)) return;
      const L = W.local(O, f);
      terraform(W, circleShape(site.x, site.z, 5), floorY, 4);
      drawTreasure(L, pal, chests);
      W.set(sg.x, sg.y, sg.z, B.SIGN);
      buildBeacon(W, pole.x, pole.z, floorY + 9, floorY + 22, 1);
    };
    return makePlan(env, Object.assign({}, pub, { rect, build }));
  },
};

function drawTreasure(L, p, chests) {
  // kırmızı X (zemin seviyesinde)
  for (let k = -3; k <= 3; k++) {
    L.set(k, -1, k, B.CLOTH_RED);
    L.set(k, -1, -k, B.CLOTH_RED);
  }
  L.set(0, -1, 0, B.CLOTH_YELLOW);
  // gömülü oda (3x3x2) — üstte kürekle kazılabilir toprak
  L.fill(-2, -7, -2, 2, -3, 2, p.wall);
  L.fill(-1, -5, -1, 1, -4, 1, 0);
  L.fill(-1, -6, -1, 1, -6, 1, p.trim);
  L.fill(0, -3, 0, 0, -2, 0, B.DIRT);
  L.fill(-1, -3, -1, 1, -3, 1, B.DIRT);
  L.set(0, -2, 0, B.DIRT);
  L.set(-1, -5, -1, p.torch);
  L.set(1, -5, -1, p.torch);
  L.set(-1, -5, 1, p.torch);
  for (let i = 0; i < chests.length; i++) L.W.set(chests[i].x, chests[i].y, chests[i].z, chests[i].block);
  // kazıklar ve bayrak
  for (const [lx, lz] of [[4, 4], [-4, 4], [4, -4], [-4, -4]]) {
    L.fill(lx, 0, lz, lx, 1, lz, p.fence);
    L.set(lx, 2, lz, p.torch);
  }
  L.fill(5, 0, 5, 5, 7, 5, p.fence);
  L.fill(5, 6, 6, 5, 7, 7, B.CLOTH_RED);
  L.set(5, 8, 5, p.lamp);
}

/* ------------------------------------------------------------------------------------------------
 * Gizli Mağara
 * ---------------------------------------------------------------------------------------------- */
const ORES = [
  [B.COAL_ORE, B.COPPER_ORE, B.COAL_ORE],
  [B.COPPER_ORE, B.IRON_ORE, B.COAL_ORE],
  [B.IRON_ORE, B.GOLD_ORE, B.REDSTONE_ORE],
  [B.GOLD_ORE, B.DIAMOND_ORE, B.EMERALD_ORE],
  [B.DIAMOND_ORE, B.QUANTUM_ORE, B.EMERALD_ORE],
];

export const GIZLI = {
  key: 'gizlimagara',
  name: 'Gizli Mağara',
  plan(env) {
    const depth = 13;
    const CH = { x: 6, z0: depth, z1: depth + 11 };
    const reach = 22;
    const site = env.site({
      hx: 4, hz: 4, maxVar: 9, dry: true, jx: 28, jz: 28, tries: 40, nx: 3,
      rect: (x, z) => ({ x0: x - reach, z0: z - reach, x1: x + reach, z1: z + reach }),
    });
    if (!site) return null;
    const floorY = Math.max(SEA_LEVEL + 2, Math.round(site.stats.median));
    if (floorY - depth - 6 < 8) return null;
    // yön: tünel boyunca arazi yüksekliği korunmalı
    let f = -1;
    let bestMin = -1;
    for (let k = 0; k < 4; k++) {
      const ff = (k + env.rng.int(0, 3)) & 3;
      let mn = 999;
      let wet = false;
      for (let i = 0; i <= CH.z1 + 2; i += 3) {
        for (const lx of [-CH.x, 0, CH.x]) {
          const w = localToWorld({ x: site.x, y: 0, z: site.z }, ff, lx, 0, i);
          const h = heightAt(env.seed, w.x, w.z);
          if (h < mn) mn = h;
          if (h < SEA_LEVEL + 1) wet = true;
        }
      }
      if (!wet && mn >= floorY - 3 && mn > bestMin) {
        bestMin = mn;
        f = ff;
      }
    }
    if (f < 0) return null;
    // etki dikdörtgeni
    const L0 = NullW.local({ x: site.x, y: floorY + 1, z: site.z }, f);
    const tl = localRect(L0, -CH.x - 3, -6, CH.x + 3, CH.z1 + 3);
    const rect = {
      x0: Math.min(tl.x0, site.x - 8) - 4, z0: Math.min(tl.z0, site.z - 8) - 4, x1: Math.max(tl.x1, site.x + 8) + 4, z1: Math.max(tl.z1, site.z + 8) + 4,
    };
    if (!env.rectOk(rect)) return null;
    env.biome = env.biomeAt(site.x, site.z);
    const pal = paletteFor(env.zone, env.biome);
    const O = { x: site.x, y: floorY + 1, z: site.z };
    const chests = [];
    const c0 = L0.toWorld(0, -depth + 1, CH.z1 - 1);
    chests.push(chestEntry(env, c0.x, c0.y, c0.z, { kind: 'gizli', block: 'ödül', index: 0 }));
    const c1 = L0.toWorld(-3, -depth + 1, CH.z1 - 1);
    chests.push(chestEntry(env, c1.x, c1.y, c1.z, { kind: 'gizli', index: 1 }));
    const sg = L0.toWorld(-3, 0, -3);
    const mouth = L0.toWorld(0, 0, -1);
    const pub = {
      name: env.name,
      x: site.x,
      y: floorY + 1,
      z: site.z,
      bounds: boxOf(tl.x0, floorY - depth - 3, tl.z0, tl.x1, floorY + 20, tl.z1),
      chests,
      entrance: { x: mouth.x, y: floorY + 1, z: mouth.z },
      signs: [signEntry(sg.x, sg.y, sg.z, 'Gizli Mağara: Taş yığınının arkasından aşağı inen bir tünel var. Meşale al, derinlerde cevher ve sandık seni bekliyor.')],
      beacon: beaconEntry(site.x, site.z, floorY + 8, floorY + 20, Math.min(5, env.difficulty)),
      tags: ['mağara', 'cevher', 'sandık'],
    };
    const build = (W) => {
      if (!W.has(rect.x0, rect.z0, rect.x1, rect.z1)) return;
      const L = W.local(O, f);
      terraform(W, circleShape(site.x, site.z, 4), floorY, 3);
      drawCave(L, pal, env, depth, CH, chests);
      W.set(sg.x, sg.y, sg.z, B.SIGN);
      buildBeacon(W, site.x, site.z, floorY + 8, floorY + 20, Math.min(5, env.difficulty));
    };
    return makePlan(env, Object.assign({}, pub, { rect, build }));
  },
};

function drawCave(L, p, env, depth, CH, chests) {
  const wx = (lx, lz) => L.wx(lx, lz);
  const wz = (lx, lz) => L.wz(lx, lz);
  const rr = (lx, ly, lz, s) => hf(wx(lx, lz), ly, wz(lx, lz), s);
  const ores = ORES[Math.min(4, env.zone)];
  /* ağız: taş kemer + yığın */
  L.fill(-2, 0, 0, -2, 4, 0, p.pillar);
  L.fill(2, 0, 0, 2, 4, 0, p.pillar);
  L.fill(-2, 5, 0, 2, 5, 0, p.trim);
  L.set(0, 6, 0, p.glow);
  L.set(-3, 2, 0, p.torch);
  L.set(3, 2, 0, p.torch);
  for (let k = 0; k < 9; k++) {
    const lx = Math.round(4 * Math.sin(k * 0.7)) + (k < 4 ? -3 : 3);
    const lz = -2 - (k % 3);
    L.fill(lx, 0, lz, lx, k % 3, lz, k % 2 === 0 ? B.COBBLE : p.wall);
  }
  L.set(-3, 3, -2, B.AMETHYST);
  L.set(3, 2, -3, B.AMETHYST);
  /* tünel: kabuk + oyuk */
  for (let i = 0; i <= depth; i++) {
    const y = -i;
    // kabuk: yan duvarlar, taban basamak, tavan
    L.fill(-2, y - 1, i, 2, y - 1, i, ((i & 1) === 0 ? p.floor : p.floorAlt));
    L.fill(-2, y, i, -2, y + 4, i, p.wall);
    L.fill(2, y, i, 2, y + 4, i, p.wall);
    L.fill(-1, y, i, 1, y + 3, i, 0);
    if (i >= 3) L.fill(-1, y + 4, i, 1, y + 4, i, p.wall);
    if (i % 4 === 1) {
      L.set(-1, y + 1, i, p.torch);
      L.set(1, y + 1, i, p.torch);
    }
    if (i % 5 === 3) {
      L.fill(-1, y + 3, i, 1, y + 3, i, p.trim);
    }
  }
  /* oda */
  const z0 = CH.z0;
  const z1 = CH.z1;
  const h = 6;
  const y0 = -depth;
  L.paint(-CH.x - 2, y0 - 2, z0 - 1, CH.x + 2, y0 + h + 1, z1 + 2, (lx, ly, lz) => {
    const inside = Math.abs(lx) <= CH.x && lz >= z0 && lz <= z1;
    if (ly === y0 - 1) return inside ? ((lx + lz) & 1 ? p.floorAlt : p.floor) : -1;
    if (ly < y0 - 1) return p.base;
    if (ly <= y0 + h && inside) {
      // taş sütunlar
      if ((Math.abs(lx) === 3 && (lz === z0 + 3 || lz === z0 + 7)) && ly < y0 + h) return p.pillar;
      return 0;
    }
    // kabuk: cevherli duvar
    const k = rr(lx, ly, lz, 51);
    if (k < 0.1) return ores[0];
    if (k < 0.16) return ores[1];
    if (k < 0.19) return ores[2];
    if (k < 0.24) return p.wallAlt;
    return p.wall;
  });
  // girişi tünele bağla (oda ön duvarı açık)
  L.fill(-1, y0, z0 - 1, 1, y0 + 3, z0, 0);
  /* kristaller + ışık */
  for (let k = 0; k < 14; k++) {
    const lx = Math.floor(rr(k, 1, 0, 61) * (2 * CH.x - 1)) - CH.x + 1;
    const lz = z0 + 1 + Math.floor(rr(k, 2, 1, 62) * (z1 - z0 - 1));
    if (Math.abs(lx) <= 1 && lz < z0 + 2) continue;
    L.setAir(lx, y0, lz, k % 3 === 0 ? B.CRYSTAL_ROCK : B.AMETHYST);
    if (k % 4 === 0) L.setAir(lx, y0 + 1, lz, B.AMETHYST);
  }
  for (const [lx, lz] of [[-CH.x, z0 + 2], [CH.x, z0 + 2], [-CH.x, z1 - 1], [CH.x, z1 - 1], [0, z0 + 1]]) L.set(lx, y0 + 1, lz, p.torch);
  /* kürsü + sandıklar */
  L.fill(-4, y0, z1 - 1, 1, y0, z1, p.trim);
  L.set(0, y0 - 1, z1 - 1, p.glow);
  for (let i = 0; i < chests.length; i++) L.W.set(chests[i].x, chests[i].y, chests[i].z, chests[i].block);
  // havadan yatan üst kristal küme (tavandan sarkan)
  for (let k = 0; k < 6; k++) {
    const lx = Math.floor(rr(k, 3, 2, 63) * (2 * CH.x - 2)) - CH.x + 1;
    const lz = z0 + 1 + Math.floor(rr(k, 4, 3, 64) * (z1 - z0 - 1));
    L.setAir(lx, y0 + h, lz, B.AMETHYST);
  }
}
