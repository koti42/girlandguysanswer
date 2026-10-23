/*
 * KEŞİF sim — Köy: kuyu, patikalar, 4–5 ev (yatak/tezgah/sandık), pazar tezgâhı, bahçeler, fener direkleri, ipucu tabelaları.
 * Güvenli (yaratıksız) bölge. Çıplak ev şablonları kuyuya bakar; bütün köy rastgele döner.
 */
import { SEA_LEVEL } from './constants.js';
import { B } from './blocks.js';
import {
  NullW, buildBeacon, hf, paletteFor,
} from './structuresKit.js';
import {
  beaconEntry, boxOf, chestEntry, facingToward, fitPlatform, makePlan, signEntry,
} from './structuresPlan.js';
import { platform, terraform } from './structuresTerrain.js';

const R = 20;
const MARGIN = 6;
const SAFE = 36;

const TIPS = [
  'Köy: güvenli bölge. Evlerdeki sandıkları ve yatakları kullanabilirsin.',
  'İpucu: Bir bloğu kırmak için basılı tut. Doğru alet kırmayı hızlandırır.',
  'İpucu: Bulmaca odasında takılırsan dışarı çıkıp yeniden dene; oda sıfırlanır.',
  'İpucu: Bölgenin kristalleri tapınaklarda saklıdır; Mühür Kulesi\'nde birleştirilir.',
  'İpucu: Gözcü kuleleri haritayı açar. Işık hüzmesinin rengi zorluğu gösterir: bronz, gümüş, altın, mavi, mor.',
  'İpucu: Meşale yaratıkları uzak tutar. Gece kamp ateşine yakın dur.',
  'İpucu: Parkur kulesinin tepesindeki sandık ödül ve yıldız verir.',
  'Köylü notu: Hazine arıyorsan kırmızı X işaretlerini ara, yanında bir kürek olsun.',
];

export const KOY = {
  key: 'koy',
  name: 'Köy',
  plan(env) {
    const reach = R + MARGIN + 3;
    const site = env.site({
      hx: 12, hz: 12, maxVar: 14, jx: 28, jz: 28, tries: 40, nx: 5,
      rect: (x, z) => platform(x, z, R, MARGIN, { len: 22 }).rect,
      circle: (x, z) => ({ x, z, r: reach }),
    });
    if (!site) return null;
    env.biome = env.biomeAt(site.x, site.z);
    const pal = paletteFor(env.zone, env.biome);
    const floorY = Math.max(SEA_LEVEL + 2, Math.round(site.stats.median));
    if (floorY < SEA_LEVEL + 2) return null;
    const cx = site.x;
    const cz = site.z;
    const f = env.rng.int(0, 3);
    const O = { x: cx, y: floorY + 1, z: cz };
    const L0 = NullW.local(O, f);
    const rng = env.rng;
    // evler
    const count = rng.int(4, 5);
    const a0 = rng.float(0, Math.PI * 2);
    const houses = [];
    for (let k = 0; k < count; k++) {
      const a = a0 + (k * Math.PI * 2) / count + rng.float(-0.12, 0.12);
      const rad = rng.float(12, 13.5);
      const lx = Math.round(rad * Math.sin(a));
      const lz = Math.round(rad * Math.cos(a));
      const w = rng.pick([5, 7, 7]);
      const d = rng.pick([5, 5, 7]);
      const o = L0.toWorld(lx, 0, lz);
      const face = facingToward(cx - o.x, cz - o.z);
      houses.push({ lx, lz, w, d, origin: { x: o.x, y: o.y, z: o.z }, facing: face, kind: k });
    }
    // sandıklar: ilk iki evde + pazar
    const chests = [];
    houses.forEach((h, i) => {
      if (i > 1) return;
      const HL = NullW.local(h.origin, h.facing);
      const c = HL.toWorld((h.w >> 1) - 1, 0, -(h.d >> 1) + 1);
      chests.push(chestEntry(env, c.x, c.y, c.z, { kind: 'sandık', index: i }));
    });
    const mk = L0.toWorld(0, 0, -9);
    chests.push(chestEntry(env, mk.x, mk.y, mk.z + 0, { kind: 'kamp', index: 2 }));
    const beds = houses.map((h) => {
      const HL = NullW.local(h.origin, h.facing);
      const b = HL.toWorld(-(h.w >> 1) + 1, 0, -(h.d >> 1) + 1);
      return { x: b.x, y: b.y, z: b.z };
    });
    const tipIdx = rng.int(0, TIPS.length - 1);
    const sgPos = [[-3, 0, 4], [3, 0, 4], [0, 0, -4]].map((p, i) => {
      const w = L0.toWorld(p[0], p[1], p[2]);
      return signEntry(w.x, w.y, w.z, TIPS[(tipIdx + i * 3) % TIPS.length]);
    });
    const { plat, margin } = fitPlatform(env, site, R, MARGIN, { len: 22 }, (m) => ({ x: cx, z: cz, r: R + m + 3 }));
    const rect = plat.rect;
    const entV = L0.toWorld(0, 0, 7);
    const pub = {
      name: env.name,
      x: cx,
      y: floorY + 1,
      z: cz,
      bounds: boxOf(cx - R, floorY - 2, cz - R, cx + R, floorY + 22, cz + R),
      chests,
      entrance: { x: entV.x, y: entV.y, z: entV.z },
      signs: sgPos,
      beds,
      houses: houses.map((h) => ({ x: h.origin.x, y: h.origin.y, z: h.origin.z, w: h.w, d: h.d })),
      safeRadius: SAFE,
      beacon: beaconEntry(cx, cz, floorY + 14, floorY + 32, 2),
      tags: ['güvenli', 'köy', 'ipucu'],
    };
    const build = (W) => {
      if (!W.has(rect.x0, rect.z0, rect.x1, rect.z1)) return;
      const L = W.local(O, f);
      terraform(W, plat.shape, floorY, margin);
      drawVillage(L, pal, houses, chests, sgPos);
      buildBeacon(W, cx, cz, floorY + 14, floorY + 32, 2);
    };
    return makePlan(env, Object.assign({}, pub, { rect, build }));
  },
};

