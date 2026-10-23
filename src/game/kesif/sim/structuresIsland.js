/*
 * KEŞİF sim — Yüzen Ada: havada asılı küçük ada, üstünde antik bir tapınak kalıntısı + ödül sandığı. Yerden adaya tırmanış:
 * ada kenarının altına inen bir taş sütun + sarmaşık merdiven (tırmanılabilir), yanında "köprü ipucu" olarak kopuk bir köprü kolu.
 */
import { SEA_LEVEL } from './constants.js';
import { B } from './blocks.js';
import { floatingIslandsNear, heightAt } from './worldgen.js';
import {
  NullW, buildBeacon, hf, paletteFor,
} from './structuresKit.js';
import {
  beaconEntry, boxOf, chestEntry, makePlan, signEntry,
} from './structuresPlan.js';
import { circleShape, terraform } from './structuresTerrain.js';

const RISE = 22;

export const YUZENADA = {
  key: 'yuzenada',
  name: 'Yüzen Ada',
  plan(env) {
    const rng = env.rng;
    const R = rng.int(9, 11);
    const reach = R + 6;
    const cands = env.cands(14, 24, 24);
    let best = null;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      // sütun tabanı: adanın +x kenarının altı → kuru, düz
      const px = c.x + R;
      const pz = c.z;
      const hPil = heightAt(env.seed, px + 1, pz);
      const hCen = heightAt(env.seed, c.x, c.z);
      if (hPil < SEA_LEVEL + 2 || hCen < SEA_LEVEL - 4) continue;
      // tavan (y ≤ 104) yüzünden ada zemine gömülmesin: yükselti en az 14, ada üstü arazinin (halka dahil) üstünde kalmalı
      // (eskiden dağlık yerde topY=104'e kıskaçlanıp ada kayanın içinde kalıyor, sandık/sarmaşık erişilemiyordu)
      const topC = Math.min(104, hPil + RISE);
      if (topC - hPil < 14) continue;
      let hMax = Math.max(hPil, hCen);
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        hMax = Math.max(hMax, heightAt(env.seed, Math.round(c.x + Math.cos(a) * (R + 1)), Math.round(c.z + Math.sin(a) * (R + 1))));
      }
      if (hMax > topC - 4) continue;
      if (Math.abs(hPil - heightAt(env.seed, px, pz + 2)) > 3) continue;
      if (floatingIslandsNear(env.seed, c.x - 34, c.z - 34, c.x + 34, c.z + 34).length > 0) continue;
      const rect = { x0: c.x - reach, z0: c.z - reach, x1: c.x + reach + 4, z1: c.z + reach };
      if (!env.rectOk(rect, { x: c.x, z: c.z, r: reach + 3 })) continue;
      const score = Math.abs(hPil - hCen) + i * 0.5;
      if (!best || score < best.score) best = { x: c.x, z: c.z, hPil, hCen, rect, score };
    }
    if (!best) return null;
    env.biome = env.biomeAt(best.x, best.z);
    const pal = paletteFor(env.zone, env.biome);
    const groundY = best.hPil;
    const topY = Math.min(104, groundY + RISE);
    const cx = best.x;
    const cz = best.z;
    const O = { x: cx, y: topY + 1, z: cz };
    const L0 = NullW.local(O, 0);
    const chests = [];
    const cw = L0.toWorld(0, 0, 0);
    chests.push(chestEntry(env, cw.x, cw.y, cw.z, { kind: 'gizli', block: 'ödül', index: 0 }));
    const c1 = L0.toWorld(-4, 0, 3);
    chests.push(chestEntry(env, c1.x, c1.y, c1.z, { kind: 'gizli', index: 1 }));
    const vine = L0.toWorld(R + 1, 0, 0);
    const baseSign = { x: cx + R + 3, y: groundY + 1, z: cz };
    const entI = { x: cx + R + 1, y: groundY + 1, z: cz + 2 };
    const tier = Math.max(1, Math.min(5, env.difficulty));
    const text = 'Yüzen Ada: Taş sütunun yanındaki sarmaşıktan yukarı tırman. Tepede eski bir tapınak kalıntısı ve ödül sandığı var. '
      + 'Düşersen yüksekten düşme hasarı alırsın; yavaş çık.';
    const pub = {
      name: env.name,
      x: cx,
      y: topY + 1,
      z: cz,
      bounds: boxOf(cx - R - 1, groundY - 2, cz - R - 1, cx + R + 4, topY + 40, cz + R + 1),
      chests,
      island: { radius: R, topY, groundY },
      entrance: entI,
      ladder: { x: vine.x, bottomY: groundY + 1, topY: topY + 1, z: vine.z },
      signs: [signEntry(baseSign.x, baseSign.y, baseSign.z, text)],
      beacon: beaconEntry(cx, cz, topY + 12, Math.min(120, topY + 44), tier),
      tags: ['ada', 'sandık', 'tırmanış'],
    };
    const build = (W) => {
      if (!W.has(best.rect.x0, best.rect.z0, best.rect.x1, best.rect.z1)) return;
      const L = W.local(O, 0);
      terraform(W, circleShape(cx + R + 1, cz, 3), groundY, 3);
      // havada asılı hacim ve sütun/sarmaşık hattı: dev yağmur ormanı ağaçlarının tacı vb. temizlenir
      W.clearFloraBox(cx - R - 2, topY - Math.round(R * 1.15) - 3, cz - R - 2, cx + R + 4, topY + 16, cz + R + 2);
      W.clearFloraBox(cx + R - 1, groundY + 1, cz - 2, cx + R + 3, topY, cz + 3);
      drawIsland(L, pal, env, R, topY, groundY, chests, baseSign);
      buildBeacon(W, cx, cz, topY + 12, Math.min(120, topY + 44), tier);
    };
    return makePlan(env, Object.assign({}, pub, { rect: best.rect, build }));
  },
};

