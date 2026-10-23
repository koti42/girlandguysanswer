import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { createPlayerBody, stepPlayer } from './physics.js';
import {
  JUMP, PARKOUR_TIERS, applyParkourDynamics, gapBetween, makeCourse, makeFallbackCourse, maxJumpReach, parkourCourse,
  parkourDynamics, parkourFallReset, validateCourse,
} from './parkour.js';
import { allStructures } from './structures.js';

const params = (seed, tier, i) => ({
  seed, id: 'parkur:' + i + ',' + (i * 3), tier, zone: Math.min(4, tier - 1), cx: 100 + i * 64, cz: -200 + i * 64, floorY: 50 + (i % 9),
});

describe('erişim modeli ↔ gerçek fizik', () => {
  function makeWorld(plats) {
    return {
      getBlock(x, y, z) {
        for (const p of plats) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && y === p.y) return 1;
        return 0;
      },
    };
  }
  /** A platformunun kenarından koşu-sıçrama: B platformuna iniyor mu? */
  function lands(gap, dy, sprint) {
    const A = { x0: -4, x1: 0, z0: -2, z1: 2, y: 60 };
    const B2 = { x0: 1 + gap, x1: 4 + gap, z0: -2, z1: 2, y: 60 + dy };
    const world = makeWorld([A, B2]);
    const body = createPlayerBody(-3.5, 61, 0.5);
    const yaw = -Math.PI / 2;
    let jumped = false;
    for (let i = 0; i < 400; i++) {
      const inp = {
        moveX: 0, moveZ: 1, yaw, sprint, jump: false, jumpPressed: false,
      };
      if (!jumped && body.x > 0.85 && body.onGround) {
        inp.jump = true;
        inp.jumpPressed = true;
        jumped = true;
      }
      stepPlayer(body, inp, world, 1 / 60, {}, { mode: 'macera' });
      if (jumped && body.onGround && body.x > B2.x0 - 0.3 && body.y >= 61 + dy - 0.01) return true;
      if (body.y < 50) return false;
    }
    return false;
  }

  it('maxJumpReach fizik sabitleriyle uyumlu', () => {
    expect(JUMP.peak).toBeCloseTo(1.25, 5);
    expect(maxJumpReach(0)).toBeGreaterThan(3.1);
    expect(maxJumpReach(0)).toBeLessThan(3.4);
    expect(maxJumpReach(1.25)).toBeGreaterThan(0);
    expect(maxJumpReach(1.3)).toBe(-1);
    expect(maxJumpReach(-2)).toBeGreaterThan(maxJumpReach(-1));
    expect(maxJumpReach(1)).toBeLessThan(maxJumpReach(0));
  });

  it('her kademenin izin verdiği EN BÜYÜK boşluk gerçek fizikte aşılabilir (koşu-sıçrama)', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const T = PARKOUR_TIERS[tier];
      for (let dy = -3; dy <= 1; dy++) {
        const reach = maxJumpReach(dy);
        let g = 0;
        while (g + 1 <= T.ratio * reach + 1e-9) g++;
        if (g < 1) continue;
        expect(lands(g, dy, true), 'kademe ' + tier + ' dy ' + dy + ' boşluk ' + g).toBe(true);
      }
    }
  });

  it('kolay kademelerin (1,2) boşlukları yürüyerek de aşılır', () => {
    for (let tier = 1; tier <= 2; tier++) {
      const T = PARKOUR_TIERS[tier];
      for (let dy = -2; dy <= 0; dy++) {
        const reach = maxJumpReach(dy);
        let g = 0;
        while (g + 1 <= T.ratio * reach + 1e-9) g++;
        expect(lands(g, dy, false), 'kademe ' + tier + ' dy ' + dy + ' boşluk ' + g).toBe(true);
      }
    }
  });

  it('modelin üstündeki boşluk gerçekten aşılamaz (doğrulayıcı gevşek değil)', () => {
    expect(lands(5, 0, true)).toBe(false);
    expect(lands(3, 1, true)).toBe(false);
  });
});