function drawVillage(L, p, houses, chests, signs) {
  const wx = (lx, lz) => L.wx(lx, lz);
  const wz = (lx, lz) => L.wz(lx, lz);
  /* patikalar: dört yön + halka */
  L.paint(-R, -1, -R, R, -1, R, (lx, ly, lz) => {
    const d2 = lx * lx + lz * lz;
    if (d2 > R * R) return -1;
    const ax = Math.abs(lx);
    const az = Math.abs(lz);
    const ring = d2 >= 56 && d2 <= 72;
    const cross = (ax <= 1 && az > 2) || (az <= 1 && ax > 2);
    if (d2 <= 12) return ((lx + lz) & 1) === 0 ? B.COBBLE : p.floorAlt;
    if (ring || cross) return hf(wx(lx, lz), 0, wz(lx, lz), 5) < 0.3 ? B.GRAVEL : p.path;
    return -1;
  });
  /* kuyu + çatı */
  L.fill(-2, -1, -2, 2, -1, 2, B.COBBLE);
  L.fill(-1, -1, -1, 1, -1, 1, B.WATER);
  L.fill(0, -2, 0, 0, -2, 0, B.WATER);
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) === 2 || Math.abs(dz) === 2) L.set(dx, 0, dz, B.COBBLE);
    }
  }
  for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) L.fill(lx, 1, lz, lx, 3, lz, p.fence);
  L.fill(-3, 4, -3, 3, 4, 3, p.roof);
  L.fill(-2, 5, -2, 2, 5, 2, p.roofAlt);
  L.fill(0, 5, 0, 0, 10, 0, p.fence);
  L.set(0, 11, 0, p.lamp);
  /* evler */
  houses.forEach((h, i) => {
    const HL = L.W.local(h.origin, h.facing);
    drawHouse(HL, p, h, i);
  });
  /* pazar tezgâhı (−lz) */
  L.fill(-2, 0, -9, 2, 0, -9, p.plank);
  L.set(-2, 1, -9, B.CLOTH_YELLOW);
  L.set(2, 1, -9, B.CLOTH_RED);
  for (const lx of [-3, 3]) L.fill(lx, 0, -10, lx, 3, -10, p.fence);
  for (const lx of [-3, 3]) L.fill(lx, 0, -8, lx, 3, -8, p.fence);
  L.fill(-3, 4, -10, 3, 4, -8, p.accent);
  L.fill(-2, 5, -10, 2, 5, -9, p.accent2);
  chests.forEach((c0) => L.W.set(c0.x, c0.y, c0.z, c0.block));
  /* bahçeler (bir ev bahçeye taşıyorsa bahçe çizilmez: önceden çit/çiçek sandığı ve duvarı eziyordu) */
  const nearHouse = (lx, lz, padX, padZ) => houses.some((h) => {
    const hw = Math.max(h.w, h.d) / 2 + 1.5;
    return Math.abs(h.lx - lx) <= hw + padX && Math.abs(h.lz - lz) <= hw + padZ;
  });
  for (const sgn of [-1, 1]) {
    const gx = sgn * 15;
    const gz = -3;
    if (nearHouse(gx, gz, 3.5, 2.5)) continue;
    L.fill(gx - 3, -1, gz - 2, gx + 3, -1, gz + 2, B.DIRT);
    for (let lz = gz - 2; lz <= gz + 2; lz++) {
      for (let lx = gx - 3; lx <= gx + 3; lx++) {
        const edge = Math.abs(lx - gx) === 3 || Math.abs(lz - gz) === 2;
        if (edge) L.set(lx, 0, lz, p.fence);
        else if (((lz - gz) & 1) === 0) L.set(lx, 0, lz, ((lx - gx) & 1) === 0 ? B.BUSH : B.TALL_GRASS);
        else L.set(lx, 0, lz, ((lx - gx) & 1) === 0 ? B.FLOWER_YELLOW : B.FLOWER_RED);
      }
    }
    L.set(gx, 0, gz + 2, 0);
  }
  /* fener direkleri */
  for (const [lx, lz] of [[8, 8], [-8, 8], [8, -8], [-8, -8], [0, 16], [0, -16], [16, 0], [-16, 0]]) {
    if (nearHouse(lx, lz, 0.5, 0.5)) continue;
    L.fill(lx, 0, lz, lx, 2, lz, p.fence);
    L.set(lx, 3, lz, p.lamp);
  }
  /* tabelalar */
  for (let i = 0; i < signs.length; i++) L.W.set(signs[i].x, signs[i].y, signs[i].z, B.SIGN);
  /* çiçek süsü */
  for (let k = 0; k < 24; k++) {
    const a = k * 0.8;
    const rad = 17 + (k % 3);
    L.setAir(Math.round(rad * Math.sin(a)), 0, Math.round(rad * Math.cos(a)), k % 2 === 0 ? B.FLOWER_YELLOW : B.FLOWER_RED);
  }
}

