/*
 * KEŞİF sim — Mühür Kulesi (bölge sınırı kulesi): N kristal yuvası + Mühür Sunağı + kapı kolu.
 *
 * Her bölgede bir tane (anchor), dış Mühür halkasına bakar. N = ZONES[z].temples. Oyun: kristaller `sockets` hücrelerine
 * konur (üstü boş hücre; zemin PORTAL_FRAME kaidesi), sunağa (B.ALTAR) etkileşim `progression.crystalPlaced` olayını üretir,
 * hepsi dolunca `gate` hücreleri (SEAL_BARRIER) açılır ve halka kalkar (world.unlockZone).
 */
import { ZONES } from './constants.js';
import { SEA_LEVEL } from './constants.js';
import { B } from './blocks.js';
import {
  NullW, buildBeacon, hf, paletteFor,
} from './structuresKit.js';
import {
  beaconEntry, boxOf, facingToward, fitPlatform, makePlan, signEntry,
} from './structuresPlan.js';
import { platform, terraform } from './structuresTerrain.js';

const PLAZA = 9;
const MARGIN = 5;

export const SEAL = {
  key: 'muhursunagi',
  name: 'Mühür Kulesi',
  plan(env) {
    const R = PLAZA + MARGIN + 3;
    const site = env.site({
      hx: 8, hz: 8, maxVar: 11, maxMedian: 80, jx: 28, jz: 28, tries: 40, nx: 4,
      rect: (x, z) => platform(x, z, PLAZA, MARGIN, { len: 20 }).rect,
      circle: (x, z) => ({ x, z, r: R }),
    });
    if (!site) return null;
    env.biome = env.biomeAt(site.x, site.z);
    const pal = paletteFor(env.zone, env.biome);
    const floorY = Math.max(SEA_LEVEL + 2, Math.round(site.stats.median));
    const cx = site.x;
    const cz = site.z;
    const rr = Math.sqrt(cx * cx + cz * cz) || 1;
    const f = facingToward(cx / rr, cz / rr); // dışa (halkaya) bakar
    const N = ZONES[env.zone].temples;
    const O = { x: cx, y: floorY + 1, z: cz };
    const L0 = NullW.local(O, f);

    // yuvalar: altar çevresinde N nokta (kapıların önünü boş bırak: 45° ofset)
    const sockets = [];
    for (let k = 0; k < N; k++) {
      const a = Math.PI / 4 + ((k + 0.5) * (Math.PI * 2 - Math.PI / 2)) / N + Math.PI / 8;
      const lx = Math.round(3.5 * Math.sin(a));
      const lz = Math.round(3.5 * Math.cos(a));
      const w = L0.toWorld(lx, 0, lz);
      sockets.push({
        lx, lz, x: w.x, y: w.y + 1, z: w.z, base: { x: w.x, y: w.y, z: w.z },
      });
    }
    const altarW = L0.toWorld(0, 0, 0);
    const leverW = L0.toWorld(0, 1, -5);
    const gateCells = [];
    for (let lz = 7; lz <= 8; lz++) {
      for (let lx = -1; lx <= 1; lx++) {
        for (let ly = 0; ly <= 4; ly++) {
          const w = L0.toWorld(lx, ly, lz);
          gateCells.push({ x: w.x, y: w.y, z: w.z });
        }
      }
    }
    const roofTop = floorY + 1 + 34;
    const text = 'Mühür Kulesi — ' + ZONES[env.zone].name + ': ' + N + ' Anahtar Kristalini yuvalara ve sunağa yerleştir. '
      + 'Mühür açılınca sınır geçidi kalkar.';
    const sg = L0.toWorld(-1, 0, 5);
    const entS = L0.toWorld(0, 0, -9);
    const pub = {
      name: env.name,
      x: cx,
      y: floorY + 1,
      z: cz,
      bounds: boxOf(cx - PLAZA - 2, floorY - 3, cz - PLAZA - 2, cx + PLAZA + 2, roofTop + 40, cz + PLAZA + 2),
      seal: {
        zone: env.zone,
        required: N,
        altar: { x: altarW.x, y: altarW.y, z: altarW.z },
        sockets: sockets.map((s) => ({ x: s.x, y: s.y, z: s.z, base: s.base })),
        lever: { x: leverW.x, y: leverW.y, z: leverW.z },
        gate: { cells: gateCells, id: B.SEAL_BARRIER },
        ringRadius: ZONES[env.zone].rOut,
        outward: { x: cx / rr, z: cz / rr },
      },
      altar: { x: altarW.x, y: altarW.y, z: altarW.z },
      entrance: { x: entS.x, y: entS.y, z: entS.z },
      signs: [signEntry(sg.x, sg.y, sg.z, text)],
      beacon: beaconEntry(cx, cz, roofTop + 4, Math.min(120, roofTop + 44), 2),
      tags: ['mühür', 'kristal'],
    };
    const { plat, margin } = fitPlatform(env, site, PLAZA, MARGIN, { len: 20 }, (m) => ({ x: cx, z: cz, r: PLAZA + m + 3 }));
    const rect = plat.rect;
    const build = (W) => {
      if (!W.has(rect.x0, rect.z0, rect.x1, rect.z1)) return;
      const L = W.local(O, f);
      terraform(W, plat.shape, floorY, margin);
      drawSealTower(L, pal, sockets, N);
      L.W.set(sg.x, sg.y, sg.z, B.SIGN);
      const roof = L.oy + 34;
      buildBeacon(W, cx, cz, roof + 4, roof + 44, 2);
    };
    return makePlan(env, Object.assign({}, pub, { rect, build }));
  },
};

