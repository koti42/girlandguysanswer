import { describe, expect, it } from 'vitest';
import { citySeed } from '../cityPlanTestKit.js';
import { InteriorBuilder, PROP_SLOT0 } from './builder.js';
import { makeFrame } from './frame.js';
import { MAX_LIGHTS_PER_ROOM, planReachability, validateInterior } from './graph.js';
import { interiorLots } from './testKit.js';

const SEEDS = [1, 2, 3].map(citySeed);

function ctxFor(bp, lot, mirror, extra) {
  return {
    frame: makeFrame(bp, lot, { mirror: !!mirror }), bp, lot, kind: bp.interior.kind, variant: bp.interior.variant, ...extra,
  };
}

function plain(filter, n) {
  const out = [];
  SEEDS.forEach((s) => interiorLots(s, { filter: (bp) => makeFrame(bp, null, {}).obstacles.length === 0 && (!filter || filter(bp)), limit: n }).forEach((q) => out.push(q)));
  return out;
}

/** 'a' (ön) + 'b' (arka) iki oda, aralarında 3 geniş kapı. */
function twoRooms(ctx, doorW) {
  const f = ctx.frame;
  const b = new InteriorBuilder(ctx);
  const k = f.D >> 1;
  b.room('a', [0, 0, f.W, k]);
  b.room('b', [0, k + 1, f.W, f.D]);
  const c = Math.max(2, Math.min(f.W - 3, f.door.u));
  const door = b.door('d0', 'a', 'b', {
    axis: 'u', line: k, c, w: doorW || 3, kind: 'door',
  });
  return { b, f, k, c, door };
}

const f2 = (b) => b.D - 2;