/** Ev: yerel +lz kapı (kuyuya bakar). w,d tek sayı. */
function drawHouse(HL, p, h, idx) {
  const { w, d } = h;
  const hx = w >> 1;
  const hz = d >> 1;
  const rr = (lx, ly, lz, s) => hf(HL.wx(lx, lz), ly, HL.wz(lx, lz), s);
  HL.fill(-hx - 1, -3, -hz - 1, hx + 1, -2, hz + 1, p.base);
  HL.fill(-hx, -1, -hz, hx, -1, hz, p.plank);
  for (let lz = -hz; lz <= hz; lz++) {
    for (let lx = -hx; lx <= hx; lx++) {
      const edgeX = Math.abs(lx) === hx;
      const edgeZ = Math.abs(lz) === hz;
      if (!edgeX && !edgeZ) {
        HL.fill(lx, 0, lz, lx, 3, lz, 0);
        continue;
      }
      const corner = edgeX && edgeZ;
      for (let ly = 0; ly <= 2; ly++) {
        let id = corner ? p.log : (ly === 1 && !corner && (Math.abs(lx) === 0 || Math.abs(lz) === 0) ? p.glass : p.plank);
        if (!corner && ly === 2) id = p.wall;
        HL.set(lx, ly, lz, id);
      }
    }
  }
  // kapı (+lz orta)
  HL.fill(0, 0, hz, 0, 1, hz, 0);
  HL.set(0, 2, hz, p.trim);
  HL.set(-1, 1, hz + 1, p.torch);
  HL.set(1, 1, hz + 1, p.torch);
  // basamak/patika
  HL.set(0, -1, hz + 1, p.path);
  HL.set(0, -1, hz + 2, p.path);
  // çatı: kademeli (kirişli)
  let a = -hx - 1;
  let b = hx + 1;
  let c = -hz - 1;
  let d2 = hz + 1;
  for (let k = 0; a < b - 1 && c < d2 - 1 && k < 6; k++) {
    HL.fill(a, 3 + k, c, b, 3 + k, d2, (k & 1) === 0 ? p.roof : p.roofAlt);
    a++;
    b--;
    c++;
    d2--;
  }
  // iç eşya
  HL.set(-hx + 1, 0, -hz + 1, B.BED);
  HL.set(hx - 1, 0, -hz + 1, idx % 2 === 0 ? B.WORKBENCH : B.BOOKSHELF);
  HL.set(-hx + 1, 0, hz - 1, B.BOOKSHELF);
  HL.set(0, 2, 0, p.lamp);
  HL.set(hx - 1, 0, hz - 1, p.log);
  void rr;
}
