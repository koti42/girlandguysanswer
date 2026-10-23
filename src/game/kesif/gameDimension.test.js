/*
 * gameDimension (boyut yöneticisi): swap hattı, DIM_BOUND_FIELDS, havuz devri, retire tripwire, dinleyici sabitliği, hazırlık (prewarm), stash, kayıt parçaları.
 * Gerçek World/TechState/PuzzleManager/EntityManager + gerçek sistemler; render sahte (dimTestKit).
 */
import { describe, expect, it, vi } from 'vitest';
import { DIM_BOUND_FIELDS, PER_DIM_SYSTEMS, PREWARM_RADIUS } from './gameDimension.js';
import { makeDimG } from './dimTestKit.js';
import { registerDimBound, unregisterDimBound } from './sim/dim/travel.js';

vi.setConfig({ testTimeout: 120000 });

function listenerTotals(world) {
  const out = {};
  Object.keys(world._listeners).forEach((k) => { out[k] = world._listeners[k].length; });
  return out;
}

describe('DIM_BOUND_FIELDS', () => {
  it('sözleşmedeki 16 alan, sözleşme sırasıyla', () => {
    expect(Array.from(DIM_BOUND_FIELDS)).toEqual([
      'world', 'tech', 'chests', 'em', 'spawner', 'puzzles', 'props', 'colliders', 'crowd', 'vehicles', 'clock', 'weatherSim', 'spawn', 'chunkManager', 'worldRoot', 'entityRoot',
    ]);
    expect(Object.isFrozen(DIM_BOUND_FIELDS)).toBe(true);
  });

  it('boyuta özgü sistem listesi donuk ve bilinen sistem adları', () => {
    expect(Array.from(PER_DIM_SYSTEMS)).toEqual(['blocks', 'mobs', 'content', 'treefall', 'tech', 'props']);
  });
});

