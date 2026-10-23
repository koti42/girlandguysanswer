/*
 * KEŞİF sim — Gözcü Kulesi: yüksek taş kule, içinde sarmal merdiven (YUKARI), tepede korkuluklu güverte + harita masası.
 * Güverteye çıkan oyuncunun çevresindeki yapılar haritada belirir (lookout.revealRadius). Ayrıca uzaktan görünür ışık hüzmesi.
 *
 * Yerel çerçeve: origin = kule merkezi (ly=0 ayakta, ly=−1 zemin). Kapı −lz yönündedir (alt açı π).
 */
import { SEA_LEVEL } from './constants.js';
import { B } from './blocks.js';
import {
  NullW, buildBeacon, hf, paletteFor,
} from './structuresKit.js';
import {
  beaconEntry, boxOf, fitPlatform, makePlan, signEntry,
} from './structuresPlan.js';
import {
  TAU, angleAtU, buildHelix, buildRailing, helixTurns,
} from './structuresStairs.js';
import { platform, terraform } from './structuresTerrain.js';

const PLAZA = 7;
const MARGIN = 5;
const HEIGHT = [26, 30, 34, 38, 40];
const REVEAL = [96, 112, 128, 144, 160];

export const GOZCU = {
  key: 'gozcukulesi',
  name: 'Gözcü Kulesi',
  plan(env) {
    const reach = PLAZA + MARGIN + 3;
    const site = env.site({
      hx: 6, hz: 6, maxVar: 9, maxMedian: 74, jx: 28, jz: 28, tries: 40, nx: 4,
      rect: (x, z) => platform(x, z, PLAZA, MARGIN, { len: 18 }).rect,
      circle: (x, z) => ({ x, z, r: reach }),
    });
    if (!site) return null;
    env.biome = env.biomeAt(site.x, site.z);
    const pal = paletteFor(env.zone, env.biome);
    const floorY = Math.max(SEA_LEVEL + 2, Math.round(site.stats.median));
    const cx = site.x;
    const cz = site.z;
    const f = env.rng.int(0, 3);
    const D = HEIGHT[Math.min(4, env.zone)];
    const O = { x: cx, y: floorY + 1, z: cz };
    const L0 = NullW.local(O, f);
    const deck = L0.toWorld(0, D, 4);
    const table = L0.toWorld(4, D, 0);
    const door = L0.toWorld(0, 0, -7);
    const sg = L0.toWorld(-3, 0, -6);
    const deckY = floorY + 1 + D;
    const tier = Math.max(1, Math.min(5, env.difficulty));
    const text = 'Gözcü Kulesi: Tepeye çık, harita masasına git — çevredeki yapılar haritanda belirir. '
      + 'Merdiven kulenin içinde, sarmal biçimde yukarı çıkar.';
    const { plat, margin } = fitPlatform(env, site, PLAZA, MARGIN, { len: 18 }, (m) => ({ x: cx, z: cz, r: PLAZA + m + 3 }));
    const rect = plat.rect;
    const pub = {
      name: env.name,
      x: cx,
      y: floorY + 1,
      z: cz,
      bounds: boxOf(cx - 7, floorY - 3, cz - 7, cx + 7, Math.min(124, deckY + 12 + 34), cz + 7),
      lookout: {
        deck: { x: deck.x, y: deckY, z: deck.z },
        table: { x: table.x, y: deckY, z: table.z },
        height: D,
        revealRadius: REVEAL[Math.min(4, env.zone)],
      },
      entrance: { x: door.x, y: floorY + 1, z: door.z },
      signs: [signEntry(sg.x, sg.y, sg.z, text)],
      beacon: beaconEntry(cx, cz, Math.min(118, deckY + 14), Math.min(124, deckY + 48), tier),
      tags: ['harita', 'kule'],
    };
    const build = (W) => {
      if (!W.has(rect.x0, rect.z0, rect.x1, rect.z1)) return;
      const L = W.local(O, f);
      terraform(W, plat.shape, floorY, margin);
      drawTower(L, pal, D);
      W.set(sg.x, sg.y, sg.z, B.SIGN);
      buildBeacon(W, cx, cz, Math.min(118, deckY + 14), Math.min(124, deckY + 48), tier);
    };
    return makePlan(env, Object.assign({}, pub, { rect, build }));
  },
};

