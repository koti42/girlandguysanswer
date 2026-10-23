import { describe, expect, it, vi } from 'vitest';
import {
  createGameContext, createSystemRegistry, emitEvent, PUBLIC_EVENTS, PAUSING_UI, makeMutableHud, callSafe,
} from './gameCtx.js';
import { EMPTY_HUD, sanitizeHud } from './hudStore.js';
import { Progression } from './sim/progression.js';

function mkG(extra) {
  const cbEvents = [];
  const G = createGameContext({ callbacks: { onEvent: (e) => cbEvents.push(e) }, strictSystems: false, ...(extra || {}) }, { mode: 'macera', seed: 5 });
  G.cbEvents = cbEvents;
  return G;
}

describe('sistem kayıt defteri', () => {
  it('order sırası + eşitlikte eklenme sırası', () => {
    const r = createSystemRegistry();
    r.add({ name: 'c', order: 10 });
    r.add({ name: 'a', order: -5 });
    r.add({ name: 'b1' });
    r.add({ name: 'b2', order: 0 });
    expect(r.list().map((s) => s.name)).toEqual(['a', 'b1', 'b2', 'c']);
    expect(r.get('b2').name).toBe('b2');
    expect(r.has('zzz')).toBe(false);
  });

  it('ad çakışması, geçersiz sistem ve kanca türü hata verir', () => {
    const r = createSystemRegistry();
    r.add({ name: 'x' });
    expect(() => r.add({ name: 'x' })).toThrow(/zaten kayıtlı/);
    expect(() => r.add(null)).toThrow();
    expect(() => r.add({})).toThrow(/name/);
    expect(() => r.add({ name: 'y', fixedUpdate: 5 })).toThrow(/fonksiyon/);
    expect(() => r.add({ name: 'z', order: NaN })).toThrow(/order/);
  });

  it('api birleştirme: çakışma = hata (çekirdek-sistem ve sistem-sistem)', () => {
    const r = createSystemRegistry();
    r.add({ name: 'a', api: () => ({ foo: 1, bar: 2 }) });
    r.add({ name: 'b', order: 1, api: () => ({ baz: 3 }) });
    const out = r.mergeApi({ start: 1 }, {});
    expect(out).toMatchObject({ start: 1, foo: 1, bar: 2, baz: 3 });
    const r2 = createSystemRegistry();
    r2.add({ name: 'a', api: () => ({ foo: 1 }) });
    r2.add({ name: 'b', api: () => ({ foo: 2 }) });
    expect(() => r2.mergeApi({}, {})).toThrow(/api çakışması: "foo".*a.*b/);
    const r3 = createSystemRegistry();
    r3.add({ name: 'a', api: () => ({ start: 2 }) });
    expect(() => r3.mergeApi({ start: 1 }, {})).toThrow(/çekirdek/);
  });

  it('serialize/restore sistem adı altında', () => {
    const r = createSystemRegistry();
    let got = null;
    r.add({ name: 'a', serialize: () => ({ n: 1 }), restore: (_G, o) => { got = o; } });
    r.add({ name: 'b', serialize: () => null });
    const s = r.serialize({});
    expect(s).toEqual({ a: { n: 1 } });
    r.restore({}, s);
    expect(got).toEqual({ n: 1 });
  });
});