describe('swap hattı', () => {
  it('overworld → neon: her bağlı alan yeniden atanır, G.world ATOMİK değişir, eski dünya emekli', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    const ow = G.world;
    const owCtx = mgr.get('overworld');
    expect(G.dim).toBe('overworld');
    const r = mgr.swap('neon', { reason: 'debug' });
    expect(r.ok).toBe(true);
    expect(G.dim).toBe('neon');
    const nc = mgr.get('neon');
    DIM_BOUND_FIELDS.forEach((f) => {
      const v = nc[f] === undefined ? null : nc[f];
      expect(G[f]).toBe(v);
    });
    expect(G.world).not.toBe(ow);
    expect(G.world.dim).toBe('neon');
    expect(ow.retired).toBe(true);
    expect(owCtx.world).toBe(ow);
    // eski dünyaya erişim test ortamında FIRLATIR (tripwire)
    expect(() => ow.getBlock(0, 64, 0)).toThrow(/Emekli dünya/);
    expect(mgr.stats.staleWorldHits).toBe(1);
    // şehir bağlamı: boş yönetici + prop katmanı + terminaller + boş doğurucu
    expect(nc.puzzles).toBeTruthy();
    expect(nc.puzzles.ownerAt(0, 64, 0)).toBeFalsy();
    expect(nc.props).toBeTruthy();
    expect(G.world.colliders).toBe(nc.colliders);
    expect(nc.terminals.list).toHaveLength(16);
    expect(nc.spawner.update).toBeTypeOf('function');
    expect(G.clock.dayLengthSec).toBe(600);
    expect(G.weatherSim.table).toBe('neon');
  });

  it('neon → overworld: alanlar geri bağlanır, dünya canlandırılır, çıkış pozu korunur', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    const ow = G.world;
    const clock = G.clock;
    const em = G.em;
    k.place(10.5, 60, 4.5, 1.2);
    mgr.swap('neon', { reason: 'debug' });
    mgr.swap('overworld', { reason: 'debug', arrival: { x: 10.5, y: 60, z: 4.5, yaw: 1.2 } });
    expect(G.dim).toBe('overworld');
    expect(G.world).toBe(ow);
    expect(ow.retired).toBe(false);
    expect(G.clock).toBe(clock);
    expect(G.em).toBe(em);
    expect(G.world.getBlock(0, 40, 0)).not.toBeNull(); // canlı
    expect(mgr.get('neon').world.retired).toBe(true);
  });

  it('aynı boyuta swap ve bilinmeyen boyut reddedilir/güvenli', () => {
    const k = makeDimG();
    expect(k.mgr.swap('overworld').ok).toBe(false);
    const r = k.mgr.swap('__proto__', {});
    expect(r.ok).toBe(false); // cleanDimId → 'overworld' → aynı
    expect(k.G.dim).toBe('overworld');
  });

  it('olaylar: dimensionLeft / dimensionEntered{first} / dimensionChanged; ikinci girişte first=false; silent bastırır', () => {
    const k = makeDimG();
    const ev = [];
    k.G.callbacks.onEvent = (e) => ev.push(e);
    k.mgr.swap('neon', { reason: 'debug' });
    k.mgr.swap('overworld', { reason: 'debug' });
    k.mgr.swap('neon', { reason: 'debug' });
    const entered = ev.filter((e) => e.type === 'dimensionEntered');
    expect(entered.map((e) => [e.dim, e.first])).toEqual([['neon', true], ['overworld', false], ['neon', false]]);
    expect(ev.filter((e) => e.type === 'dimensionLeft').map((e) => e.dim)).toEqual(['overworld', 'neon', 'overworld']);
    const before = ev.length;
    k.mgr.swap('overworld', { reason: 'restore', silent: true });
    expect(ev.length).toBe(before);
  });

  it('applyLook her swap sonunda çağrılır (hedef boyutla)', () => {
    const k = makeDimG();
    k.mgr.swap('neon');
    k.mgr.swap('overworld');
    expect(k.looks).toEqual(['neon', 'overworld']);
  });

  it('beforeDimension → onDimension sırası; her sistem hedef/kaynak DimCtx alır', () => {
    const k = makeDimG();
    const calls = [];
    k.G.addSystem({
      name: 'spy', order: 500, beforeDimension: (G, f, t) => calls.push(['before', f.id, t.id, G.dim]), onDimension: (G, f, t) => calls.push(['on', f.id, t.id, G.dim]),
    });
    k.mgr.swap('neon');
    expect(calls).toEqual([['before', 'overworld', 'neon', 'overworld'], ['on', 'overworld', 'neon', 'neon']]);
  });

  it('gövde varışa taşınır: Kapı Meydanı terminal önü (0.5, 64, 2.5), meydana (+z) bakar; dönüşte bağlantı noktası', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    k.place(20.5, 50, 20.5, 0.4);
    mgr.swap('neon', { linkFrom: { x: 18.5, y: 50, z: 18.5, yaw: 0.4 }, reason: 'gate' });
    expect(G.body.x).toBeCloseTo(0.5, 5);
    expect(G.body.y).toBeCloseTo(64, 5);
    expect(G.body.z).toBeCloseTo(2.5, 5);
    expect(Math.abs(Math.cos(G.player.yaw) + 1)).toBeLessThan(1e-9); // yaw π: −z'den uzağa
    expect(mgr.dimMeta.link.from.slice(0, 3)).toEqual([18.5, 50, 18.5]);
    expect(mgr.dimMeta.visits).toBe(1);
    expect(mgr.dimMeta.lastHopAt).toBeGreaterThanOrEqual(0);
    mgr.swap('overworld', { reason: 'terminal' });
    expect(Math.abs(G.body.x - 18.5)).toBeLessThan(28);
    expect(Math.abs(G.body.z - 18.5)).toBeLessThan(28);
  });

  it("'home' dönüşü başlangıç noktasına (overworld spawn)", () => {
    const k = makeDimG();
    const { G, mgr } = k;
    const sp = { x: G.spawn.x, z: G.spawn.z };
    k.place(40.5, 55, 40.5, 0);
    mgr.swap('neon', { linkFrom: { x: 40.5, y: 55, z: 40.5, yaw: 0 }, reason: 'gate' });
    mgr.swap('overworld', { reason: 'home', home: true });
    expect(Math.abs(G.body.x - sp.x)).toBeLessThan(30);
    expect(Math.abs(G.body.z - sp.z)).toBeLessThan(30);
  });
});

