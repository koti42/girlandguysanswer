/*
 * KEŞİF sim — Parkur yapısı (hücre planı): düzlenmiş plaza + merkez ışık kulesi + sarmal platform zinciri (parkourBuild.js).
 * Kademe bölge zorluğuna göre dağılır; çapa olarak "tier" verilebilir.
 */
import { SEA_LEVEL } from './constants.js';
import { B } from './blocks.js';
import { PARKOUR_TIERS, makeCourse } from './parkourBuild.js';
import { paletteFor } from './structuresKit.js';
import {
  beaconEntry, boxOf, chestEntry, fitPlatform, makePlan,
} from './structuresPlan.js';
import { platform, terraform } from './structuresTerrain.js';

/** Bölgeye göre kademe olasılıkları (1..5). */
export const TIER_WEIGHTS = Object.freeze([
  [0.55, 0.40, 0.05, 0, 0],
  [0.30, 0.40, 0.25, 0.05, 0],
  [0.10, 0.25, 0.40, 0.20, 0.05],
  [0, 0.10, 0.30, 0.40, 0.20],
  [0, 0, 0.10, 0.40, 0.50],
]);

export function pickTier(rng, zone) {
  const w = TIER_WEIGHTS[Math.max(0, Math.min(4, zone | 0))];
  const i = rng.weighted(w);
  return i < 0 ? 1 : i + 1;
}

export const PARKUR = {
  key: 'parkur',
  name: 'Parkur',
  plan(env) {
    const tier = env.extra && env.extra.tier ? env.extra.tier : pickTier(env.rng, env.zone);
    const T = PARKOUR_TIERS[tier];
    const rad = T.rho0 + 6;
    const reach = rad + 9;
    const site = env.site({
      hx: rad - 12, hz: rad - 12, maxVar: 22, maxMedian: 108 - T.rise, jx: 28, jz: 28, tries: 50, nx: 5,
      rect: (x, z) => platform(x, z, rad - 2, 6, { len: 22 }).rect,
      circle: (x, z) => ({ x, z, r: reach }),
    });
    if (!site) return null;
    env.biome = env.biomeAt(site.x, site.z);
    const pal = paletteFor(env.zone, env.biome);
    const floorY = Math.max(SEA_LEVEL + 2, Math.round(site.stats.median));
    const cx = site.x;
    const cz = site.z;
    const course = makeCourse({
      seed: env.seed, id: env.id, tier, zone: env.zone, cx, cz, floorY,
    });
    // plaza yarıçapı: en uzak platform köşesi + pay
    let far = 0;
    course.platforms.forEach((q) => {
      far = Math.max(far, Math.hypot(Math.abs(q.x0 - cx), Math.abs(q.z0 - cz)), Math.hypot(Math.abs(q.x1 - cx), Math.abs(q.z1 - cz)));
    });
    const plazaR = Math.ceil(far) + 2;
    const { plat, margin } = fitPlatform(env, { x: cx, z: cz, stats: site.stats }, plazaR, 6, { len: 22 }, (m) => ({ x: cx, z: cz, r: plazaR + m + 3 }));
    const rect = plat.rect;
    if (plazaR + 9 > reach + 8 || !env.rectOk(rect, { x: cx, z: cz, r: plazaR + margin + 3 })) return null;
    const ch = course.chest;
    const chests = [chestEntry(env, ch.x, ch.y, ch.z, { kind: 'parkur', block: 'ödül', index: 0, parkourTier: tier })];
    const sg = course.signs[0];
    const pub = {
      name: 'Parkur — ' + T.name,
      x: cx,
      y: floorY + 1,
      z: cz,
      bounds: boxOf(cx - plazaR, floorY - 2, cz - plazaR, cx + plazaR, course.beam.y1, cz + plazaR),
      chests,
      entrance: { x: course.start.x, y: course.start.y, z: course.start.z },
      signs: [{ x: sg.x, y: sg.y, z: sg.z, text: sg.text }],
      parkour: {
        id: env.id,
        tier,
        tierName: T.name,
        start: course.start,
        end: course.end,
        checkpoints: course.checkpoints,
        chest: { x: ch.x, y: ch.y, z: ch.z },
        rect: course.rect,
        fallMargin: course.fallMargin,
        minY: course.minY,
        maxY: course.maxY,
        platforms: course.platforms.map((q) => ({
          kind: q.kind, x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1, y: q.y,
        })),
        dynamics: course.dynamics,
        grapple: course.grapple,
        glide: course.glide,
      },
      beacon: beaconEntry(course.beam.x, course.beam.z, course.beam.y0 + 2, course.beam.y1, tier),
      tags: ['parkur', T.key],
    };
    const build = (W) => {
      if (!W.has(rect.x0, rect.z0, rect.x1, rect.z1)) return;
      terraform(W, plat.shape, floorY, margin);
      // plaza süsü: kuleye giden halka
      const topId = pal.floor;
      W.paint(cx - 7, floorY, cz - 7, cx + 7, floorY, cz + 7, (x, y, z) => {
        const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
        if (d2 > 36) return -1;
        return d2 > 20 && d2 <= 26 ? pal.glow : ((x + z) & 1 ? pal.floorAlt : topId);
      });
      course.build(W);
      const s = course.signs[0];
      W.set(s.x, s.y, s.z, B.SIGN);
    };
    const plan = makePlan(env, Object.assign({}, pub, { rect, build }));
    plan.course = course;
    return plan;
  },
};