describe('InteriorBuilder — odalar ve kapılar', () => {
  it('room: dünya kutusu çerçeveyle eş; çerçeve dışı, çakışan, yinelenen reddedilir', () => {
    const { bp, lot } = plain(null, 1)[0];
    const ctx = ctxFor(bp, lot, false);
    const b = new InteriorBuilder(ctx);
    const r = b.room('x', [1, 1, 5, 4]);
    expect([r.wx0, r.wz0, r.wx1, r.wz1]).toEqual(ctx.frame.rect(1, 1, 5, 4));
    expect(() => b.room('x', [6, 6, 8, 8])).toThrow(/yinelendi/);
    expect(() => b.room('y', [3, 3, 7, 7])).toThrow(/çakışıyor/);
    expect(() => b.room('z', [-1, 0, 3, 3])).toThrow(/geçersiz/);
    expect(() => b.room('z', [0, 0, ctx.frame.W + 1, 3])).toThrow(/geçersiz/);
    expect(() => b.room('z', [0, 0, 3, 3], { y0: 0, y1: 1 })).toThrow(/geçersiz/);
    expect(() => b.room('z', [6, 6, 8, 8], { y1: ctx.frame.H + 1 })).toThrow(/geçersiz/);
    // yükseklikçe ayrık aynı ayak izi geçerli (asma kat)
    const lo = new InteriorBuilder(ctx);
    lo.room('alt', [0, 0, 4, 4], { y0: 0, y1: 2 });
    expect(() => lo.room('ust', [0, 0, 4, 4], { y0: 3, y1: ctx.frame.H })).not.toThrow();
    expect(() => lo.room('ust2', [0, 0, 4, 4], { y0: 1, y1: 4 })).toThrow(/çakışıyor/);
  });

  it('door: 4 yüz × ayna: kapı hücreleri iki oda arasındaki duvar çizgisinde (doğrulayıcı), axis dünya eksenine çevrilir', () => {
    let n = 0;
    ['n', 's', 'e', 'w'].forEach((face) => {
      const lots = SEEDS.map((s) => interiorLots(s, { faces: [face], limit: 6, filter: (bp) => makeFrame(bp, null, {}).obstacles.length === 0 })).reduce((a, q) => a.concat(q), []);
      expect(lots.length).toBeGreaterThan(3);
      lots.forEach(({ bp, lot }) => {
        [false, true].forEach((mirror) => {
          const ctx = ctxFor(bp, lot, mirror);
          [1, 3].forEach((w) => {
            const { b, door } = twoRooms(ctx, w);
            const it = b.build();
            expect(it.doors.find((d) => d.id === 'd0').axis).toBe(door.axis);
            const sameAxis = (face === 'n' || face === 's') ? 'x' : 'z';
            expect(door.axis).toBe(sameAxis); // duvar u boyunca uzanır → kapı genişliği kapı duvarıyla aynı dünya ekseninde
            const v = validateInterior(it);
            expect(v.errors, `${face} ${mirror} w${w}`).toEqual([]);
            n++;
          });
        });
      });
    });
    expect(n).toBeGreaterThan(40);
  });

  it('kapı propu: kind door için kapi/kapi_genis eklenir (slot≥64, propSlot), arch için eklenmez; kilit saklanır; dikey geçit', () => {
    const { bp, lot } = plain((x) => makeFrame(x, null, {}).W >= 8, 1)[0];
    const ctx = ctxFor(bp, lot, false);
    const f = ctx.frame;
    const k = f.D >> 1;
    const b = new InteriorBuilder(ctx);
    b.room('a', [0, 0, f.W, k]);
    b.room('b', [0, k + 1, f.W, f.D]);
    const d0 = b.door('d0', 'a', 'b', {
      axis: 'u', line: k, c: f.W - 3, w: 3, kind: 'door',
    });
    const d1 = b.door('d1', 'a', 'b', {
      axis: 'u', line: k, c: 1, w: 1, kind: 'door', lock: { id: 'L1', kind: 'kod', tier: 1, data: { kod: [1, 2, 3] } },
    });
    const d2 = b.door('d2', 'a', 'b', {
      axis: 'u', line: k, c: (f.W >> 1) - 1, w: 1, kind: 'arch',
    });
    const it = b.build();
    const kinds = it.props.map((p) => p.kind);
    expect(kinds.filter((x) => x === 'kapi_genis').length).toBe(1);
    expect(kinds.filter((x) => x === 'kapi').length).toBe(1);
    expect(d0.propSlot).toBeGreaterThanOrEqual(PROP_SLOT0);
    expect(d1.propSlot).toBe(d0.propSlot + 1);
    expect(d2.propSlot).toBeUndefined();
    expect(it.doors.find((d) => d.id === 'd1').lock).toEqual({ id: 'L1', kind: 'kod', tier: 1, data: { kod: [1, 2, 3] } });
    expect(it.doors.some((d) => 'lu' in d || 'lv' in d || 'lax' in d)).toBe(false);
    expect(validateInterior(it).errors).toEqual([]);
    const v = new InteriorBuilder(ctx);
    v.room('a', [0, 0, 6, 6], { y0: 0, y1: 2 });
    v.room('b', [0, 0, 6, 6], { y0: 3, y1: ctx.frame.H });
    const sv = v.vertical('m', 'a', 'b', { kind: 'stair', from: [0, 1], to: [5, 1], rect: [1, 1, 5, 3] });
    expect(sv.kind).toBe('stair');
    expect(sv.rect.x1 - sv.rect.x0 > 0).toBe(true);
  });

  it('lockPad: kapının yanına duvar propu (tür → katalog anahtarı); oda dışına taşmaz; geçerli kalır', () => {
    let placed = 0;
    plain(null, 12).forEach(({ bp, lot }) => {
      const ctx = ctxFor(bp, lot, false);
      const { b, door } = twoRooms(ctx, 1);
      const a = b.lockPad(door, 'a', 'kod');
      const c = b.lockPad(door, 'b', 'kart');
      const h = b.lockPad(door, 'a', 'mini_hack');
      if (a) { expect(a.kind).toBe('kod_paneli'); placed++; }
      if (c) expect(c.kind).toBe('kart_okuyucu');
      if (h) expect(h.kind).toBe('hack_terminali');
      const it = b.build();
      expect(validateInterior(it).errors).toEqual([]);
    });
    expect(placed).toBeGreaterThan(5);
  });
});

