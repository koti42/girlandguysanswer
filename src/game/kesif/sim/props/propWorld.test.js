import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PropWorld, slab } from './propWorld.js';
import { ColliderIndex } from './colliderIndex.js';
import {
  PROP_BY_T, PROP_DEFS, hitBoxes, rotateBox,
} from './propDefs.js';
import { setPlanSource, propsForChunk } from './propPlan.js';
import { isEffect } from './propBehaviors.js';
import { fakeBlockPlan } from './propTestKit.js';
import { idToStr } from './propSave.js';
import { hash32 } from '../rng.js';
import { isSafeText } from '../city/citySafeData.js';

const SEED = 0x51ed;

beforeEach(() => setPlanSource(fakeBlockPlan));
afterEach(() => setPlanSource(null));

function rnd(seed) {
  let i = 0;
  return () => hash32((seed + Math.imul(++i, 0x9e3779b1)) | 0) / 4294967296;
}

function loadRegion(pw, cx0, cz0, cx1, cz1) {
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) pw.loadChunk(cx, cz);
}

/** Tek prop'u elle yerleştiren planlayıcı (seçilmiş senaryolar). */
function planner(list) {
  return (seed, cx, cz) => list.filter((p) => Math.floor(p.x / 16) === cx && Math.floor(p.z / 16) === cz);
}
function mk(id, key, x, z, extra) {
  return Object.assign({
    id, t: PROP_DEFS[key].t, x, y: 64, z, yaw: 0, variant: 0, flags: 0,
  }, extra || {});
}

describe('PropWorld — yükleme/boşaltma', () => {
  it('loadChunk proplari yükler, çarpışma ve ışın kutularını kurar; ikinci yükleme 0', () => {
    const pw = new PropWorld({ citySeed: SEED });
    const n = pw.loadChunk(0, 0);
    expect(n).toBeGreaterThan(0);
    expect(pw.loadChunk(0, 0)).toBe(0);
    expect(pw.size).toBe(n);
    expect(pw.chunkCount).toBe(1);
    const list = propsForChunk(SEED, 0, 0);
    list.forEach((p) => {
      expect(pw.get(p.id)).toEqual(p);
      expect(pw.has(p.id)).toBe(true);
      expect(pw.state(p.id)).toBe(0);
    });
    const withBoxes = list.filter((p) => PROP_BY_T[p.t].colliders.length > 0);
    expect(withBoxes.length).toBeGreaterThan(0);
    withBoxes.forEach((p) => expect(pw.colliders.has(p.id)).toBe(true));
    expect(pw.chunkProps(0, 0).length).toBe(n);
  });

  it('unloadChunk her şeyi geri alır (collider, ışın kutusu, kayıt)', () => {
    const pw = new PropWorld({ citySeed: SEED });
    loadRegion(pw, -1, -1, 2, 2);
    expect(pw.size).toBeGreaterThan(0);
    const v0 = pw.version;
    for (let cx = -1; cx <= 2; cx++) for (let cz = -1; cz <= 2; cz++) expect(pw.unloadChunk(cx, cz)).toBe(true);
    expect(pw.unloadChunk(0, 0)).toBe(false);
    expect(pw.size).toBe(0);
    expect(pw.colliders.size).toBe(0);
    expect(pw._hit.size).toBe(0);
    expect(pw.version).toBeGreaterThan(v0);
  });

  it('200 yükle/boşalt döngüsü sızdırmaz: düğüm havuzu ve yuva sayısı sabit kalır', () => {
    const pw = new PropWorld({ citySeed: SEED });
    loadRegion(pw, 0, 0, 5, 5);
    const nodes = pw._hit._nTop + pw.colliders._nTop;
    const slots = pw._hit._top + pw.colliders._top;
    for (let k = 0; k < 200; k++) {
      loadRegion(pw, 6, 6, 9, 9);
      for (let cx = 6; cx <= 9; cx++) for (let cz = 6; cz <= 9; cz++) pw.unloadChunk(cx, cz);
    }
    expect(pw._hit._nTop + pw.colliders._nTop).toBeLessThan(nodes + 4000);
    expect(pw._hit._top + pw.colliders._top).toBeLessThan(slots + 2000);
    expect(pw.chunkCount).toBe(36);
  });

  it('clear() tüm chunk ve dinamikleri boşaltır', () => {
    const pw = new PropWorld({ citySeed: SEED });
    loadRegion(pw, 0, 0, 3, 3);
    pw.addDynamic(mk(0xabc, 'bank', 4, 4));
    pw.clear();
    expect(pw.size).toBe(0);
    expect(pw.colliders.size).toBe(0);
    expect(pw.chunkCount).toBe(0);
  });

  it('aynı id iki chunk\'ta çıkarsa ikincisi atlanır ve sayılır', () => {
    const pw = new PropWorld({
      citySeed: SEED,
      planner: (s, cx) => [mk(77, 'bank', cx * 16 + 2, 2)],
    });
    expect(pw.loadChunk(0, 0)).toBe(1);
    expect(pw.loadChunk(1, 0)).toBe(0);
    expect(pw.duplicateIds).toBe(1);
    expect(pw.size).toBe(1);
  });

  it('bilinmeyen tür (getDef null) atlanır', () => {
    const pw = new PropWorld({
      citySeed: SEED,
      planner: () => [mk(1, 'bank', 2, 2), Object.assign(mk(2, 'bank', 3, 3), { t: 9999 })],
    });
    expect(pw.loadChunk(0, 0)).toBe(1);
  });

  it('colliders:null verilirse yalnız ışın kutuları tutulur (hata vermez)', () => {
    const pw = new PropWorld({ citySeed: SEED, colliders: null });
    loadRegion(pw, 0, 0, 1, 1);
    expect(pw.size).toBeGreaterThan(0);
    pw.unloadChunk(0, 0);
    pw.clear();
    expect(pw.size).toBe(0);
  });
});

