import { describe, expect, it } from 'vitest';
import { PropWorld } from '../sim/props/propWorld.js';
import { INTERIOR_BY_KEY } from '../sim/props/propDefsInterior.js';
import { createPropAmbience } from './propsAmbient.js';

let nid = 9000;
function world(items, base) {
  const props = items.map((it, i) => {
    const d = INTERIOR_BY_KEY[it.key];
    return {
      id: base ? base + i : ++nid, t: d.t, x: it.x, y: it.y === undefined ? 64 : it.y, z: it.z, yaw: 0, variant: 0, flags: 0,
    };
  });
  const pw = new PropWorld({
    citySeed: 1,
    planner: (s, cx, cz) => props.filter((p) => Math.floor(p.x / 16) === cx && Math.floor(p.z / 16) === cz),
  });
  for (let cx = -1; cx <= 3; cx++) for (let cz = -1; cz <= 3; cz++) pw.loadChunk(cx, cz);
  return { pw, props };
}

function rig(items, limit, base) {
  const { pw, props } = world(items, base);
  const played = [];
  const G = {
    props: pw,
    body: { x: 20, y: 64, z: 20 },
    sound: (name, pos, o) => played.push({ name, pos, vol: o && o.vol }),
  };
  return {
    G, pw, props, played, pa: createPropAmbience(G, { limit }),
  };
}

function run(pa, secs) {
  for (let i = 0; i < Math.round(secs * 60); i++) pa.update(1 / 60);
}

describe('iç mekân ortam sesleri', () => {
  it('yakın ortam propu aralıklı çalar: ses adı tanımdan, konum prop üstü, ses uzaklıkla azalır', () => {
    const { pa, played } = rig([{ key: 'buzdolabi', x: 22, z: 20 }, { key: 'masa', x: 21, z: 21 }], 3);
    run(pa, 12);
    expect(played.length).toBeGreaterThanOrEqual(2);
    played.forEach((p) => {
      expect(p.name).toBe('prop:fridge_hum');
      expect(p.vol).toBeGreaterThan(0.1);
      expect(p.vol).toBeLessThanOrEqual(0.7);
      expect(p.pos.y).toBeCloseTo(65, 5);
    });
    const near = rig([{ key: 'buzdolabi', x: 21, z: 20 }], 3);
    const far = rig([{ key: 'buzdolabi', x: 26, z: 20 }], 3);
    run(near.pa, 6); run(far.pa, 6);
    expect(near.played[0].vol).toBeGreaterThan(far.played[0].vol);
  });

  it('menzil dışı / başka kat / durum koşulu: çalmaz; duş yalnız çalışırken', () => {
    const a = rig([{ key: 'buzdolabi', x: 40, z: 40 }], 3);
    run(a.pa, 10);
    expect(a.played.length).toBe(0);
    const b = rig([{ key: 'buzdolabi', x: 21, z: 20, y: 80 }], 3);
    run(b.pa, 10);
    expect(b.played.length).toBe(0);
    const c = rig([{ key: 'dus_kabini', x: 21, z: 20 }], 3);
    run(c.pa, 8);
    expect(c.played.length).toBe(0);
    c.pw.use(c.props[0].id);
    run(c.pa, 8);
    expect(c.played.length).toBeGreaterThan(0);
    expect(c.played[0].name).toBe('prop:shower');
  });

  it('ses düğümü bütçesi: eşzamanlı en çok `limit` en yakın prop; limit 1 → yalnız en yakın', () => {
    const items = [];
    for (let i = 0; i < 8; i++) items.push({ key: 'arcade_makinesi', x: 18 + i * 0.8, z: 22 });
    const r1 = rig(items, 1);
    run(r1.pa, 15);
    expect(r1.pa.stats.playing).toBe(1);
    const ids = new Set(r1.played.map((p) => Math.round(p.pos.x * 10)));
    expect(ids.size).toBe(1);
    const r3 = rig(items, 3);
    run(r3.pa, 15);
    expect(r3.pa.stats.playing).toBe(3);
    expect(new Set(r3.played.map((p) => Math.round(p.pos.x * 10))).size).toBe(3);
    r3.pa.setLimit(0);
    run(r3.pa, 2);
    expect(r3.pa.stats.playing).toBeLessThanOrEqual(1);
  });

  it('belirlenimci (Math.random yok); eksik G alanlarında güvenli; sıfır/negatif dt yok sayılır', () => {
    const run1 = () => {
      const r = rig([{ key: 'arcade_makinesi', x: 21, z: 20 }, { key: 'akvaryum', x: 19, z: 21 }, { key: 'sunucu_rafi', x: 20, z: 23 }], 3, 123456);
      run(r.pa, 20);
      return JSON.stringify(r.played.map((p) => [p.name, Math.round(p.vol * 1000)]));
    };
    expect(run1()).toBe(run1());
    const pa = createPropAmbience({});
    expect(() => { pa.update(0.016); pa.update(0); pa.update(-1); pa.update(NaN); }).not.toThrow();
    const pa2 = createPropAmbience({ props: {}, body: { x: 0, y: 0, z: 0 } });
    expect(() => pa2.update(0.5)).not.toThrow();
  });
});
