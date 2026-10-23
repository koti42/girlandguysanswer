import { describe, expect, it } from 'vitest';
import { createLampSync, lampList, LAMP_EVERY } from './trafficLamps.js';
import { trafficNet } from '../sim/city/vehicle/junctions.js';
import { armSignal } from '../sim/city/vehicle/trafficLights.js';

const tn = trafficNet(4242);

function fakeProps() {
  const ids = new Map();
  const states = new Map();
  let nextId = 1;
  const p = {
    nearestCalls: 0,
    loaded: true,
    has: (id) => ids.has(id),
    nearest(x, y, z) {
      p.nearestCalls++;
      if (!p.loaded) return null;
      const k = Math.round(x) + ',' + Math.round(z);
      if (!ids.has(k)) ids.set(k, nextId++);
      const id = ids.get(k);
      ids.set(id, k);
      return { id };
    },
    setState(id, st) {
      if (states.get(id) === st) return false;
      states.set(id, st);
      return true;
    },
    state: (id) => states.get(id),
    states,
  };
  return p;
}

describe('trafficLamps: direk lamba eşitleme', () => {
  it('lampList: lambalı her kol için bir kayıt; tn başına tek hesap', () => {
    const l = lampList(tn);
    expect(l.length).toBeGreaterThan(100);
    expect(lampList(tn)).toBe(l);
    l.forEach((x) => {
      expect(x.dir).toBeGreaterThanOrEqual(0);
      expect(x.dir).toBeLessThan(4);
      expect(tn.junctions[x.jid]).toBeTruthy();
      expect(x.key).toBe(x.jid * 4 + x.dir);
    });
  });

  it('LAMP_EVERY aralığıyla çalışır; yakın direklerin durumu planla aynı; uzaktakilere dokunmaz', () => {
    const props = fakeProps();
    const sync = createLampSync();
    const L = lampList(tn)[0];
    const t = 777.3;
    const n = sync.update(props, tn, t, L.x, L.z, 0.01); // ilk çağrı hemen eşitler
    expect(n).toBeGreaterThan(0);
    expect(sync.update(props, tn, t, L.x, L.z, 0.01)).toBe(0); // aralık dolmadı
    expect(sync.update(props, tn, t, L.x, L.z, LAMP_EVERY)).toBe(n);
    let seen = 0;
    lampList(tn).forEach((x) => {
      const k = Math.round(x.x) + ',' + Math.round(x.z);
      const id = props.has(k) ? props.nearest(x.x, x.y, x.z) : null;
      if (!id) return;
      expect(props.state(id.id)).toBe(armSignal(tn.junctions[x.jid].plan, x.dir, t));
      seen++;
    });
    expect(seen).toBe(n);
    const far = lampList(tn).find((x) => Math.hypot(x.x - L.x, x.z - L.z) > 400);
    expect(props.has(Math.round(far.x) + ',' + Math.round(far.z))).toBe(false);
  });

  it('yüklü olmayan direkler için arama 1,5 sn geri çekilir (her 0,2 sn yeniden aranmaz)', () => {
    const props = fakeProps();
    props.loaded = false;
    const sync = createLampSync();
    const L = lampList(tn)[0];
    sync.update(props, tn, 1, L.x, L.z, LAMP_EVERY);
    const first = props.nearestCalls;
    expect(first).toBeGreaterThan(0);
    sync.update(props, tn, 1.2, L.x, L.z, LAMP_EVERY);
    sync.update(props, tn, 1.4, L.x, L.z, LAMP_EVERY);
    expect(props.nearestCalls).toBe(first);
    for (let i = 0; i < 8; i++) sync.update(props, tn, 2 + i * 0.2, L.x, L.z, LAMP_EVERY);
    expect(props.nearestCalls).toBeGreaterThan(first);
    props.loaded = true;
    for (let i = 0; i < 10; i++) sync.update(props, tn, 4 + i * 0.2, L.x, L.z, LAMP_EVERY);
    expect(sync.stats.synced).toBeGreaterThan(0);
  });

  it('reset önbelleği boşaltır; props/tn yoksa güvenli', () => {
    const sync = createLampSync();
    expect(sync.update(null, tn, 1, 0, 0, 1)).toBe(0);
    expect(sync.update(fakeProps(), null, 1, 0, 0, 1)).toBe(0);
    sync.reset();
  });
});