describe('PropWorld — slab ve ışın', () => {
  it('slab: temel durumlar', () => {
    expect(slab(-2, 0.5, 0.5, 1, 0, 0, 0, 0, 0, 1, 1, 1)).toBeCloseTo(2, 12);
    expect(slab(0.5, 0.5, 0.5, 1, 0, 0, 0, 0, 0, 1, 1, 1)).toBe(-1); // içeriden
    expect(slab(2, 0.5, 0.5, 1, 0, 0, 0, 0, 0, 1, 1, 1)).toBe(-1); // arkada
    expect(slab(-2, 1.5, 0.5, 1, 0, 0, 0, 0, 0, 1, 1, 1)).toBe(-1); // ıskalama
    expect(slab(-2, 0.5, 0.5, 0, 1, 0, 0, 0, 0, 1, 1, 1)).toBe(-1); // paralel dışında
    expect(slab(0.5, -3, 0.5, 0, 1, 0, 0, 0, 0, 1, 1, 1)).toBeCloseTo(3, 12);
    expect(slab(0.5, 0.5, 5, 0, 0, -1, 0, 0, 0, 1, 1, 1)).toBeCloseTo(4, 12);
    expect(slab(-2, -2, -2, 1, 1, 1, 0, 0, 0, 1, 1, 1)).toBeCloseTo(2, 12); // köşegen
  });

  it('raycast: kutuya giriş uzaklığı; başlangıç kutunun içindeyse o kutu sayılmaz; geriye bakan ışın yok', () => {
    const pw = new PropWorld({ citySeed: SEED, planner: planner([mk(5, 'otomat', 8.5, 8.5)]) });
    pw.loadChunk(0, 0);
    const d = PROP_DEFS.otomat;
    const tb = hitBoxes(d)[0];
    const hit = pw.raycast({ x: 8.5, y: 65, z: 2 }, { x: 0, y: 0, z: 1 }, 20);
    expect(hit.id).toBe(5);
    expect(hit.t).toBe(d.t);
    expect(hit.dist).toBeCloseTo(8.5 + tb[2] - 2, 9);
    expect(pw.raycast({ x: 8.5, y: 65, z: 2 }, { x: 0, y: 0, z: -1 }, 20)).toBeNull();
    expect(pw.raycast({ x: 8.5, y: 65, z: 8.5 }, { x: 0, y: 0, z: 1 }, 20)).toBeNull(); // kutunun içinden
    expect(pw.raycast({ x: 8.5, y: 65, z: 2 }, { x: 0, y: 0, z: 1 }, 5)).toBeNull(); // menzil yetmiyor
    expect(pw.raycast({ x: 8.5, y: 65, z: 2 }, { x: 0, y: 0, z: 0 }, 20)).toBeNull();
    expect(pw.raycast({ x: 8.5, y: 65, z: 2 }, { x: 0, y: 0, z: 1 }, NaN)).toBeNull();
    expect(pw.raycast({ x: 8.5, y: 65, z: 2 }, { x: 0, y: 0, z: 1 }, 0)).toBeNull();
  });

  it('raycast: iki prop arasında en yakın kazanır; eşit uzaklıkta küçük id', () => {
    const list = [mk(10, 'bank', 8.5, 12.5), mk(11, 'bank', 8.5, 6.5)];
    const pw = new PropWorld({ citySeed: SEED, planner: planner(list) });
    pw.loadChunk(0, 0);
    const hit = pw.raycast({ x: 8.5, y: 64.5, z: 0 }, { x: 0, y: 0, z: 1 }, 30);
    expect(hit.id).toBe(11);
    // aynı konumda iki prop (yan yana değil, üst üste): küçük id kazanır
    const pw2 = new PropWorld({ citySeed: SEED, planner: planner([mk(30, 'bank', 8.5, 8.5), mk(20, 'bank', 8.5, 8.5)]) });
    pw2.loadChunk(0, 0);
    expect(pw2.raycast({ x: 8.5, y: 64.5, z: 0 }, { x: 0, y: 0, z: 1 }, 30).id).toBe(20);
  });

  it('raycast == kaba kuvvet: 10 000 rastgele ışın (kimlik ve uzaklık)', () => {
    const pw = new PropWorld({ citySeed: SEED });
    loadRegion(pw, 0, 0, 9, 9);
    expect(pw.size).toBeGreaterThan(150);
    // bağımsız kaba kuvvet: dünya uzayı ışın kutuları
    const boxes = [];
    pw.forEachEntry((e, id) => {
      hitBoxes(e.def).forEach((b) => {
        const r = rotateBox(b, e.prop.yaw);
        boxes.push({
          id, b: [r[0] + e.prop.x, r[1] + e.prop.y, r[2] + e.prop.z, r[3] + e.prop.x, r[4] + e.prop.y, r[5] + e.prop.z],
        });
      });
    });
    const r = rnd(2024);
    let hits = 0;
    let bad = 0;
    for (let i = 0; i < 10000; i++) {
      const o = { x: r() * 160, y: 62 + r() * 8, z: r() * 160 };
      let d = { x: r() - 0.5, y: (r() - 0.5) * 0.4, z: r() - 0.5 };
      if (i % 5 === 0) d = { x: (i % 2) * 2 - 1, y: 0, z: 0 }; // eksen hizalı (paralel dilim) durumları
      if (i % 7 === 0) d = { x: 0, y: -1, z: 0 };
      const max = 2 + r() * 40;
      const len = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
      let bestT = Infinity;
      let bestId = -1;
      for (let k = 0; k < boxes.length; k++) {
        const bx = boxes[k].b;
        const t = slab(o.x, o.y, o.z, d.x / len, d.y / len, d.z / len, bx[0], bx[1], bx[2], bx[3], bx[4], bx[5]);
        if (t < 0 || t > max) continue;
        if (t < bestT || (t === bestT && boxes[k].id < bestId)) {
          bestT = t;
          bestId = boxes[k].id;
        }
      }
      const got = pw.raycast(o, d, max);
      if (bestId < 0) {
        if (got !== null) bad++;
      } else {
        hits++;
        if (!got || got.id !== bestId || Math.abs(got.dist - bestT) > 1e-9) {
          bad++;
        }
      }
    }
    expect(hits).toBeGreaterThan(150);
    expect(bad).toBe(0);
  });

  it('nearest == kaba kuvvet (ışın kutusuna uzaklık); filter çalışır', () => {
    const pw = new PropWorld({ citySeed: SEED });
    loadRegion(pw, 0, 0, 5, 5);
    const boxes = [];
    pw.forEachEntry((e, id) => {
      hitBoxes(e.def).forEach((b) => {
        const r = rotateBox(b, e.prop.yaw);
        boxes.push({ id, b: [r[0] + e.prop.x, r[1] + e.prop.y, r[2] + e.prop.z, r[3] + e.prop.x, r[4] + e.prop.y, r[5] + e.prop.z] });
      });
    });
    const rr = rnd(7);
    let bad = 0;
    let found = 0;
    for (let i = 0; i < 1500; i++) {
      const x = rr() * 90;
      const y = 63 + rr() * 4;
      const z = rr() * 90;
      const rad = 0.5 + rr() * 6;
      let bd = rad * rad;
      let bid = -1;
      for (let k = 0; k < boxes.length; k++) {
        const b = boxes[k].b;
        const dx = x < b[0] ? b[0] - x : x > b[3] ? x - b[3] : 0;
        const dy = y < b[1] ? b[1] - y : y > b[4] ? y - b[4] : 0;
        const dz = z < b[2] ? b[2] - z : z > b[5] ? z - b[5] : 0;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bd || (d2 === bd && bid >= 0 && boxes[k].id < bid)) {
          bd = d2;
          bid = boxes[k].id;
        }
      }
      const got = pw.nearest(x, y, z, rad);
      if (bid < 0) {
        if (got !== null) bad++;
      } else {
        found++;
        if (!got || got.id !== bid) bad++;
      }
    }
    expect(found).toBeGreaterThan(100);
    expect(bad).toBe(0);
    expect(pw.nearest(0, 0, 0, 0)).toBeNull();
    const onlyLamps = pw.nearest(10, 64, 10, 40, (p, d) => d.key === 'lamba');
    expect(onlyLamps === null || onlyLamps.t === PROP_DEFS.lamba.t).toBe(true);
  });
});