function chance(L, lx, lz, p, salt) {
  return hf(L.wx(lx, lz), 0, L.wz(lx, lz), salt) < p;
}

function drawSealTower(L, p, sockets, N) {
  /* zemin: halkalı döşeme */
  L.paint(-10, -1, -10, 10, -1, 10, (lx, ly, lz) => {
    const d2 = lx * lx + lz * lz;
    if (d2 > PLAZA * PLAZA + PLAZA) return -1;
    if (d2 > 72 && d2 <= 90) return d2 > 80 && d2 <= 84 ? p.glow : p.floorAlt;
    return ((lx + lz) & 1) === 0 ? p.floor : p.floorAlt;
  });
  L.cyl(0, 0, -3, -2, PLAZA, p.base);
  /* salon: duvar + oyuk */
  L.cyl(0, 0, 0, 10, 8, 0);
  L.paint(-9, 0, -9, 9, 9, 9, (lx, ly, lz) => {
    const d2 = lx * lx + lz * lz;
    if (d2 <= 42 || d2 > 72) return -1;
    if (ly === 0 || ly === 5 || ly === 9) return p.trim;
    return chance(L, lx, lz, 0.18, ly) ? p.wallAlt : p.wall;
  });
  // sütunlar (iç)
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * (Math.PI / 4);
    const lx = Math.round(5.2 * Math.sin(a));
    const lz = Math.round(5.2 * Math.cos(a));
    L.fill(lx, 0, lz, lx, 6, lz, p.pillar);
    L.set(lx, 7, lz, p.lamp);
  }
  /* kemerli girişler: +lz kapı (SEAL_BARRIER dolgulu), diğer üçü açık */
  const arch = (dx, dz) => {
    for (let t = 6; t <= 9; t++) {
      for (let s = -2; s <= 2; s++) {
        const lx = dx !== 0 ? dx * t : s;
        const lz = dz !== 0 ? dz * t : s;
        L.fill(lx, 0, lz, lx, 4, lz, 0);
        if (Math.abs(s) === 2) L.fill(lx, 0, lz, lx, 5, lz, p.pillar);
        L.set(lx, 5, lz, p.trim);
        if (s === 0) L.set(lx, 6, lz, p.glow);
      }
    }
  };
  arch(-1, 0);
  arch(1, 0);
  arch(0, -1);
  arch(0, 1);
  for (let lz = 7; lz <= 8; lz++) {
    for (let lx = -1; lx <= 1; lx++) L.fill(lx, 0, lz, lx, 4, lz, B.SEAL_BARRIER);
  }
  // çatı + kat
  L.cyl(0, 0, 10, 10, 8, p.roof);
  L.cyl(0, 0, 11, 11, 7, p.roofAlt);
  L.ringWall(0, 0, 10, 10, 8, 9, p.trim);
  /* sunak kürsüsü + yuvalar + kol */
  L.fill(-2, -1, -2, 2, -1, 2, p.trim);
  L.fill(-1, -1, -1, 1, -1, 1, p.glow);
  L.set(0, 0, 0, B.ALTAR);
  for (let i = 0; i < sockets.length; i++) {
    const s = sockets[i];
    L.set(s.lx, 0, s.lz, B.PORTAL_FRAME);
    L.set(s.lx, -1, s.lz, p.glow);
  }
  L.set(0, 0, -5, p.trim);
  L.set(0, 1, -5, B.LEVER);
  L.set(-1, 0, -5, p.torch);
  L.set(1, 0, -5, p.torch);
  /* üst gövde: ince kule + balkonlar */
  L.paint(-5, 12, -5, 5, 28, 5, (lx, ly, lz) => {
    const d2 = lx * lx + lz * lz;
    if (d2 > 20) return -1;
    if (ly === 12) return p.trim;
    if (d2 <= 6 && ly > 12) return p.pillar;
    if (ly % 6 === 0) return p.trim;
    if ((lx === 0 || lz === 0) && d2 >= 9) return p.glow;
    return chance(L, lx, lz, 0.15, ly) ? p.wallAlt : p.wall;
  });
  L.cyl(0, 0, 12, 12, 6, p.trim);
  for (const y of [18, 24]) {
    L.ringWall(0, 0, y, y, 4, 6, p.trim);
    L.ringWall(0, 0, y + 1, y + 1, 5, 6, p.fence);
  }
  /* taç + küre */
  L.cyl(0, 0, 29, 29, 5, p.trim);
  for (let k = 0; k < 4; k++) {
    const lx = k < 2 ? (k === 0 ? 4 : -4) : 0;
    const lz = k >= 2 ? (k === 2 ? 4 : -4) : 0;
    L.fill(lx, 30, lz, lx, 34, lz, p.pillar);
    L.set(lx, 35, lz, p.lamp);
  }
  L.cyl(0, 0, 30, 32, 1, p.glow);
  L.fill(-1, 31, -1, 1, 31, 1, B.QUANTUM_BLOCK);
  L.fill(0, 33, 0, 0, 36, 0, B.LIGHT_BLOCK);
  void N;
}
