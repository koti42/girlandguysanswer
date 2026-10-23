/*
 * Boyut kancaları (onDimension / beforeDimension) — tek tek sistem regresyonları:
 *   mobs   : alt modüller beforeDimension'da (eski kök) sökülür, onDimension'da kurulur; sahne grafiği 30 döngü boyunca BÜYÜMEZ (sızıntı regresyonu),
 *            ölüm işareti boyuta özgü, yardım sayacı taşınır; yarım kalan swap fixedUpdate'te onarılır
 *   treefall: beforeDimension yarım kalan devirmeyi eski dünyada tamamlar; onDimension abonelik sayısını değiştirmez; şehirde etkin değil
 *   input  : portalMode eylemi (T tuşu, dokunmatik düğme)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeMobsG } from './mobsTestKit.js';
import { GROUND, makeTreeG } from './treefallTestKit.js';
import { keyToAction, TOUCH_BUTTONS, touchButtonDef } from '../inputMath.js';
import { createButtonPress } from '../inputButtons.js';
import { active as treefallActive } from './treefallCore.js';

vi.mock('../sim/structures.js', () => ({
  structuresInRegion: (...a) => (globalThis.__tfStructs ? globalThis.__tfStructs(...a) : []),
  warmStructures: () => 0,
}));
afterEach(() => { globalThis.__tfStructs = null; });

/** Sahne nesne sayısı; canlı yaratık modelleri (doğal doğma ile değişir) sayılmaz: sızıntı = grup/eşya/mermi/telegraf yapıları. */
function count(root) {
  let n = 1;
  root.children.forEach((c) => {
    if (typeof c.name === 'string' && c.name.indexOf('mob:') === 0) return;
    n += count(c);
  });
  return n;
}

describe('mobs: boyut kancaları', () => {
  it('beforeDimension eski kökte sökerken onDimension yeni kök için kurar; 30 döngüde sahne büyümez', () => {
    const k = makeMobsG({ render: true });
    const { G, sys } = k;
    const main = sys.main;
    const rootA = G.entityRoot;
    const rootB = new THREE.Group();
    G.scene.add(rootB);
    const em2 = G.em; // aynı em yeterli: kök/sahne sızıntısı ölçülür
    k.mobAt(6, 'golge');
    k.step(5);
    k.frame(1 / 60, 4);
    const implA = main.impl;
    expect(implA).toBeTruthy();
    let base = count(G.scene);
    let from = { id: 'overworld' };
    let to = { id: 'neon' };
    for (let i = 0; i < 30; i++) {
      main.beforeDimension(G, from, to);
      expect(main.impl).toBeNull();
      G.entityRoot = i % 2 === 0 ? rootB : rootA;
      G.dim = to.id;
      main.onDimension(G, from, to);
      expect(main.impl).toBeTruthy();
      k.step(2);
      k.frame(1 / 60, 1);
      const t = from;
      from = to;
      to = t;
      if (i === 9) {
        // kararlı durum: ilk 10 döngüden sonraki büyüme ölçülür (yaratık/eşya durumu oturmuş olsun)
        k.step(5);
        k.frame(1 / 60, 4);
        base = count(G.scene);
      }
    }
    expect(main.impl).not.toBe(implA);
    k.step(5);
    k.frame(1 / 60, 4); // son kurulumun görünümleri oluşsun (taban ile aynı durum)
    const after = count(G.scene);
    expect(after - base).toBeLessThanOrEqual(2);
    expect(em2).toBe(G.em);
    main.dispose();
  });

  it('shots/telegraf/hasar sayıları grupları söküm sonrası köklerde kalmaz', () => {
    const k = makeMobsG({ render: true });
    const { G, sys } = k;
    const main = sys.main;
    const names = () => G.entityRoot.children.map((c) => c.name).sort().join(',');
    const before = names();
    for (let i = 0; i < 5; i++) {
      main.beforeDimension(G, { id: 'overworld' }, { id: 'neon' });
      main.onDimension(G, { id: 'overworld' }, { id: 'overworld' });
    }
    expect(names()).toBe(before);
    main.dispose();
  });

  it('ölüm işareti boyuta özgü: şehirde görünmez, overworld\'e dönünce geri gelir; yardım sayacı taşınır', () => {
    const k = makeMobsG({ render: true });
    const { G, sys } = k;
    const main = sys.main;
    main.impl.player.restoreMarker({
      x: 3, y: 41, z: 3, t: 0, life: 300, empty: 0, done: false, pulse: 0,
    });
    main.impl.player.assist.deaths.push(5);
    main.impl.player.assist.until = 99;
    main.beforeDimension(G, { id: 'overworld' }, { id: 'neon' });
    main.onDimension(G, { id: 'overworld' }, { id: 'neon' });
    expect(main.impl.player.marker).toBeNull();
    expect(main.impl.player.assist.deaths).toEqual([5]);
    expect(main.impl.player.assist.until).toBe(99);
    main.beforeDimension(G, { id: 'neon' }, { id: 'overworld' });
    main.onDimension(G, { id: 'neon' }, { id: 'overworld' });
    expect(main.impl.player.marker).toBeTruthy();
    expect(main.impl.player.marker.x).toBe(3);
    main.dispose();
  });

  it('swap yarıda kalırsa (onDimension çağrılmadı) bir sonraki sabit adım alt modülleri kurar: mobs ölü kalmaz', () => {
    const k = makeMobsG({ render: true });
    const { G, sys } = k;
    const main = sys.main;
    main.beforeDimension(G, { id: 'overworld' }, { id: 'neon' });
    expect(main.impl).toBeNull();
    k.step(1);
    expect(main.impl).toBeTruthy();
    main.dispose();
  });
});

