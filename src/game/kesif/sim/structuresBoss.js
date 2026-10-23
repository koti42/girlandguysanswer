/*
 * KEŞİF sim — Boss Arenası: dairesel dövüş alanı, sütunlar, köşe kuleleri, kilitli büyük kapı (Mühür tamamlanınca açılır),
 * arka kasada ödül sandığı (ikinci kapı: boss yenilince açılır). Boss merkezde doğar (arena yarıçapı mobTypes'tan).
 *
 * Yerel çerçeve: origin = arena merkezi (ly=0 ayakta); +lz = dünya merkezine (kapı), −lz = arka kasa.
 */
import { SEA_LEVEL } from './constants.js';
import { B } from './blocks.js';
import { bossForZone } from './mobTypes.js';
import {
  NullW, buildBeacon, hf, paletteFor,
} from './structuresKit.js';
import {
  beaconEntry, boxOf, chestEntry, facingToward, makePlan, signEntry,
} from './structuresPlan.js';
import { platform, terraform } from './structuresTerrain.js';
import { heightAt } from './worldgen.js';

const RAMP = 36;

/** Kapı ekseni boyunca (merkeze doğru) doğal arazi yüksekliği: a = rampa başından uzaklık. */
function axisHeight(seed, c, Rp, a) {
  const ax = Math.abs(c.x) > Math.abs(c.z) ? { x: Math.sign(c.x), z: 0 } : { x: 0, z: Math.sign(c.z) };
  return heightAt(seed, Math.round(c.x - ax.x * (Rp + a)), Math.round(c.z - ax.z * (Rp + a)));
}

/** Rampanın sabit eğimi (blok/blok, ±0,5): rampa sonu, rampa sonrasındaki doğal araziyle aynı yüksekliğe gelir. */
export function bossRampRise(seed, c, Rp, fy) {
  const hEnd = (axisHeight(seed, c, Rp, RAMP) + axisHeight(seed, c, Rp, RAMP + 3) + axisHeight(seed, c, Rp, RAMP + 6)) / 3;
  return Math.max(-0.5, Math.min(0.5, Math.round(((hEnd - fy) / RAMP) * 8) / 8));
}