describe('InteriorBuilder — proplar', () => {
  it('prop: yaw yerel yönle eş (ly 0 = içeri); konum hücre merkezi; varyant, slot sırası; bilinmeyen anahtar null', () => {
    plain(null, 6).forEach(({ bp, lot }) => {
      [false, true].forEach((mirror) => {
        const ctx = ctxFor(bp, lot, mirror);
        const f = ctx.frame;
        const b = new InteriorBuilder(ctx);
        b.room('r', [0, 0, f.W, f.D]);
        const p = b.prop('koli', 1, 3, 1, { variant: 5 });
        expect(p).not.toBeNull();
        const pt = f.pt(1, 3);
        expect(p.x).toBeCloseTo(pt[0], 9);
        expect(p.z).toBeCloseTo(pt[1], 9);
        expect(p.y).toBe(64);
        expect(p.yaw).toBe(f.yaw(1));
        expect(p.variant).toBe(5);
        expect(p.slot).toBe(PROP_SLOT0);
        expect(p.lotId).toBe(lot.id);
        const q = b.prop('sandalye', f.W - 2, f.D - 2, 0);
        expect(q.slot).toBe(PROP_SLOT0 + 1);
        expect(b.prop('olmayan_prop', 4, 4, 0)).toBeNull();
        expect(b.prop('koli', 1, 3, 0)).toBeNull(); // aynı hücre: çarpışma
        expect(b.prop('koli', -1, 0, 0)).toBeNull();
        expect(b.prop('koli', f.W, 0, 0)).toBeNull();
        // sıra sonrası slot sayacı başarısızlarda ilerlemez
        expect(b.prop('koli', f.W - 2, 3, 0).slot).toBe(PROP_SLOT0 + 2);
      });
    });
  });

  it('duvar propu duvara yaslanır ve odaya bakar; yüzey ve tavan proplarının y değeri', () => {
    const { bp, lot } = plain(null, 1)[0];
    const ctx = ctxFor(bp, lot, false);
    const f = ctx.frame;
    const b = new InteriorBuilder(ctx);
    b.room('r', [0, 0, f.W, f.D]);
    // arka duvar (v = D): hücre (5, D-1), duvar yönü = içeri (ly 0)
    const w = b.wallProp('tuval', 5, f.D - 1, 0);
    expect(w).not.toBeNull();
    const c = f.pt(5, f.D - 1);
    const dv = f.dir(0);
    // anahtar: duvar yüzüne yakın (hücre merkezinden 0.4 duvara doğru), yüzü odaya (ters yön) bakar
    expect((w.x - c[0]) * dv[0] + (w.z - c[1]) * dv[1]).toBeGreaterThan(0.3);
    expect(w.yaw).toBe(f.yaw(2));
    expect(w.y).toBe(65);
    // yan duvar (u=0): sol
    const w2 = b.wallProp('cerceve', 0, 6, 3, { y: 2 });
    expect(w2.y).toBe(66);
    expect(w2.yaw).toBe(f.yaw(1));
    // duvar propu yanlış çağrı: side olmadan wall mount → null
    expect(b.prop('tuval', 4, 4, 0)).toBeNull();
    // yüzey: masa üstü lamba y = 0.875 varsayılan
    const m = b.prop('masa', 8, 6, 0);
    expect(m).not.toBeNull();
    const l = b.prop('masa_lambasi', 8, 6, 0);
    expect(l.y).toBeCloseTo(64.875, 9); // çarpışmasız: örtüşme sorunu yok
    // tavan: alt kenar = tavan − yükseklik
    const t = b.prop('asili_lamba', 3, 3, 0);
    expect(t.y).toBeCloseTo(64 + f.H - 1, 9);
    // tüm bunlar doğrulayıcıdan geçer (tek oda, giriş odası)
    const bb = new InteriorBuilder(ctx);
    bb.room('r', [0, 0, f.W, f.D]);
    bb.wallProp('tuval', 5, f.D - 1, 0);
    bb.prop('asili_lamba', 3, 5, 0);
    expect(validateInterior(bb.build(), { reach: true }).errors).toEqual([]);
  });

  it('kapı önü 3×2 boş: prop reddedilir; sonradan eklenen kapı yüzünden son süzgeçte atılır (dropped)', () => {
    const { bp, lot } = plain((x) => x.interior.kind !== 'kapsul_daire', 1)[0];
    const ctx = ctxFor(bp, lot, false);
    const { b, f, k, c } = twoRooms(ctx, 3);
    // kapı (c, line k): A odası tarafındaki hücre (c, k-1) kapı önü
    expect(b.prop('koli', c, k - 1, 0)).toBeNull();
    expect(b.prop('koli', c + 1, k - 2, 0)).toBeNull(); // 2 derin bölge
    expect(b.prop('koli', c, k + 2, 0)).toBeNull(); // B tarafı
    // sokak kapısı içi
    expect(b.prop('koli', f.door.u, 0, 0)).toBeNull();
    // geç kapı: önce prop, sonra kapı
    const b2 = new InteriorBuilder(ctxFor(bp, lot, false));
    b2.room('a', [0, 0, f.W, k]);
    b2.room('b', [0, k + 1, f.W, f.D]);
    const late = b2.prop('koli', 1, k - 1, 0);
    expect(late).not.toBeNull();
    b2.door('d0', 'a', 'b', {
      axis: 'u', line: k, c: 2, w: 1, kind: 'door',
    });
    const it = b2.build();
    expect(b2.dropped.length).toBe(1);
    expect(it.props.some((p) => p.kind === 'koli')).toBe(false);
    expect(validateInterior(it).errors).toEqual([]);
  });

  it('koruma (guard): dar odayı sokaktan koparan çarpışmalı prop reddedilir; guard:false ile kabul edilir', () => {
    const lots = plain((x) => { const q = makeFrame(x, null, {}); return q.W <= 12 && q.D >= 11 && q.W >= 6; }, 4);
    expect(lots.length).toBeGreaterThan(0);
    lots.forEach(({ bp, lot }) => {
      const run = (guard) => {
        const ctx = ctxFor(bp, lot, false, { guard });
        const f = ctx.frame;
        const b = new InteriorBuilder(ctx);
        b.room('a', [0, 0, f.W, 3]);
        b.room('b', [2, 4, 4, f.D]); // 2 geniş uzun oda
        b.door('d0', 'a', 'b', {
          axis: 'u', line: 3, c: 2, w: 1, kind: 'arch',
        });
        const first = b.prop('koli', 2, 6, 0);
        const second = b.prop('koli', 3, 6, 0);
        return { first, second, b };
      };
      const g = run(true);
      expect(g.first).not.toBeNull();
      expect(g.second).toBeNull(); // koridoru tamamen kapatırdı
      const r = planReachability(g.b.build());
      expect(r.unreachableRooms).toEqual([]);
      const o = run(false);
      expect(o.first).not.toBeNull();
      expect(o.second).not.toBeNull();
      // slot geri alındı: sonraki yerleşim aynı slotu alır
      expect(g.b.prop('koli', 3, f2(g.b), 0)).not.toBeNull();
    });
  });

  it('çekirdek engeli: engel hücresine prop ve ışık konmaz', () => {
    const towers = interiorLots(SEEDS[0], { filter: (b) => makeFrame(b, null, {}).obstacles.length > 0, limit: 3 });
    expect(towers.length).toBeGreaterThan(0);
    towers.forEach(({ bp, lot }) => {
      const ctx = ctxFor(bp, lot, false);
      const f = ctx.frame;
      const b = new InteriorBuilder(ctx);
      b.room('r', [0, 0, f.W, f.D]);
      const o = f.obstacles[0];
      expect(b.prop('koli', o.u0, o.v0, 0)).toBeNull();
      expect(b.light('r', o.u0, o.v0, 'lantern')).toBeNull();
      expect(b.prop('koli', o.u0, o.v0, 0)).toBeNull();
    });
  });
});