function drawTower(L, p, D) {
  const rad = (r) => Math.sqrt(r * r + r);
  const U = helixTurns(D);
  const botAngle = Math.PI; // kapı −lz yönünde
  const topAngle = (((botAngle - TAU * U) % TAU) + TAU) % TAU;
  const yDeck = D - 1; // güverte zemin bloğu (yerel)
  /* zemin / avlu */
  L.paint(-PLAZA, -1, -PLAZA, PLAZA, -1, PLAZA, (lx, ly, lz) => {
    const d2 = lx * lx + lz * lz;
    if (d2 > PLAZA * PLAZA + PLAZA) return -1;
    return d2 > 30 && ((lx + lz) & 1) === 0 ? p.floor : p.floorAlt;
  });
  L.cyl(0, 0, -4, -2, PLAZA, p.base);
  /* gövde: oyuk + duvar (3 < r ≤ 4) */
  L.cyl(0, 0, 0, D + 6, 4, 0);
  L.paint(-5, -3, -5, 5, D - 2, 5, (lx, ly, lz) => {
    const d2 = lx * lx + lz * lz;
    if (d2 <= 12 || d2 > 20) return -1;
    if (ly < 0) return p.base;
    if (ly % 6 === 0) return p.trim;
    if (ly % 6 === 3 && (lx === 0 || lz === 0) && d2 >= 14) return p.glass; // dar pencere
    return hf(L.wx(lx, lz), ly, L.wz(lx, lz), 41) < 0.16 ? p.wallAlt : p.wall;
  });
  // taban genişlemesi (payanda)
  L.cyl(0, 0, 0, 2, 5, 0);
  L.ringWall(0, 0, 0, 2, 3, 5, p.wall);
  L.ringWall(0, 0, 3, 3, 4, 5, p.trim);
  /* merkez sütun */
  L.fill(-1, -1, 0, 1, D + 9, 0, p.pillar);
  L.fill(0, -1, -1, 0, D + 9, 1, p.pillar);
  for (let y = 4; y < D; y += 6) L.fill(0, y, 0, 0, y, 0, p.glow);
  /* sarmal basamaklar */
  const helix = {
    cx: 0, cz: 0, rIn: Math.sqrt(2.5), rOut: rad(3), yTop: yDeck, D, U, topAngle, stepId: p.floor, altId: p.floorAlt,
  };
  L.fill(-3, -1, -3, 3, -1, 3, p.floor); // dip
  buildHelix(L, helix);
  // fenerler duvar içinde, helis boyunca
  for (let u = 0.2; u < U; u += 0.55) {
    const a = angleAtU(topAngle, u);
    const lx = Math.round(3.7 * Math.sin(a));
    const lz = Math.round(3.7 * Math.cos(a));
    const ly = yDeck - Math.round((D * u) / U) + 2;
    L.set(lx, ly, lz, p.lamp);
  }
  /* kapı (−lz) */
  L.fill(-1, 0, -5, 1, 3, -3, 0);
  L.fill(-2, 0, -5, -2, 4, -3, p.pillar);
  L.fill(2, 0, -5, 2, 4, -3, p.pillar);
  L.fill(-2, 4, -5, 2, 4, -3, p.trim);
  L.set(-2, 2, -6, p.torch);
  L.set(2, 2, -6, p.torch);
  L.set(0, 5, -4, p.glow);
  /* güverte: korbel + zemin + korkuluk */
  L.paint(-7, D - 4, -7, 7, D - 1, 7, (lx, ly, lz) => {
    const d2 = lx * lx + lz * lz;
    if (d2 > 42) return -1;
    if (ly === D - 1) return d2 <= 12 ? -1 : (((lx + lz) & 1) === 0 ? p.floor : p.floorAlt);
    if (ly === D - 2) return d2 > 12 && d2 <= 42 ? p.trim : -1;
    if (ly === D - 3) return d2 > 20 && d2 <= 30 ? p.wall : -1;
    return d2 > 20 && d2 <= 20 ? p.wall : -1;
  });
  buildRailing(L, helix, D, 0.9, 12.5, 14, p.fence);
  L.ringWall(0, 0, D, D, 5, 6, p.fence);
  /* harita masası (kitaplık), köşe direkleri + çatı */
  L.set(4, D, 0, B.BOOKSHELF);
  L.set(4, D + 1, 0, p.lamp);
  L.set(4, D - 1, 0, p.trim);
  for (const [lx, lz] of [[4, 4], [-4, 4], [4, -4], [-4, -4]]) {
    L.fill(lx, D, lz, lx, D + 4, lz, p.pillar);
    L.set(lx, D + 5, lz, p.trim);
  }
  L.cyl(0, 0, D + 6, D + 6, 6, p.roof);
  L.cyl(0, 0, D + 7, D + 7, 4, p.roofAlt);
  L.cyl(0, 0, D + 8, D + 8, 2, p.roof);
  L.fill(0, D + 6, 0, 0, D + 12, 0, p.pillar);
  L.set(0, D + 13, 0, p.glow);
  // bayraklar: çatı kenarından sarkan kumaşlar
  for (const [lx, lz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) {
    L.fill(lx, D + 4, lz, lx, D + 5, lz, p.accent);
  }
}