export const BOSS_ARENA = {
  key: 'bossarena',
  name: 'Boss Arenası',
  plan(env) {
    const boss = bossForZone(env.zone);
    if (!boss) return null;
    const R = boss.arenaRadius;
    const Rp = R + 3;
    const reach = Rp + 3;
    const site = env.site({
      hx: R + 2, hz: R + 2, maxVar: 24, jx: 40, jz: 40, tries: 70, nx: 6,
      rect: (x, z) => platform(x, z, Rp, 0, { len: RAMP, lat: 4, axis: true }).rect,
      circle: (x, z) => ({ x, z, r: reach }),
      // giriş rampası: kapıdan dışarı doğru zemin yüksekliği kabaca 1:2 eğimle platforma ulaşılabilmeli
      accept: (c, st) => {
        const fy = Math.max(SEA_LEVEL + 2, Math.round(st.median));
        // yol su altında/üstünde kalmasın: eksen boyunca doğal arazi deniz seviyesinin üstünde olmalı (göl/okyanus üstünden rampa geçmez)
        for (let a = 0; a <= RAMP + 8; a += 2) if (axisHeight(env.seed, c, Rp, a) <= SEA_LEVEL) return false;
        // rampa sabit eğimlidir (terraform rise); sonu, sonrasındaki doğal araziyle ≤1 blok farkla birleşmeli (yoksa yol uçuruma/kaya
        // duvarına çıkar ve arena dışarıdan ulaşılamaz)
        const endY = fy + Math.round(bossRampRise(env.seed, c, Rp, fy) * RAMP);
        for (let a = RAMP + 1; a <= RAMP + 6; a++) if (Math.abs(axisHeight(env.seed, c, Rp, a) - endY) > 1) return false;
        return true;
      },
    });
    if (!site) return null;
    env.biome = env.biomeAt(site.x, site.z);
    const pal = paletteFor(env.zone, env.biome);
    const cx = site.x;
    const cz = site.z;
    const floorY = Math.max(SEA_LEVEL + 2, Math.round(site.stats.median));
    const rr = Math.sqrt(cx * cx + cz * cz) || 1;
    const f = facingToward(-cx / rr, -cz / rr);
    const O = { x: cx, y: floorY + 1, z: cz };
    const L0 = NullW.local(O, f);
    const doorCells = [];
    for (let lz = R; lz <= R + 1; lz++) {
      for (let lx = -2; lx <= 2; lx++) {
        for (let ly = 0; ly <= 5; ly++) {
          const w = L0.toWorld(lx, ly, lz);
          doorCells.push({ x: w.x, y: w.y, z: w.z });
        }
      }
    }
    const vaultZ = -(R - 3);
    const rewardCells = [];
    for (let lx = -1; lx <= 1; lx++) {
      for (let ly = 0; ly <= 2; ly++) {
        const w = L0.toWorld(lx, ly, vaultZ + 3);
        rewardCells.push({ x: w.x, y: w.y, z: w.z });
      }
    }
    const cw = L0.toWorld(0, 0, vaultZ - 1);
    const chests = [chestEntry(env, cw.x, cw.y, cw.z, { kind: 'boss', block: 'ödül', index: 0 })];
    const entr = L0.toWorld(0, 0, R + 2);
    const sg = L0.toWorld(-4, 0, R + 4);
    const text = boss.name + ' Arenası — Mühür Kulesi tamamlanınca büyük kapı açılır. Zırh, güçlü bir silah ve şifa iksiri al; '
      + 'saldırı desenlerini ezberle, her aşamada değişir. Arka kasada büyük ödül seni bekliyor.';
    const wallTop = 9;
    const towerTop = 16;
    const plat = platform(cx, cz, Rp, 0, {
      len: RAMP, lat: 4, axis: true, rise: bossRampRise(env.seed, { x: cx, z: cz }, Rp, floorY),
    });
    const rect = plat.rect;
    const pub = {
      name: boss.name + ' Arenası',
      x: cx,
      y: floorY + 1,
      z: cz,
      bounds: boxOf(cx - R - 4, floorY - 3, cz - R - 4, cx + R + 4, floorY + towerTop + 40, cz + R + 4),
      boss: {
        key: boss.key,
        name: boss.name,
        zone: env.zone,
        x: cx,
        y: floorY + 1,
        z: cz,
        radius: R,
        entrance: { x: entr.x, y: floorY + 1, z: entr.z },
        door: { cells: doorCells, id: B.BOSS_DOOR },
        rewardDoor: { cells: rewardCells, id: B.BOSS_DOOR },
        chest: { x: cw.x, y: cw.y, z: cw.z },
        wallHeight: wallTop,
        ability: boss.ability,
      },
      chests,
      entrance: { x: entr.x, y: floorY + 1, z: entr.z },
      signs: [signEntry(sg.x, sg.y, sg.z, text)],
      beacon: beaconEntry(cx, cz, floorY + towerTop + 4, Math.min(120, floorY + towerTop + 44), 5),
      safeRadius: 0,
      tags: ['boss', 'arena'],
    };
    const build = (W) => {
      if (!W.has(rect.x0, rect.z0, rect.x1, rect.z1)) return;
      const L = W.local(O, f);
      // zemin: daire (kenar duvarla gizlenir) + kapıdan dışarı doğru yürünebilir rampa (kanyon)
      terraform(W, plat.shape, floorY, 0);
      drawArena(L, pal, R, env.zone, wallTop, towerTop, vaultZ, 6);
      W.set(sg.x, sg.y, sg.z, B.SIGN);
    };
    return makePlan(env, Object.assign({}, pub, { rect, build }));
  },
};