describe('InteriorBuilder — ışık, aksan, çip, imza, çıktı', () => {
  it('ışık: oda başına ≤4, oda dışı reddedilir, panel tavan satırında, diğerleri üst hava satırında; seviye türden', () => {
    const { bp, lot } = plain(null, 1)[0];
    const ctx = ctxFor(bp, lot, false);
    const f = ctx.frame;
    const b = new InteriorBuilder(ctx);
    b.room('r', [0, 0, f.W, f.D]);
    const p = b.light('r', 2, 2, 'panel');
    expect(p.y).toBe(64 + f.H);
    expect(p.level).toBe(15);
    const l = b.light('r', 4, 2, 'lantern');
    expect(l.y).toBe(64 + f.H - 1);
    expect(l.level).toBe(14);
    expect(b.light('r', 6, 2, 'neon_pink').level).toBe(12);
    expect(b.light('r', 8, 2, 'holo').level).toBe(8);
    for (let i = 0; i < 3; i++) expect(b.light('r', 1, 1 + i, 'panel')).toBeNull();
    expect(MAX_LIGHTS_PER_ROOM).toBe(4);
    expect(b.light('r', f.W + 1, 0, 'panel')).toBeNull();
    expect(b.light('r', 1, 1, 'olmayan')).toBeNull();
    expect(() => b.light('yok', 1, 1, 'panel')).toThrow(/bilinmeyen oda/);
  });

  it('lightGrid: 1..4 ışık düzenli dağıtılır, tavan başına ≤4, engel hücresine konmaz', () => {
    const { bp, lot } = plain((x) => makeFrame(x, null, {}).W >= 8, 1)[0];
    [1, 2, 3, 4, 6].forEach((n) => {
      const b = new InteriorBuilder(ctxFor(bp, lot, false));
      const f = b.frame;
      b.room('r', [0, 0, f.W, f.D]);
      const ls = b.lightGrid('r', n, 'lantern');
      expect(ls.length).toBe(Math.min(n, MAX_LIGHTS_PER_ROOM));
      expect(new Set(ls.map((l) => l.x + ',' + l.z)).size).toBe(ls.length);
      expect(validateInterior(b.build(), { reach: true }).errors).toEqual([]);
    });
    const towers = interiorLots(SEEDS[0], { filter: (b2) => makeFrame(b2, null, {}).obstacles.length > 0, limit: 3 });
    towers.forEach(({ bp: tb, lot: tl }) => {
      const b = new InteriorBuilder(ctxFor(tb, tl, false));
      b.room('r', [0, 0, b.W, b.D]);
      b.lightGrid('r', 4, 'panel').forEach((l) => {
        const lc = b.frame.local(l.x, l.z);
        expect(b.frame.isObstacle(lc[0], lc[1])).toBe(false);
      });
    });
  });

  it('build: giriş odası, çıkış alanları, imza/çip/aksan; Interior şeması; belirlenimci JSON', () => {
    const mk = () => {
      const { bp, lot } = plain(null, 1)[0];
      const ctx = ctxFor(bp, lot, true);
      const { b, f } = twoRooms(ctx, 3);
      b.accent(0, 0, f.W, 1, 0, 1, 230);
      b.chip('oda', 2, 2, 0);
      b.signature(2, 3, 0);
      b.zone('z', [0, 0, 3, 3], 'bekleme');
      b.light('a', 1, 1, 'lantern');
      b.prop('masa', 2, 2, 0);
      return { it: b.build(), bp, lot, f };
    };
    const { it, bp, f } = mk();
    expect(it.v).toBe(1);
    expect(it.kind).toBe(bp.interior.kind);
    expect(it.lotId).toBe(bp.id);
    expect(it.entry).toEqual({ room: 'a', door: 'sokak' });
    expect(it.streetInside).toEqual({ x: bp.doors[0].inside.x, z: bp.doors[0].inside.z });
    expect(it.doors[0]).toMatchObject({ id: 'sokak', kind: 'street', w: 3, h: 3, y: 64 });
    expect(it.bounds.y1).toBe(64 + f.H);
    expect(it.mood.hue).toBeTruthy();
    expect(it.mood.light).toBeGreaterThanOrEqual(8);
    expect(it.signature).toMatchObject({ key: expect.any(String), itemKey: expect.stringContaining('item:') });
    expect(it.chips.length).toBe(1);
    expect(it.accents.length).toBe(1);
    expect(it.zones.length).toBe(1);
    expect(it.geometry).toMatchObject({ W: f.W, D: f.D, H: f.H, mirror: true });
    expect(validateInterior(it, { reach: true }).errors).toEqual([]);
    expect(JSON.stringify(mk().it)).toBe(JSON.stringify(it));
  });

  it('giriş odası kurulmazsa entry null → doğrulayıcı reddeder', () => {
    const { bp, lot } = plain(null, 1)[0];
    const ctx = ctxFor(bp, lot, false);
    const f = ctx.frame;
    const b = new InteriorBuilder(ctx);
    // kapının önünü içermeyen küçük bir oda
    const u = f.door.u < f.W - 4 ? f.W - 3 : 0;
    b.room('x', [u, f.D - 3, u + 3, f.D]);
    const it = b.build();
    expect(it.entry).toBeNull();
    expect(validateInterior(it).errors.join('|')).toMatch(/entry/);
  });
});