describe('G bağlamı', () => {
  it('addendum §G alanları mevcut', () => {
    const G = mkG();
    ['THREE', 'opts', 'mode', 'seed', 'worldCode', 'container', 'callbacks', 'renderer', 'scene', 'camera', 'sky', 'weatherLayer',
      'postfx', 'materials', 'atlas', 'atlasPixels', 'chunkManager', 'particles', 'highlight', 'quality', 'viewModel', 'character',
      'worldRoot', 'entityRoot', 'world', 'inventory', 'survival', 'body', 'abilities', 'clock', 'weatherSim', 'progression', 'puzzles',
      'em', 'spawner', 'combat', 'chests', 'spawn', 'player', 'input', 'audio', 'hud', 'publishHud', 'hudStore', 'time', 'emit', 'sound',
      'fx', 'speak', 'haptic', 'setUi', 'getSystem', 'addSystem', 'destroyed', 'debug'].forEach((k) => {
      expect(Object.prototype.hasOwnProperty.call(G, k), k).toBe(true);
    });
    expect(Object.keys(G.player)).toEqual(expect.arrayContaining(['yaw', 'pitch', 'cameraMode', 'flying', 'sprinting', 'crouching', 'dead', 'deathInfo', 'heldKey', 'blocking', 'lastCheckpoint']));
    expect(Object.keys(G.time)).toEqual(expect.arrayContaining(['tick', 'seconds', 'dt', 'frame', 'paused', 'playTime']));
    expect(G.chests instanceof Map).toBe(true);
  });

  it('addSystem init: başlatılmışsa hemen, değilse bekler; getSystem bulur', () => {
    const G = mkG();
    const init = vi.fn();
    G.addSystem({ name: 'a', init });
    expect(init).not.toHaveBeenCalled();
    G._initialized = true;
    const init2 = vi.fn();
    G.addSystem({ name: 'b', init: init2 });
    expect(init2).toHaveBeenCalledTimes(1);
    expect(G.getSystem('a').name).toBe('a');
    expect(G.getSystem('yok')).toBeNull();
  });

  it('callSafe: hata yutulur (strict değilse), strict ise fırlar', () => {
    const G = mkG();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(callSafe(G, { name: 's' }, 'h', () => { throw new Error('x'); })).toBeUndefined();
    spy.mockRestore();
    G.opts.strictSystems = true;
    expect(() => callSafe(G, { name: 's' }, 'h', () => { throw new Error('x'); })).toThrow('x');
  });

  it('makeMutableHud: sanitizeHud ile uyumlu, alanlar mutasyona açık', () => {
    const h = makeMutableHud(null, 'insa');
    expect(h.mode).toBe('insa');
    expect(h.hotbar.length).toBe(9);
    h.hp = 7;
    expect(sanitizeHud(h).hp).toBe(7);
    expect(Object.keys(EMPTY_HUD).sort()).toEqual(Object.keys(h).sort());
  });

  it('sabitler', () => {
    expect(PAUSING_UI.pause).toBe(true);
    expect(PAUSING_UI.inventory).toBeUndefined();
    ['zoneEnter', 'puzzleSolved', 'reward', 'death', 'victory'].forEach((k) => expect(PUBLIC_EVENTS).toContain(k));
  });
});