describe('işçi havuzu / yönetici devri', () => {
  it('eski yönetici havuzu bırakır, yeni yönetici devralır; 50 swap sonunda toplam havuz sayısı sabit', () => {
    const k = makeDimG();
    const { mgr } = k;
    const created = () => k.cms.length;
    mgr.swap('neon');
    const afterFirst = created();
    expect(k.cms[0].disposed).toBe(true);
    const cur = k.G.chunkManager;
    expect(cur.hidden).toBe(false);
    expect(cur.adopted.length === 1 || cur.pool !== null).toBe(true);
    for (let i = 0; i < 50; i++) mgr.swap(i % 2 === 0 ? 'overworld' : 'neon');
    const alive = k.cms.filter((m) => !m.disposed);
    expect(alive).toHaveLength(1); // yalnız etkin yönetici canlı
    const pools = k.cms.filter((m) => m.pool).length;
    expect(pools).toBe(1);
    expect(created()).toBeGreaterThan(afterFirst);
  });

  it('prewarm: gizli yönetici (1 işçi, r=3) kurulur; swap onu etkinleştirir ve havuzu devralır; iptal edilirse atılır', () => {
    const k = makeDimG();
    const { mgr, G } = k;
    expect(mgr.prewarm('neon', { pos: { x: 0.5, y: 64, z: 2.5 } })).toBe(true);
    const nc = mgr.get('neon');
    expect(nc.chunkManager.hidden).toBe(true);
    expect(nc.chunkManager.viewDist).toBe(PREWARM_RADIUS);
    expect(nc.chunkManager.pool).toBeTruthy();
    expect(mgr.stats.prewarms).toBe(1);
    mgr.tickPrewarm(0.016);
    expect(nc.chunkManager.updates.length).toBe(1);
    const prewarmed = nc.chunkManager;
    mgr.swap('neon');
    expect(G.chunkManager).toBe(prewarmed);
    expect(prewarmed.hidden).toBe(false);
    expect(prewarmed.adopted.length).toBe(1);
    // iptal
    mgr.prewarm('overworld', { pos: { x: 0, y: 55, z: 0 } });
    const owc = mgr.get('overworld');
    expect(owc.chunkManager.hidden).toBe(true);
    mgr.cancelPrewarm('overworld');
    expect(owc.chunkManager).toBeNull();
    expect(owc.world.retired).toBe(true);
  });

  it('yığın %85 üstünde prewarm iptal edilir (hold evresi soğuk yükler)', () => {
    const k = makeDimG({ heap: 0.9 });
    expect(k.mgr.prewarm('neon')).toBe(false);
    expect(k.mgr.stats.prewarmAborts).toBe(1);
    expect(k.mgr.get('neon') === null || k.mgr.get('neon').chunkManager === null).toBe(true);
  });

  it('prewarm sürerken yığın tırmanırsa gizli yönetici atılır ve dünya emekli edilir', () => {
    const heapRef = { v: 0 };
    const k = makeDimG({ heapRef });
    k.mgr.prewarm('neon', { pos: { x: 0, y: 64, z: 0 } });
    const ctx = k.mgr.get('neon');
    expect(ctx.chunkManager).toBeTruthy();
    heapRef.v = 0.95;
    k.mgr.tickPrewarm(0.016);
    expect(ctx.chunkManager).toBeNull();
    expect(k.mgr.stats.prewarmAborts).toBe(1);
    expect(ctx.world.retired).toBe(true);
  });
});

describe('dinleyici sabitliği ve bayat dünya (50 swap)', () => {
  it("world._listeners her iki dünyada 50 swap boyunca sabit; stale tripwire 0 (sistemler 2000 sabit adım sonra bile eski dünyaya dokunmaz)", () => {
    const k = makeDimG();
    const { G, mgr } = k;
    k.step(30);
    mgr.swap('neon');
    k.step(60);
    mgr.swap('overworld');
    k.step(60);
    const ow = mgr.get('overworld').world;
    const nw = mgr.get('neon').world;
    const base = { ow: listenerTotals(ow), nw: listenerTotals(nw) };
    for (let i = 0; i < 50; i++) {
      mgr.swap(i % 2 === 0 ? 'neon' : 'overworld');
      k.step(40);
    }
    expect(G.dim).toBe('overworld');
    expect(listenerTotals(ow)).toEqual(base.ow);
    expect(listenerTotals(nw)).toEqual(base.nw);
    k.step(2000);
    expect(mgr.stats.staleWorldHits).toBe(0);
  });

  it('retire sayacı: eski dünyada 3 erişim = 3 vuruş (onStale), üretimde zararsız dönüş modu ayrı testte', () => {
    const k = makeDimG();
    k.mgr.swap('neon');
    const ow = k.mgr.get('overworld').world;
    let hits = 0;
    ow.retire({ mode: 'count', onStale: () => { hits++; } });
    expect(ow.getBlock(1, 1, 1)).toBeNull();
    expect(ow.setBlock(1, 1, 1, 3)).toBe(false);
    expect(ow.ensureChunk(5, 5)).toBeNull();
    expect(hits).toBe(3);
  });
});