function drawArena(L, p, R, zone, wallTop, towerTop, vaultZ, tier) {
  const RR = R * R + R;
  const WR = (R + 2) * (R + 2) + (R + 2);
  /* 1) zemin: halka desenli daire + merkez amblem */
  L.cyl(0, 0, -4, -2, R + 3, p.base);
  L.paint(-R - 3, -1, -R - 3, R + 3, -1, R + 3, (lx, ly, lz) => {
    const d2 = lx * lx + lz * lz;
    if (d2 > (R + 3) * (R + 3) + (R + 3)) return -1;
    if (d2 > WR) return p.trim; // dış şerit
    if (d2 > RR) return p.base; // duvar altı
    const d = Math.sqrt(d2);
    if (d <= 1.5) return p.glow;
    if (d >= R - 2.2 && d < R - 1.2) return p.glow;
    if (d >= 6.5 && d < 7.3) return p.trim;
    if (d >= 11.5 && d < 12.1) return p.trim;
    // ışınsal çizgiler (8 yön)
    const ax = Math.abs(lx);
    const az = Math.abs(lz);
    if (d < 11 && (ax === 0 || az === 0 || ax === az)) return p.trim;
    if (hf(L.wx(lx, lz), 0, L.wz(lx, lz), 11) < 0.09) return p.wallAlt;
    return ((lx + lz) & 1) === 0 ? p.floor : p.floorAlt;
  });
  /* 2) dış duvar (ly 0..wallTop) + kenar dişleri */
  L.cyl(0, 0, 0, wallTop + 2, R + 3, 0);
  L.paint(-R - 4, -3, -R - 4, R + 4, wallTop + 1, R + 4, (lx, ly, lz) => {
    const d2 = lx * lx + lz * lz;
    if (d2 <= RR || d2 > WR) return -1;
    if (ly < 0) return p.base;
    if (ly === wallTop + 1) return ((lx + lz) & 1) === 0 ? p.trim : -1; // mazgal
    if (ly === wallTop) return p.trim;
    if (ly === 4 && hf(L.wx(lx, lz), 0, L.wz(lx, lz), 3) < 0.35) return p.glow;
    return hf(L.wx(lx, lz), ly, L.wz(lx, lz), 5) < 0.17 ? p.wallAlt : p.wall;
  });
  // duvar altı: zemine kadar istinat (kenarda boşluk kalmasın)
  for (let dz = -R - 4; dz <= R + 4; dz++) {
    for (let dx = -R - 4; dx <= R + 4; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= RR || d2 > WR) continue;
      L.pillarDown(dx, -4, dz, p.base, 60);
    }
  }
  /* 3) büyük kapı (+lz): oyuk, çerçeve, BOSS_DOOR dolgu */
  for (let lz = R - 1; lz <= R + 3; lz++) L.fill(-2, 0, lz, 2, 5, lz, 0);
  L.fill(-3, 0, R - 1, -3, 8, R + 3, p.pillar);
  L.fill(3, 0, R - 1, 3, 8, R + 3, p.pillar);
  L.fill(-3, 6, R - 1, 3, 6, R + 3, p.trim);
  L.fill(-2, 7, R, 2, 7, R + 2, p.glow);
  L.fill(-3, 9, R - 1, 3, 9, R + 3, p.trim);
  L.fill(-2, 0, R, 2, 5, R + 1, B.BOSS_DOOR);
  L.set(-4, 3, R + 3, p.lamp);
  L.set(4, 3, R + 3, p.lamp);
  // yaklaşım yolu: rampanın güncel yüzeyine taş döşeme + fener direkleri
  for (let lz = R + 3; lz <= R + 3 + RAMP; lz++) {
    for (let lx = -2; lx <= 2; lx++) {
      const y = L.surfaceY(lx, lz);
      if (y > 0) L.W.set(L.wx(lx, lz), y, L.wz(lx, lz), Math.abs(lx) === 2 ? p.trim : p.floor);
    }
    if ((lz - R - 3) % 6 === 2) {
      for (const lx of [-3, 3]) {
        const y = L.surfaceY(lx, lz);
        if (y > 0) {
          L.W.fill(L.wx(lx, lz), y + 1, L.wz(lx, lz), L.wx(lx, lz), y + 3, L.wz(lx, lz), p.pillar);
          L.W.set(L.wx(lx, lz), y + 4, L.wz(lx, lz), p.lamp);
        }
      }
    }
  }
  /* 4) iç sütunlar (siper) */
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * (Math.PI / 4);
    const lx = Math.round((R - 7) * Math.sin(a));
    const lz = Math.round((R - 7) * Math.cos(a));
    L.fill(lx, 0, lz, lx + 1, 6, lz + 1, p.pillar);
    L.fill(lx - 1, 7, lz - 1, lx + 2, 7, lz + 2, p.trim);
    L.set(lx, 8, lz, p.lamp);
    L.set(lx + 1, 8, lz + 1, p.lamp);
    L.set(lx, 0, lz, p.trim);
  }
  /* 5) köşe kuleleri */
  for (let k = 0; k < 4; k++) {
    const a = k * (Math.PI / 2) + Math.PI / 4;
    const lx = Math.round((R + 1) * Math.sin(a));
    const lz = Math.round((R + 1) * Math.cos(a));
    L.paint(lx - 3, -3, lz - 3, lx + 3, towerTop + 2, lz + 3, (x, ly, z) => {
      const dx = x - lx;
      const dz = z - lz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 10) return -1;
      if (ly >= towerTop + 1) return d2 <= 4 && ((dx + dz) & 1) === 0 ? p.trim : -1;
      if (ly === towerTop) return p.trim;
      if (ly < 0) return p.base;
      if (ly % 5 === 4 && d2 >= 5) return p.glow;
      return hf(L.wx(x, z), ly, L.wz(x, z), 9) < 0.15 ? p.wallAlt : p.wall;
    });
    L.set(lx, towerTop + 1, lz, p.lamp);
  }
  /* 6) arka kasa (ikinci kapı: boss yenilince açılır) */
  L.paint(-4, -1, vaultZ - 3, 4, 5, vaultZ + 4, (lx, ly, lz) => {
    if (ly === -1) return p.wall;
    if (ly === 5) return p.trim;
    return hf(L.wx(lx, lz), ly, L.wz(lx, lz), 13) < 0.15 ? p.wallAlt : p.wall;
  });
  L.fill(-2, 0, vaultZ - 2, 2, 4, vaultZ + 2, 0);
  L.fill(-2, -1, vaultZ - 2, 2, -1, vaultZ + 2, p.trim);
  L.fill(-1, 0, vaultZ + 3, 1, 2, vaultZ + 4, 0);
  L.fill(-1, 0, vaultZ + 3, 1, 2, vaultZ + 3, B.BOSS_DOOR);
  L.fill(-2, 0, vaultZ + 4, -2, 3, vaultZ + 4, p.pillar);
  L.fill(2, 0, vaultZ + 4, 2, 3, vaultZ + 4, p.pillar);
  L.set(-2, 0, vaultZ - 1, p.torch);
  L.set(2, 0, vaultZ - 1, p.torch);
  L.set(0, 0, vaultZ - 1, B.REWARD_CHEST);
  L.set(0, -1, vaultZ - 1, p.glow);
  /* 7) bölge süsleri */
  if (zone === 1) {
    for (let k = 0; k < 28; k++) {
      const a = k * 0.2244;
      const lx = Math.round((R - 0.5) * Math.sin(a));
      const lz = Math.round((R - 0.5) * Math.cos(a));
      if (Math.abs(lx) <= 4) continue; // kapı ve arka kasa önü açık kalsın
      if (hf(L.wx(lx, lz), 1, L.wz(lx, lz), 21) < 0.6) L.fill(lx, 4 + (k % 3), lz, lx, wallTop - 1, lz, B.VINE);
    }
  } else if (zone === 3) {
    for (let k = 0; k < 16; k++) {
      const a = k * 0.4;
      L.set(Math.round((R - 3) * Math.sin(a)), 0, Math.round((R - 3) * Math.cos(a)), B.SNOW);
    }
  }
  /* 8) ışık hüzmesi: kapıya yakın iki kule */
  for (const sgn of [-1, 1]) {
    const a = sgn * (Math.PI / 4);
    const lx = Math.round((R + 1) * Math.sin(a));
    const lz = Math.round((R + 1) * Math.cos(a));
    const y0 = L.oy + towerTop + 2;
    buildBeacon(L.W, L.wx(lx, lz), L.wz(lx, lz), y0, y0 + 40, tier);
  }
}