function drawIsland(L, p, env, R, topY, groundY, chests, baseSign) {
  const W = L.W;
  const grass = p.path === B.SNOW ? B.SNOW_GRASS : (p.path === B.SAND ? B.SAND : p.grass);
  const under = p.path === B.SAND ? B.SANDSTONE : B.DIRT;
  /* ada gövdesi (y yerel: üst yüzey ly=-1) */
  const depthMax = Math.round(R * 1.15);
  for (let k = 0; k < depthMax; k++) {
    const rk = R * (1 - k / (R * 1.2)) + (k === 0 ? 0 : -0.2);
    if (rk < 0.6) break;
    const rr = Math.floor(rk);
    const id = k === 0 ? grass : (k <= 2 ? under : (k % 3 === 0 ? p.wallAlt : B.STONE));
    L.cyl(0, 0, -1 - k, -1 - k, rr, id);
  }
  // alt sarkıtlar + kristaller
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9;
    const lx = Math.round((R * 0.45) * Math.sin(a));
    const lz = Math.round((R * 0.45) * Math.cos(a));
    L.fill(lx, -1 - depthMax, lz, lx, -depthMax + 1, lz, B.STONE);
    L.set(lx, -2 - depthMax, lz, k % 2 === 0 ? B.AMETHYST : B.CRYSTAL_ROCK);
  }
  /* tapınak kalıntısı: 7×9 zemin, sütunlar, kemer, sunak + sandık */
  L.fill(-3, -1, -4, 3, -1, 4, p.floor);
  for (let lz = -4; lz <= 4; lz++) {
    for (let lx = -3; lx <= 3; lx++) {
      if (hf(L.wx(lx, lz), 0, L.wz(lx, lz), 71) < 0.2) L.set(lx, -1, lz, p.floorAlt);
    }
  }
  for (const [lx, lz] of [[-3, -4], [3, -4], [-3, 4], [3, 4], [-3, 0], [3, 0]]) {
    const h = 3 + Math.floor(hf(L.wx(lx, lz), 1, L.wz(lx, lz), 72) * 4);
    L.fill(lx, 0, lz, lx, h, lz, p.pillar);
    if (h >= 5) L.set(lx, h + 1, lz, p.trim);
  }
  L.fill(-1, 0, -4, 1, 0, -4, p.wall);
  L.fill(-3, 6, 0, -3, 6, 4, p.trim);
  L.fill(-3, 7, 4, 0, 7, 4, p.trim);
  L.fill(-1, 0, -1, 1, 0, 1, p.trim);
  L.set(0, -1, 0, p.glow);
  L.W.set(chests[0].x, chests[0].y, chests[0].z, chests[0].block);
  L.set(-4, 0, 3, p.trim);
  L.W.set(chests[1].x, chests[1].y, chests[1].z, chests[1].block);
  L.set(-1, 0, -3, p.lamp);
  L.set(1, 0, -3, p.lamp);
  // çiçek ve çalı
  for (let k = 0; k < 16; k++) {
    const lx = Math.round((R - 2) * Math.sin(k * 1.3)) + (k % 3) - 1;
    const lz = Math.round((R - 2) * Math.cos(k * 1.3));
    L.setAir(lx, 0, lz, k % 3 === 0 ? B.FLOWER_YELLOW : (k % 3 === 1 ? B.FLOWER_RED : B.TALL_GRASS));
  }
  /* köprü ipucu: adanın −x ucundan dışarı uzanan kopuk köprü */
  for (let i = 0; i < 6; i++) {
    const lx = -R - 1 - i;
    if (i === 3 || i === 4) continue;
    L.set(lx, -1, 0, i % 2 === 0 ? p.trim : p.floor);
    if (i % 2 === 0) {
      L.set(lx, 0, 1, p.fence);
      L.set(lx, 0, -1, p.fence);
    }
  }
  L.set(-R - 6, 0, 0, p.lamp);
  /* sütun + sarmaşık merdiven (yerden ada kenarına) */
  const px = L.wx(R, 0);
  const pz = L.wz(R, 0);
  const wy = (ly) => L.oy + ly;
  W.pillarDown(px, wy(-2), pz, p.pillar, 90);
  for (let y = groundY + 1; y <= wy(0); y++) W.set(px + 1, y, pz, B.VINE);
  for (let y = groundY + 3; y < wy(-2); y += 5) {
    W.set(px, y, pz + 1, p.lamp);
    W.set(px, y, pz - 1, p.lamp);
  }
  W.set(px, groundY, pz, p.trim);
  W.set(baseSign.x, baseSign.y, baseSign.z, B.SIGN);
}