describe('item stash (§15): şehirden çıkarken dimBound eşyalar saklanır, girişte geri verilir', () => {
  it('çıkışta toast + envanterden çıkar; girişte geri; sığmayan kalır (kaybolmaz)', () => {
    registerDimBound('neon', ['item:elma']);
    try {
      const k = makeDimG();
      const { G, mgr } = k;
      G.inventory.add('item:elma', 3);
      G.inventory.add('blok:taş', 5);
      mgr.swap('neon');
      expect(G.inventory.count('item:elma')).toBe(3); // şehre girerken bağlı eşya kalır (şehre özgü)
      mgr.swap('overworld');
      expect(G.inventory.count('item:elma')).toBe(0);
      expect(G.inventory.count('blok:taş')).toBe(5); // genel eşyalar iki yönde geçer
      expect(mgr.get('neon').stash).toHaveLength(1);
      expect(k.hints.some((h) => /saklandı/.test(h.text))).toBe(true);
      mgr.swap('neon');
      expect(G.inventory.count('item:elma')).toBe(3);
      expect(mgr.get('neon').stash).toHaveLength(0);
      expect(k.hints.some((h) => /geri verildi/.test(h.text))).toBe(true);
    } finally {
      unregisterDimBound('neon');
    }
  });
});

describe('terminaller / yeniden doğuş noktası', () => {
  it('markTerminal: yalnız ilk kez true; spawn terminalin varış noktası olur; respawnPoint en yakın bulunmuş terminali verir', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    mgr.swap('neon');
    const list = mgr.get('neon').terminals.list;
    expect(mgr.markTerminal(3)).toBe(true);
    expect(mgr.markTerminal(3)).toBe(false);
    expect(mgr.isTerminalFound(3)).toBe(true);
    expect(mgr.isTerminalFound(4)).toBe(false);
    expect(Math.abs(G.spawn.x - list[3].x)).toBeLessThan(5);
    G.body.x = list[3].x + 5;
    G.body.z = list[3].z + 5;
    G.body.y = list[3].y;
    const rp = mgr.respawnPoint();
    expect(rp.index).toBe(3);
    mgr.swap('overworld');
    expect(mgr.respawnPoint()).toBeNull();
  });
});

describe('kayıt parçaları (saveParts) ve sistem anlık görüntüsü', () => {
  it('şehirdeyken üst düzey alanlar overworld\'ündür; dims.neon şehir blobu; sistemler overworld anlık görüntüsünden', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    G.chests.set('1,50,1', [{ item: 'item:elma', count: 1 }]);
    k.step(5);
    mgr.swap('neon');
    G.chests.set('9,64,9', [{ item: 'item:elma', count: 2 }]); // şehir sandığı: ctx.chests
    k.step(5);
    const p = mgr.saveParts();
    expect(p.dim).toBe('neon');
    expect(p.world.dim).toBe('overworld');
    expect(p.chests.has('1,50,1')).toBe(true);
    expect(p.chests.has('9,64,9')).toBe(false);
    expect(p.dims.neon).toBeTruthy();
    expect(p.dims.neon.v).toBe(1);
    const sys = mgr.serializeSystems();
    // blocks/tech snapshot donmuş overworld'den (şehir sandığı yok)
    expect(JSON.stringify(sys.blocks || {})).not.toContain('9,64,9');
    mgr.swap('overworld');
    expect(mgr.saveParts().dim).toBe('overworld');
  });

  it('yüklenmemiş şehir blobu (restoreMeta) yeniden kayıtta kaybolmaz; şehir ctx kurulunca uygulanır', () => {
    const k = makeDimG();
    const { mgr } = k;
    const blob = { v: 1, edits: {}, clock: null, weather: null, spawn: null, terminals: 5, props: {}, locks: { kapi1: 1 }, chests: {}, tech: null, entities: [], stash: [], city: null };
    mgr.restoreMeta({ calibrated: true, visits: 4, link: null, overworldPos: [1, 55, 2], lastHopAt: 3 }, { neon: blob });
    expect(mgr.dimMeta.calibrated).toBe(true);
    expect(mgr.dimMeta.visits).toBe(4);
    const p0 = mgr.saveParts();
    expect(p0.dims.neon).toBe(blob); // henüz kurulmadı: aynen taşınır
    mgr.swap('neon');
    expect(mgr.get('neon').terminals.found).toBe(5);
    expect(mgr.get('neon').locks.kapi1).toBe(1);
    const p1 = mgr.saveParts();
    expect(p1.dims.neon.terminals).toBe(5);
  });
});

describe('dispose', () => {
  it('çalışmaz kalır, tüm yöneticiler atılır, ikinci dispose zararsız', () => {
    const k = makeDimG();
    k.mgr.prewarm('neon');
    k.mgr.dispose();
    expect(k.mgr.disposed).toBe(true);
    expect(k.mgr.swap('neon').ok).toBe(false);
    k.mgr.dispose();
  });
});