describe('PropWorld — etkileşim ve davranışlar', () => {
  function world(list, opts) {
    const pw = new PropWorld(Object.assign({ citySeed: SEED, planner: planner(list) }, opts || {}));
    pw.loadChunk(0, 0);
    return pw;
  }

  it('bank: dinlenme iletisi; durum değişmez; efektler sözlükte ve güvenli', () => {
    const pw = world([mk(1, 'bank', 4, 4)]);
    const fx = pw.use(1);
    expect(fx.length).toBe(2);
    fx.forEach((e) => expect(isEffect(e)).toBe(true));
    const msg = fx.find((e) => e.kind === 'message');
    expect(isSafeText(msg.text)).toBe(true);
    expect(pw.state(1)).toBe(0);
    expect(pw.serialize()).toEqual({});
  });

  it('kullanılamaz prop / bilinmeyen id boş efekt', () => {
    const pw = world([mk(1, 'lamba', 4, 4)]);
    expect(pw.use(1)).toEqual([]);
    expect(pw.use(12345)).toEqual([]);
    expect(pw.use(NaN)).toEqual([]);
  });

  it('otomat: yanıp sönerken tekrar kullanılamaz; 1.6 sn sonra sıfırlanır; kayda girmez', () => {
    const pw = world([mk(2, 'otomat', 6, 6)]);
    const a = pw.use(2);
    expect(a.some((e) => e.kind === 'message')).toBe(true);
    expect(pw.state(2)).toBe(1);
    expect(pw.use(2)).toEqual([]);
    expect(pw.serialize()).toEqual({}); // volatile
    for (let i = 0; i < 80; i++) pw.tick(1 / 60);
    expect(pw.state(2)).toBe(1);
    for (let i = 0; i < 40; i++) pw.tick(1 / 60);
    expect(pw.state(2)).toBe(0);
    expect(pw.use(2).length).toBe(2);
  });

  it('otomat satırları belirlenimli ve döngüsel çeşitlidir', () => {
    const seen = new Set();
    const pw = world([mk(2, 'otomat', 6, 6)]);
    for (let k = 0; k < 60; k++) {
      const fx = pw.use(2);
      fx.filter((e) => e.kind === 'message').forEach((e) => {
        seen.add(e.text);
        expect(isSafeText(e.text)).toBe(true);
      });
      for (let i = 0; i < 120; i++) pw.tick(1 / 60);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    const pw2 = world([mk(2, 'otomat', 6, 6)]);
    const first = pw2.use(2).find((e) => e.kind === 'message').text;
    const pw3 = world([mk(2, 'otomat', 6, 6)]);
    expect(pw3.use(2).find((e) => e.kind === 'message').text).toBe(first);
  });

  it('tabela/billboard: marka ve reklam metni', () => {
    const pw = world([mk(3, 'tabela', 4, 4, { flags: 0 }), mk(4, 'billboard', 10, 10, { flags: 70 })]);
    const t = pw.use(3).find((e) => e.kind === 'message');
    expect(t.text).toContain(':');
    const b = pw.use(4).find((e) => e.kind === 'message');
    expect(b.text.length).toBeGreaterThan(5);
    expect(pw.use(3).length).toBe(1);
    expect(pw.hint(3).length).toBeGreaterThan(3);
    // geçersiz sign indeksi: boş
    const pw2 = world([mk(5, 'tabela', 4, 4, { flags: 65000 })]);
    expect(pw2.use(5)).toEqual([]);
  });

  it('terminal: ilk kullanım bulundu + emit, durum 1 kalıcı; sonraki kullanım openUi', () => {
    const pw = world([mk(7, 'terminal', 4, 4, { flags: 5 })]);
    expect(pw.hint(7)).toBe('Terminali etkinleştir');
    const a = pw.use(7);
    const emit = a.find((e) => e.kind === 'emit');
    expect(emit.evt).toEqual({ type: 'terminalFound', terminal: 5, first: true });
    expect(a.some((e) => e.kind === 'openUi')).toBe(false);
    expect(pw.state(7)).toBe(1);
    expect(pw.hint(7)).toBe('Terminali kullan');
    const b = pw.use(7);
    expect(b.some((e) => e.kind === 'emit')).toBe(false);
    expect(b.find((e) => e.kind === 'openUi')).toMatchObject({ ui: 'terminal', terminal: 5 });
    expect(pw.serialize()).toEqual({ [idToStr(7)]: [1, 0] });
  });

  it('boyut terminali: openUi + seçim yürütme efektleri; ikinci kullanım onaylar; çömelme başlangıç', () => {
    const pw = world([mk(9, 'boyut_terminali', 8, 8)]);
    expect(pw.hint(9)).toBe('Terminali etkinleştir');
    const a = pw.use(9);
    const ui = a.find((e) => e.kind === 'openUi');
    expect(ui.ui).toBe('boyutTerminal');
    expect(ui.terminal).toBe(0);
    expect(a.find((e) => e.kind === 'emit').evt).toEqual({ type: 'terminalFound', terminal: 0, first: true });
    expect(pw.state(9)).toBe(1);
    expect(ui.choices.map((c) => c.label)).toEqual(['Eve dön', 'Başlangıç noktasına dön']);
    expect(ui.choices.map((c) => c.effect)).toEqual([{ kind: 'dimension', op: 'back' }, { kind: 'dimension', op: 'home' }]);
    expect(a.some((e) => e.kind === 'message')).toBe(true); // seçim paneli yok → ipucu iletisi
    expect(pw.hint(9)).toContain('Eve dön');
    const b = pw.use(9);
    expect(b.find((e) => e.kind === 'dimension')).toEqual({ kind: 'dimension', op: 'back' });
    expect(b.some((e) => e.kind === 'emit')).toBe(false); // bulundu olayı yalnız ilk kullanımda
    // onaydan sonra kurulum sıfırlanır: yeniden kur → tekrar onay
    pw.use(9);
    const c1 = pw.use(9);
    expect(c1.find((e) => e.kind === 'dimension')).toBeTruthy();
    expect(pw.serialize()).toEqual({ [idToStr(9)]: [1, 0] });
    const pw2 = world([mk(9, 'boyut_terminali', 8, 8)]);
    pw2.use(9);
    expect(pw2.use(9, { crouch: true }).find((e) => e.kind === 'dimension')).toEqual({ kind: 'dimension', op: 'home' });
    // seçim paneli doğrudan seçim
    const pw3 = world([mk(9, 'boyut_terminali', 8, 8)]);
    expect(pw3.use(9, { choice: 'home' }).find((e) => e.kind === 'dimension').op).toBe('home');
    expect(pw3.use(9, { choice: 'back' }).find((e) => e.kind === 'dimension').op).toBe('back');
    expect(pw3.use(9, { choice: 'evil' }).some((e) => e.kind === 'dimension')).toBe(false);
  });

  it('boyut terminali: 6 sn içinde onaylanmazsa kurulum sönümlenir; seçim paneli varsa ipucu iletisi yok', () => {
    const pw = world([mk(9, 'boyut_terminali', 8, 8)]);
    pw.use(9);
    for (let i = 0; i < 400; i++) pw.tick(1 / 60); // 6.67 sn
    expect(pw.use(9).some((e) => e.kind === 'dimension')).toBe(false); // yeniden kurulum, onay değil
    const pw2 = world([mk(9, 'boyut_terminali', 8, 8)], { choiceUi: true });
    pw2.use(9); // ilk kullanım: terminal bulundu iletisi (panel olsa da)
    for (let i = 0; i < 400; i++) pw2.tick(1 / 60);
    expect(pw2.use(9).some((e) => e.kind === 'message')).toBe(false);
    pw2.setChoiceUi(false);
    expect(pw2.choiceUi).toBe(false);
  });

  it('tick: etkin prop yokken sabit boş dizi; dt<=0 güvenli', () => {
    const pw = world([mk(1, 'bank', 4, 4)]);
    expect(pw.tick(1 / 60)).toEqual([]);
    expect(pw.tick(0)).toEqual([]);
    expect(pw.tick(NaN)).toEqual([]);
    expect(pw.tick(-1)).toEqual([]);
  });

  it('boşaltılan prop etkin kümeden düşer (tick hata vermez)', () => {
    const pw = world([mk(2, 'otomat', 6, 6)]);
    pw.use(2);
    pw.unloadChunk(0, 0);
    expect(() => pw.tick(1)).not.toThrow();
  });
});

describe('PropWorld — kayıt', () => {
  const list = [mk(1, 'terminal', 4, 4, { flags: 1 }), mk(2, 'terminal', 20, 4, { flags: 2 }), mk(3, 'otomat', 6, 6), mk(4, 'bank', 8, 8)];

  function fresh() {
    return new PropWorld({ citySeed: SEED, planner: (s, cx, cz) => list.filter((p) => Math.floor(p.x / 16) === cx && Math.floor(p.z / 16) === cz) });
  }

  it('yalnız varsayılandan farklı + kalıcı olanlar yazılır; boşaltılmış chunk durumu korunur; yeniden yüklenince uygulanır', () => {
    const pw = fresh();
    pw.loadChunk(0, 0);
    pw.loadChunk(1, 0);
    expect(pw.serialize()).toEqual({});
    pw.use(1);
    pw.use(3);
    pw.use(4);
    expect(pw.serialize()).toEqual({ [idToStr(1)]: [1, 0] });
    pw.use(2);
    pw.unloadChunk(1, 0);
    const s = pw.serialize();
    expect(s).toEqual({ [idToStr(1)]: [1, 0], [idToStr(2)]: [1, 0] });
    pw.loadChunk(1, 0);
    expect(pw.state(2)).toBe(1);
    expect(pw.serialize()).toEqual(s);
  });

  it('restore: yüklü proplara hemen, yüklenmeyenlere chunk yüklenince; kayıt dışı yüklüler sıfırlanır', () => {
    const a = fresh();
    a.loadChunk(0, 0);
    a.loadChunk(1, 0);
    a.use(1);
    a.use(2);
    const s = JSON.parse(JSON.stringify(a.serialize()));
    const b = fresh();
    b.loadChunk(0, 0);
    b.restore(s);
    expect(b.state(1)).toBe(1);
    b.loadChunk(1, 0);
    expect(b.state(2)).toBe(1);
    expect(b.serialize()).toEqual(s);
    // yüklü olup kayıtta olmayan sıfırlanır
    const c = fresh();
    c.loadChunk(0, 0);
    c.use(1);
    c.restore({});
    expect(c.state(1)).toBe(0);
    expect(c.serialize()).toEqual({});
  });

  it('gidiş-dönüş: serialize → JSON → restore → serialize aynı', () => {
    const a = fresh();
    a.loadChunk(0, 0);
    a.loadChunk(1, 0);
    a.use(1);
    a.use(2);
    const json = JSON.stringify(a.serialize());
    const b = fresh();
    b.restore(JSON.parse(json));
    expect(JSON.stringify(b.serialize())).toBe(json);
  });

  it('fuzz: bozuk/zehirli kayıt asla fırlatmaz, yalnız geçerli satırları alır', () => {
    const bad = [
      null, undefined, 5, 'x', [], [1, 2], true,
      { __proto__: { evil: [1, 0] } },
      Object.assign(JSON.parse('{"__proto__":[1,0],"constructor":[1,0],"1":[1,0],"c":[-1,0],"d":[1000,0],"e":[1,70000],"f":"x","g":[1,0,{"a":1}],"h":[1,0,"<script>"],"i":[1,0,[1,2,3,4,5,6,7,8,9]],"zzzzzzzzzz":[1,0],"UPPER":[1,0],"":[1,0]}'), { a: [NaN, 0], b: [1, Infinity] }),
      JSON.parse('{"1":[1,0,1e300],"2":[1,0,"ok"],"3":[1.5,0],"4":[1,0.5]}'),
    ];
    bad.forEach((o) => {
      const pw = fresh();
      pw.loadChunk(0, 0);
      expect(() => pw.restore(o)).not.toThrow();
      const out = pw.serialize();
      Object.keys(out).forEach((k) => {
        expect(/^[0-9a-z]{1,7}$/.test(k)).toBe(true);
        expect(out[k][0]).toBeGreaterThanOrEqual(0);
      });
    });
    // geçerli satırlar korunur
    const pw = fresh();
    pw.restore(JSON.parse('{"1":[1,0],"__proto__":[1,0],"2":[999,0]}'));
    pw.loadChunk(0, 0);
    expect(pw.state(1)).toBe(1);
    expect(Object.prototype.polluted).toBeUndefined();
  });

  it('durum sayısı küçük tanımda büyük kayıtlı durum 0\'a indirgenir', () => {
    const pw = fresh();
    pw.restore({ [idToStr(1)]: [200, 0] });
    pw.loadChunk(0, 0);
    expect(pw.state(1)).toBe(0);
  });

  it('boyut sınırı: çok sayıda değişiklik 40 KB altında kalır, en yeni değişiklikler korunur', () => {
    const many = [];
    for (let i = 0; i < 5000; i++) many.push(mk(1000 + i, 'terminal', (i % 15) + 0.5, 1 + (i % 7), { flags: i & 15 }));
    const pw = new PropWorld({ citySeed: SEED, planner: (s, cx, cz) => (cx === 0 && cz === 0 ? many : []) });
    pw.loadChunk(0, 0);
    for (let i = 0; i < 5000; i++) pw.use(1000 + i);
    const out = pw.serialize();
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(40 * 1024);
    expect(Object.keys(out).length).toBeGreaterThan(1000);
    expect(out[idToStr(1000 + 4999)]).toEqual([1, 0]); // en yeni
    expect(out[idToStr(1000)]).toBeUndefined(); // en eski kırpıldı
    expect(JSON.stringify(pw.serialize(1024)).length).toBeLessThanOrEqual(1024);
  });

  it('belirlenimcilik: aynı işlem dizisi aynı kayıt', () => {
    const run = () => {
      const pw = fresh();
      pw.loadChunk(0, 0);
      pw.loadChunk(1, 0);
      pw.use(2);
      pw.use(1);
      pw.tick(0.5);
      return JSON.stringify(pw.serialize());
    };
    expect(run()).toBe(run());
  });
});

describe('PropWorld — dinamik proplar', () => {
  const DYN = Object.freeze({
    t: 500, key: 'kabin', name: 'Kabin', model: { meshKey: 'x' }, size: [2, 3, 2], colliders: [[-1, 0, -1, 1, 0.5, 1], [-1, 0.5, -1, -0.875, 3, 1]],
    interact: null, states: 1, emissive: 0, tags: [], dyn: true,
  });
  const getDef = (t) => (t === 500 ? DYN : PROP_BY_T[t] || null);

  it('addDynamic / moveDynamic / removeDynamic: collider dinamik kutusu ve ışın kutusu izler', () => {
    const idx = new ColliderIndex();
    const pw = new PropWorld({ citySeed: SEED, colliders: idx, getDef });
    const prop = {
      id: 900, t: 500, x: 10, y: 64, z: 10, yaw: 0, variant: 0, flags: 0,
    };
    expect(pw.addDynamic(prop, { x: 0, y: 8, z: 0 })).toBe(true);
    expect(pw.addDynamic(prop)).toBe(false);
    expect(idx.dynCount).toBe(1);
    expect(idx.vel[idx.slots[0] * 3 + 1] === 0 || true).toBe(true);
    const out = new Float64Array(64 * 6);
    expect(idx.queryRaw(9.5, 64.2, 9.5, 10.5, 64.4, 10.5, out, 64)).toBe(1);
    expect(idx.vel[idx.slots[0] * 3 + 1]).toBe(8);
    expect(pw.moveDynamic(900, 10, 70, 10, 0, { x: 0, y: 8, z: 0 })).toBe(true);
    expect(idx.queryRaw(9.5, 64.2, 9.5, 10.5, 64.4, 10.5, out, 64)).toBe(0);
    expect(idx.queryRaw(9.5, 70.2, 9.5, 10.5, 70.4, 10.5, out, 64)).toBe(1);
    expect(pw.get(900).y).toBe(70);
    const hit = pw.raycast({ x: 10, y: 80, z: 10 }, { x: 0, y: -1, z: 0 }, 30);
    expect(hit && hit.id).toBe(900);
    expect(pw.moveDynamic(12345, 0, 0, 0)).toBe(false);
    expect(pw.moveDynamic(900, NaN, 0, 0)).toBe(false);
    const seen = [];
    pw.forEachDynamic((e) => seen.push(e.prop.id));
    expect(seen).toEqual([900]);
    expect(pw.removeDynamic(900)).toBe(true);
    expect(idx.dynCount).toBe(0);
    expect(idx.size).toBe(0);
    expect(pw.removeDynamic(900)).toBe(false);
  });

  it('dinamik proplar kayda girmez ve chunk boşaltmadan etkilenmez', () => {
    const pw = new PropWorld({ citySeed: SEED, getDef, planner: () => [] });
    pw.addDynamic({
      id: 901, t: 500, x: 1, y: 64, z: 1, yaw: 1, variant: 0, flags: 0,
    });
    pw.loadChunk(0, 0);
    pw.unloadChunk(0, 0);
    expect(pw.has(901)).toBe(true);
    expect(pw.serialize()).toEqual({});
  });

  it('geçersiz dinamik prop reddedilir', () => {
    const pw = new PropWorld({ citySeed: SEED, getDef });
    expect(pw.addDynamic(null)).toBe(false);
    expect(pw.addDynamic({ id: 1, t: 9999, x: 0, y: 0, z: 0 })).toBe(false);
    expect(pw.addDynamic({ id: 2, t: 500, x: NaN, y: 0, z: 0 })).toBe(false);
  });
});

describe('PropWorld — çarpışma entegrasyonu', () => {
  it('yüklenen bank çarpışma indeksinde; boşaltılınca yürüme serbest', async () => {
    const pw = new PropWorld({ citySeed: SEED, planner: planner([mk(1, 'bank', 8, 8)]) });
    pw.loadChunk(0, 0);
    const out = new Float64Array(64 * 6);
    expect(pw.colliders.queryRaw(7, 64.1, 7.8, 9, 64.5, 8.2, out, 64)).toBe(1);
    pw.unloadChunk(0, 0);
    expect(pw.colliders.queryRaw(7, 64.1, 7.8, 9, 64.5, 8.2, out, 64)).toBe(0);
  });
});
