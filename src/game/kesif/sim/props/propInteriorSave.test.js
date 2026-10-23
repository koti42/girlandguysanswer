import { describe, expect, it } from 'vitest';
import { PropWorld } from './propWorld.js';
import { PROP_SAVE_MAX_BYTES, jsonBytes } from './propSave.js';
import { dimSeed } from '../dim/dimensions.js';

const SEED = dimSeed(777, 'neon');

function load(x0, z0, n) {
  const pw = new PropWorld({ citySeed: SEED });
  for (let cz = z0; cz < z0 + n; cz++) for (let cx = x0; cx < x0 + n; cx++) pw.loadChunk(cx, cz);
  return pw;
}

function entries(pw) {
  const out = [];
  pw.forEachEntry((e, id) => out.push([id, e]));
  return out;
}

describe('iç mekân prop durumu kaydı — gerçek şehir', () => {
  it('kapılar/dolaplar/ekranlar açılınca yalnız KALICI olanlar kaydedilir (≤ 40 KB), zamanlı cihazlar kaydedilmez; geri yüklemede durum ve çarpışma aynı', () => {
    const pw = load(16, -8, 8);
    const list = entries(pw).filter(([, e]) => e.def.interior);
    expect(list.length).toBeGreaterThan(150);
    let changed = 0;
    let transient = 0;
    list.forEach(([id, e]) => {
      const k = e.def.interact && e.def.interact.kind;
      if (k === 'open' || e.def.mode === 'fold' || e.def.mode === 'power' || e.def.mode === 'cycle') {
        if (pw.setState(id, e.def.states - 1)) changed++;
      } else if (e.def.transient) {
        if (pw.setState(id, 1)) transient++;
      }
    });
    expect(changed).toBeGreaterThan(15);
    expect(transient).toBeGreaterThan(0);
    const saved = pw.serialize();
    const bytes = jsonBytes(saved);
    expect(bytes).toBeLessThanOrEqual(PROP_SAVE_MAX_BYTES);
    expect(Object.keys(saved).length).toBe(changed);
    const pw2 = load(16, -8, 8);
    pw2.restore(JSON.parse(JSON.stringify(saved)));
    list.forEach(([id, e]) => {
      const e2 = pw2.entry(id);
      if (e.def.transient) {
        expect(e2.state).toBe(0);
        return;
      }
      expect(e2.state, e.def.key).toBe(e.state);
      if (e.def.openFree && e.def.colliders.length > 0) {
        expect(pw2.colliders.has(id), e.def.key + ' ' + e2.state).toBe(e2.state === 0);
        expect(pw.colliders.has(id)).toBe(pw2.colliders.has(id));
      }
    });
  });

  it('chunk boşalt/yükle döngüsü durumu korur (saklanan satır) ve zamanlı cihazları sıfırlar', () => {
    const pw = load(18, -4, 2);
    const list = entries(pw).filter(([, e]) => e.def.interior);
    const door = list.find(([, e]) => e.def.key === 'kapi');
    const dus = list.find(([, e]) => e.def.key === 'dus_kabini');
    expect(door).toBeTruthy();
    pw.setState(door[0], 1);
    if (dus) pw.setState(dus[0], 1);
    const cx = door[1].cx;
    const cz = door[1].cz;
    pw.unloadChunk(cx, cz);
    pw.loadChunk(cx, cz);
    expect(pw.state(door[0])).toBe(1);
    expect(pw.colliders.has(door[0])).toBe(false);
    if (dus && dus[1].cx === cx && dus[1].cz === cz) expect(pw.state(dus[0])).toBe(0);
  });

  it('tüm tanımların durumu geçerli aralıkta kalır: bozuk kayıt (durum ≥ states) yüklemede 0\'a düşer', () => {
    const pw = load(18, -4, 2);
    const door = entries(pw).find(([, e]) => e.def.key === 'kapi');
    pw.restore({ [door[0].toString(36)]: [200, 0] });
    expect(pw.state(door[0])).toBe(0);
    expect(pw.colliders.has(door[0])).toBe(true);
  });
});