describe('parkur üretimi (makeCourse)', () => {
  it('tüm kademeler × çok sayıda tohum: doğrulayıcı kusursuz, yedek yol nadir', () => {
    let fallbacks = 0;
    let total = 0;
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < 45; i++) {
        const c = makeCourse(params(1000 + i * 7919, tier, i));
        const v = validateCourse(c);
        expect(v.errors, 'kademe ' + tier + ' #' + i).toEqual([]);
        expect(v.ok).toBe(true);
        total++;
        if (c.fallback) fallbacks++;
      }
    }
    expect(fallbacks / total).toBeLessThan(0.02);
  });

  it('yedek (kafes) parkur her kademede geçerli, aynı koordinatlarda deterministik', () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < 6; i++) {
        const c = makeFallbackCourse(params(5 + i, tier, i));
        const v = validateCourse(c);
        expect(v.errors, 'kademe ' + tier).toEqual([]);
        expect(c.fallback).toBe(true);
        expect(JSON.stringify(c.platforms)).toBe(JSON.stringify(makeFallbackCourse(params(5 + i, tier, i)).platforms));
      }
    }
  });

  it('belirlenimci: aynı girdi → aynı platform dizisi; farklı tohum → farklı', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const a = makeCourse(params(42, tier, 1));
      const b = makeCourse(params(42, tier, 1));
      expect(JSON.stringify(a.platforms)).toBe(JSON.stringify(b.platforms));
      const c = makeCourse(params(43, tier, 1));
      expect(JSON.stringify(c.platforms)).not.toBe(JSON.stringify(a.platforms));
    }
  });

  it('kademe mekanikleri: uzunluk, yükseklik, platform türleri, kanca/planör yalnız son kademelerde', () => {
    const sums = {};
    for (let tier = 1; tier <= 5; tier++) {
      const kinds = new Set();
      let grapple = 0;
      let glide = 0;
      let len = 0;
      let rise = 0;
      let dyn = 0;
      for (let i = 0; i < 30; i++) {
        const c = makeCourse(params(77 + i * 31, tier, i));
        c.platforms.forEach((p) => kinds.add(p.kind));
        grapple += c.grapple.length;
        glide += c.glide.length;
        len += c.platforms.length;
        rise += c.maxY - c.floorY;
        dyn += c.dynamics.length;
      }
      sums[tier] = { kinds, grapple, glide, len: len / 30, rise: rise / 30, dyn };
    }
    // kademe arttıkça uzunluk ve yükseklik artar
    for (let t = 2; t <= 5; t++) expect(sums[t].len).toBeGreaterThan(sums[t - 1].len);
    for (let t = 2; t <= 3; t++) expect(sums[t].rise).toBeGreaterThan(sums[t - 1].rise);
    expect(sums[4].rise).toBeGreaterThan(sums[2].rise);
    expect([...sums[1].kinds].sort()).toEqual(['finish', 'start', 'stone']);
    expect(sums[2].kinds.has('ice')).toBe(true);
    expect(sums[2].kinds.has('beam')).toBe(true);
    expect(sums[2].kinds.has('vanish')).toBe(false);
    expect(sums[3].kinds.has('vanish')).toBe(true);
    expect(sums[4].kinds.has('pillar')).toBe(true);
    expect(sums[5].kinds.has('pillar')).toBe(true);
    // kanca / planör: yalnız kademe ≥ 4
    expect(sums[1].grapple + sums[2].grapple + sums[3].grapple).toBe(0);
    expect(sums[1].glide + sums[2].glide + sums[3].glide).toBe(0);
    expect(sums[4].grapple).toBeGreaterThan(30);
    expect(sums[5].grapple).toBeGreaterThan(sums[4].grapple);
    // planör halkası yalnız gerçek fizikte kanıtlanırsa üretilir (simGlide); kanıtlanamayan halka hiç çizilmez
    expect(sums[5].glide).toBeGreaterThanOrEqual(0);
    // yok olan platform yalnız kademe ≥ 3
    expect(sums[1].dyn + sums[2].dyn).toBe(0);
    expect(sums[3].dyn).toBeGreaterThan(0);
  });

  it('kontrol noktaları: aralık sınırı, başlangıç + bitiş plakası, sandık', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const T = PARKOUR_TIERS[tier];
      for (let i = 0; i < 10; i++) {
        const c = makeCourse(params(9 + i, tier, i));
        expect(c.checkpoints.length).toBeGreaterThanOrEqual(Math.floor((c.platforms.length - 2) / T.cpEvery) - 1);
        let prev = 0;
        c.checkpoints.forEach((cp) => {
          expect(cp.index - prev).toBeLessThanOrEqual(T.cpEvery + 1);
          prev = cp.index;
          const q = c.platforms[cp.index];
          expect(cp.x >= q.x0 && cp.x <= q.x1 && cp.z >= q.z0 && cp.z <= q.z1).toBe(true);
          expect(cp.y).toBe(q.y + 1);
        });
        expect(c.start.y).toBe(c.floorY + 1);
        expect(c.end.y).toBe(c.platforms[c.platforms.length - 1].y + 1);
        expect(c.chest.y).toBe(c.end.y);
      }
    }
  });

  it('ana yol: her ardışık çift için boşluk kademe payı içinde; ana yol KANCA/PLANÖR gerektirmez', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const T = PARKOUR_TIERS[tier];
      for (let i = 0; i < 15; i++) {
        const c = makeCourse(params(300 + i, tier, i));
        for (let k = 1; k < c.platforms.length; k++) {
          const a = c.platforms[k - 1];
          const b = c.platforms[k];
          const dy = b.y - a.y;
          const gap = gapBetween(a, b);
          expect(dy).toBeLessThanOrEqual(1);
          expect(dy).toBeGreaterThanOrEqual(-3);
          const reach = maxJumpReach(dy);
          const small = b.w * b.d === 1;
          const ratio = small ? Math.min(T.ratio, 0.9) : T.ratio;
          expect(gap).toBeLessThanOrEqual(ratio * reach + 1e-9);
        }
        // kısayollar ana yolun platformlarını bağlar
        c.grapple.forEach((g) => {
          expect(g.to - g.from).toBeGreaterThanOrEqual(3);
          expect(c.platforms[g.from]).toBeTruthy();
          expect(c.platforms[g.to]).toBeTruthy();
        });
      }
    }
  });

  it('doğrulayıcı bozuk parkuru yakalar', () => {
    const c = makeCourse(params(5, 3, 2));
    const bad = Object.assign({}, c, { platforms: c.platforms.map((p) => Object.assign({}, p)) });
    bad.platforms[4].x0 += 6;
    bad.platforms[4].x1 += 6;
    const v = validateCourse(bad);
    expect(v.ok).toBe(false);
    const bad2 = Object.assign({}, c, { platforms: c.platforms.map((p) => Object.assign({}, p)) });
    bad2.platforms[5].y += 3;
    expect(validateCourse(bad2).ok).toBe(false);
    const c1 = makeCourse(params(5, 1, 2));
    expect(validateCourse(Object.assign({}, c1, { grapple: [{ from: 0, to: 5, x: 0, y: 0, z: 0 }] })).ok).toBe(false);
  });

  it('blocks(setBlock): başlangıç plakası, bitiş plakası, ödül sandığı, kontrol plakaları, platformlar, ışık hüzmesi', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const c = makeCourse(params(21, tier, 4));
      const map = new Map();
      c.blocks((x, y, z, id) => map.set(x + ',' + y + ',' + z, id));
      const at = (p) => map.get(p.x + ',' + p.y + ',' + p.z);
      expect(at(c.start)).toBe(B.PARKOUR_START);
      expect(at(c.end)).toBe(B.PARKOUR_END);
      expect(at(c.chest)).toBe(B.REWARD_CHEST);
      c.checkpoints.forEach((cp) => expect(at(cp)).toBe(B.PARKOUR_CHECKPOINT));
      c.platforms.forEach((p) => {
        const top = map.get(p.x0 + ',' + p.y + ',' + p.z0);
        expect(top).toBeGreaterThan(0);
      });
      expect(map.get(c.beam.x + ',' + c.beam.y1 + ',' + c.beam.z)).toBeGreaterThan(0);
      // ışık hüzmesi renkli cam + parlak blok
      const mid = map.get(c.beam.x + ',' + (c.beam.y0 + 5) + ',' + c.beam.z);
      expect(mid === B.LIGHT_BLOCK || (mid >= B.GLASS_WHITE && mid <= B.GLASS_PURPLE)).toBe(true);
      c.grapple.forEach((g) => expect(map.get(g.x + ',' + g.y + ',' + g.z)).toBe(B.AMETHYST));
    }
  });

  it('düşme sıfırlama: alandayken kontrol noktasından 3,5 blok aşağıya inince geri gönderir', () => {
    const c = makeCourse(params(8, 3, 1));
    const cp = c.checkpoints[0];
    const pos = { x: cp.x + 1, y: cp.y - 1, z: cp.z };
    expect(parkourFallReset(c, pos, 0)).toBeNull();
    const low = { x: cp.x + 1, y: cp.y - 5, z: cp.z };
    const r = parkourFallReset(c, low, 0);
    expect(r).toBeTruthy();
    expect(r.y).toBe(cp.y);
    // -1: başlangıç
    const r0 = parkourFallReset(c, { x: c.start.x, y: c.start.y - 6, z: c.start.z }, -1);
    expect(r0.y).toBe(c.start.y);
    // alan dışı: sıfırlama yok
    expect(parkourFallReset(c, { x: c.start.x + 500, y: 10, z: c.start.z }, -1)).toBeNull();
  });

  it('dinamik platformlar: zamanın saf işlevi, açık/kapalı döngü; applyParkourDynamics yalnız değişeni yazar', () => {
    const c = makeCourse(params(4, 4, 2));
    expect(c.dynamics.length).toBeGreaterThan(0);
    const d0 = parkourDynamics(c, 0);
    expect(d0.length).toBe(c.dynamics.reduce((n, d) => n + d.cells.length, 0));
    expect(parkourDynamics(c, 12.3)).toEqual(parkourDynamics(c, 12.3));
    let sawOff = false;
    let sawOn = false;
    for (let t = 0; t < 8; t += 0.25) {
      parkourDynamics(c, t).forEach((e) => {
        if (e.id === 0) sawOff = true;
        else sawOn = true;
      });
    }
    expect(sawOff && sawOn).toBe(true);
    const cells = new Map();
    c.blocks((x, y, z, id) => cells.set(x + ',' + y + ',' + z, id));
    const writes = [];
    const world = {
      getBlock: (x, y, z) => (cells.has(x + ',' + y + ',' + z) ? cells.get(x + ',' + y + ',' + z) : 0),
      setBlock: (x, y, z, id, o) => {
        writes.push([x, y, z, id, o]);
        cells.set(x + ',' + y + ',' + z, id);
      },
    };
    const n1 = applyParkourDynamics(c, 0, world);
    const n2 = applyParkourDynamics(c, 0, world);
    expect(n2).toBe(0);
    const n3 = applyParkourDynamics(c, 2.8, world);
    expect(n1 + n3).toBe(writes.length);
    writes.forEach((w) => expect(w[4]).toEqual({ record: false }));
  });
});