describe('treefall: boyut kancaları', () => {
  it('beforeDimension: yarım kalan devirme eski dünyada tamamlanır (blok kaybı/asılı kuyruk yok)', () => {
    const t = makeTreeG();
    const cells = t.plant(0, 20, 8, 99);
    t.cut(20, GROUND + 1, 8);
    t.tick(3);
    expect(t.S.active.length + t.S.queue.length + t.S.removing.length).toBeGreaterThan(0);
    t.sys.beforeDimension(t.G);
    expect(t.S.active.length).toBe(0);
    expect(t.S.removing.length).toBe(0);
    expect(t.S.queue.length).toBe(0);
    const rest = cells.filter((c) => !(c.x === 20 && c.y === GROUND + 1 && c.z === 8));
    const gone = rest.filter((c) => t.G.world.getBlock(c.x, c.y, c.z) === 0).length;
    expect(gone).toBe(rest.length);
  });

  it('onDimension: world.blockChange abonelik sayısı değişmez (unsub + resub), kuyruklar temizlenir', () => {
    const t = makeTreeG();
    const n0 = t.G.world._listeners.blockChange.length;
    t.S.queue.push({ x: 1, y: 1, z: 1 });
    t.S.queued.add('1,1,1');
    for (let i = 0; i < 5; i++) t.sys.onDimension(t.G);
    expect(t.G.world._listeners.blockChange.length).toBe(n0);
    expect(t.S.queue.length).toBe(0);
    expect(t.S.queued.size).toBe(0);
  });

  it('şehirde (G.dim neon) devirme sistemi etkin değil; overworld\'de etkin', () => {
    const t = makeTreeG();
    expect(treefallActive(t.G)).toBe(true);
    t.G.dim = 'neon';
    expect(treefallActive(t.G)).toBe(false);
    t.G.dim = 'overworld';
    expect(treefallActive(t.G)).toBe(true);
  });
});

describe('girdi: portalMode', () => {
  it('T tuşu → portalMode eylemi; dokunmatik düğme tanımı var (tap, ability)', () => {
    expect(keyToAction('KeyT')).toEqual({ kind: 'press', action: 'portalMode' });
    const def = touchButtonDef('portalMode');
    expect(def).toBeTruthy();
    expect(def.kind).toBe('tap');
    expect(def.slot).toBe('ability');
    expect(TOUCH_BUTTONS.filter((b) => b.name === 'portalMode')).toHaveLength(1);
  });

  it('düğme basışı portalMode olayı yayar (oyun içi); panel açıkken (gameplay kapalı) yayılmaz', () => {
    const events = [];
    let gameplay = true;
    const press = createButtonPress({
      getCfg: () => ({}),
      hold: {},
      pend: {},
      latch: {},
      emit: (name, extra) => events.push([name, extra]),
      haptic: () => {},
      gesture: () => {},
      isActive: () => true,
      isGameplay: () => gameplay,
      isDisposed: () => false,
      jumpTap: { tap: () => false },
      now: () => 0,
    });
    expect(press('portalMode', true)).toBe(true);
    expect(events).toEqual([['portalMode', undefined]]);
    gameplay = false;
    expect(press('portalMode', true)).toBe(false);
    expect(events).toHaveLength(1);
  });
});