describe('olay boru hattı (G.emit)', () => {
  it('önce sistemler, sonra progression, sonra yalnız PUBLIC olaylar callbacks.onEvent', () => {
    const G = mkG();
    G.progression = new Progression(1, { mode: 'macera' });
    const order = [];
    G.addSystem({ name: 's', onEvent: (_G, e) => order.push('sys:' + e.type) });
    const spy = vi.spyOn(G.progression, 'onEvent');
    G.emit({ type: 'zoneEnter', zone: 0 });
    G.emit({ type: 'tick', dt: 0.1, x: 1, z: 1 });
    expect(order).toEqual(['sys:zoneEnter', 'sys:tick']);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(G.cbEvents.map((e) => e.type)).toEqual(['zoneEnter']);
  });

  it('progression çıktısı uygulanır: türetilen olaylar yeniden yayılır, rewards → reward olayı, giveItems → envanter', () => {
    const G = mkG();
    const got = [];
    G.addSystem({ name: 's', onEvent: (_G, e) => got.push(e.type) });
    const added = [];
    G.inventory = { add: (k, n) => { added.push([k, n]); return 0; } };
    G.world = { unlockZone: vi.fn() };
    G.progression = {
      abilities: {},
      onEvent: (e) => (e.type === 'x' ? {
        events: [{ type: 'achievement', id: 'a' }],
        rewards: [{ key: 'zone:1:boss' }],
        unlockZones: [2],
        grantAbilities: ['grapple'],
        giveItems: [{ item: 'item:kazma_ahsap', count: 1 }],
      } : { events: [], rewards: [], unlockZones: [], grantAbilities: [], giveItems: [] }),
    };
    G.emit({ type: 'x' });
    expect(got).toEqual(['x', 'achievement', 'reward']);
    expect(G.world.unlockZone).toHaveBeenCalledWith(2);
    expect(G.abilities.grapple).toBe(true);
    expect(G.progression.abilities.grapple).toBe(true);
    expect(added).toEqual([['item:kazma_ahsap', 1]]);
    expect(G.cbEvents.map((e) => e.type)).toEqual(['achievement', 'reward']);
  });

  it('iç içe emit sıraya alınır (yeniden giriş yok); sonsuz döngü 256 olayda kesilir', () => {
    const G = mkG();
    const seen = [];
    G.addSystem({
      name: 's',
      onEvent: (_G, e) => {
        seen.push(e.type);
        if (e.type === 'a') G.emit({ type: 'b' });
      },
    });
    G.emit({ type: 'a' });
    expect(seen).toEqual(['a', 'b']);
    const G2 = mkG();
    let n = 0;
    G2.addSystem({ name: 'loop', onEvent: () => { n++; G2.emit({ type: 'again' }); } });
    G2.emit({ type: 'again' });
    expect(n).toBeLessThanOrEqual(260);
    expect(G2._emitting).toBe(false);
  });

  it('sistem onEvent hatası diğer sistemleri/olayı engellemez', () => {
    const G = mkG();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = vi.fn();
    G.addSystem({ name: 'bad', order: 0, onEvent: () => { throw new Error('boom'); } });
    G.addSystem({ name: 'good', order: 1, onEvent: ok });
    G.emit({ type: 'reward', key: 'k' });
    expect(ok).toHaveBeenCalledTimes(1);
    expect(G.cbEvents.length).toBe(1);
    spy.mockRestore();
  });

  it('yok sayma: geçersiz olay ve yıkılmış bağlam', () => {
    const G = mkG();
    emitEvent(G, null);
    emitEvent(G, { nope: 1 });
    G.destroyed = true;
    emitEvent(G, { type: 'reward' });
    expect(G.cbEvents.length).toBe(0);
  });
});

describe('yedek (soft) api adları', () => {
  it('sistem yedek adı verirse kazanır; iki sistem aynı yedek adı verirse yine çakışma', () => {
    const r = createSystemRegistry();
    r.add({ name: 'session', api: () => ({ respawn: () => 'sistem' }) });
    const out = r.mergeApi({ respawn: () => 'çekirdek', start: 1 }, {}, null, ['respawn']);
    expect(out.respawn()).toBe('sistem');
    const r2 = createSystemRegistry();
    r2.add({ name: 'a', api: () => ({ respawn: 1 }) });
    r2.add({ name: 'b', api: () => ({ respawn: 2 }) });
    expect(() => r2.mergeApi({ respawn: 0 }, {}, null, ['respawn'])).toThrow(/api çakışması/);
    const r3 = createSystemRegistry();
    r3.add({ name: 'a', api: () => ({ start: 1 }) });
    expect(() => r3.mergeApi({ respawn: 0, start: 0 }, {}, null, ['respawn'])).toThrow(/çekirdek/);
  });
});

describe('yetenek verme (G.grantAbility)', () => {
  it('progression yeteneği açılır, G.abilities güncellenir, türetilen olaylar yayılır', () => {
    const G = mkG();
    G.progression = new Progression(3, { mode: 'macera' });
    G.inventory = { add: () => 0 };
    G.world = { unlockZone: () => 0 };
    const got = [];
    G.addSystem({ name: 's', onEvent: (_G, e) => got.push(e.type) });
    G.grantAbility('doubleJump');
    expect(G.progression.abilities.doubleJump).toBe(true);
    expect(G.abilities.doubleJump).toBe(true);
    expect(got).toContain('ability');
    expect(G.cbEvents.some((e) => e.type === 'ability')).toBe(true);
  });
});