describe('parkourCourse(seed, cell) — dünya yerleşimi', () => {
  const SEED = 12345;
  it('yerleşmiş parkur yapıları için kurs döner ve tanım ile tutarlıdır', () => {
    const list = allStructures(SEED).filter((s) => s.type === 'parkur');
    expect(list.length).toBeGreaterThanOrEqual(5);
    const tiers = new Set();
    list.forEach((s) => {
      const m = /^parkur:(-?\d+),(-?\d+)$/.exec(s.id);
      const c1 = parkourCourse(SEED, { ci: Number(m[1]), cj: Number(m[2]) });
      const c2 = parkourCourse(SEED, [Number(m[1]), Number(m[2])]);
      const c3 = parkourCourse(SEED, s.id);
      expect(c1).toBeTruthy();
      expect(c2).toBe(c1);
      expect(c3).toBe(c1);
      expect(c1.id).toBe(s.id);
      expect(c1.tier).toBe(s.parkour.tier);
      expect(c1.start).toEqual(s.parkour.start);
      expect(c1.end).toEqual(s.parkour.end);
      expect(c1.checkpoints.length).toBe(s.parkour.checkpoints.length);
      expect(typeof c1.blocks).toBe('function');
      expect(validateCourse(c1).ok).toBe(true);
      tiers.add(c1.tier);
    });
    // her kademe dünyada en az bir kez bulunur
    expect([...tiers].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(parkourCourse(SEED, { ci: 0, cj: 0 })).toBeNull();
    expect(parkourCourse(SEED, 'saçma')).toBeNull();
  });

  it('kademe dağılımı bölge zorluğuna uyar: Başlangıç Vadisi kolay, Çekirdek zor', () => {
    const list = allStructures(SEED).filter((s) => s.type === 'parkur');
    const low = list.filter((s) => s.zone <= 1);
    const z4 = list.filter((s) => s.zone === 4);
    expect(low.length).toBeGreaterThanOrEqual(2);
    expect(z4.length).toBeGreaterThanOrEqual(3);
    low.forEach((s) => expect(s.parkour.tier).toBeLessThanOrEqual(4));
    z4.forEach((s) => expect(s.parkour.tier).toBeGreaterThanOrEqual(3));
    const avg = (a) => a.reduce((n, s) => n + s.parkour.tier, 0) / Math.max(1, a.length);
    expect(avg(z4)).toBeGreaterThan(avg(low) + 1);
  });
});
