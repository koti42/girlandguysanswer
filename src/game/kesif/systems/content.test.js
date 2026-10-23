/*
 * content sistemi — entegrasyon: yapı kaydı, bulmaca köprüsü, parkur, ödül kuyruğu, harita/günlük, rehberlik, ipuçları.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { BIOME_KEYS } from '../sim/constants.js';
import { fx as pfx, registerPuzzle, unregisterPuzzle } from '../sim/puzzles/index.js';
import { MAP_GRID } from '../sim/progressionMap.js';
import { makeContentG, anchorOf } from './contentTestKit.js';
import { applyEffect, structureSolved } from './contentPuzzles.js';
import { mapApi, MAP_PALETTE } from './contentMap.js';
import {
  directionText, getGuidance, nearestOfType, questTarget,
} from './contentGuide.js';
import { paintTiles } from './contentMap.js';

const SEED = 12345;

/* --- test bulmacası: olayları kaydeder --- */
const received = [];
function registerTestPuzzle() {
  registerPuzzle('testplaka', {
    name: 'Test Plakası',
    difficultyRange: [1, 1],
    footprint: () => ({ w: 5, d: 5, h: 4 }),
    build: (ctx) => ({
      state: {
        n: 0, pushed: 0, portal: 0, shots: 0, used: 0,
      },
      anchors: { plate: { x: ctx.origin.x, y: ctx.origin.y, z: ctx.origin.z + 1 } },
    }),
    restore: () => {},
    interact(ctx, state, ev) {
      received.push(ev);
      const s = Object.assign({}, state);
      const effects = [];
      if (ev.type === 'step') {
        if (ev.dx || ev.dz) s.pushed++;
        else s.n++;
      } else if (ev.type === 'entity') s.portal++;
      else if (ev.type === 'portalShot') s.shots++;
      else if (ev.type === 'use') {
        s.used++;
        effects.push(pfx.message('Kolu çektin.'));
      }
      if (s.n >= 3) effects.push(pfx.solved());
      return { state: s, effects };
    },
    isSolved: (s) => s.n >= 3,
  });
}

afterEach(() => {
  unregisterPuzzle('testplaka');
  received.length = 0;
});

function room() {
  const kit = makeContentG({ seed: SEED, pos: { x: 5.5, y: 70, z: 6.5 } });
  kit.init();
  registerTestPuzzle();
  kit.load(5, 5, 24);
  kit.G.puzzles.register('t1', {
    type: 'testplaka', origin: { x: 5, y: 70, z: 5 }, facing: 0, difficulty: 1, zone: 0,
  });
  kit.G.world.setBlock(5, 70, 6, B.PRESSURE_PLATE);
  return kit;
}

describe('content: yapı kayıt defteri', () => {
  it('init: spawn çevresindeki yapılar kaydolur; sandık/tabela/güvenli bölge/bulmaca tanımları yazılır', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G, S } = kit;
    expect(S.structs.size).toBeGreaterThan(8);
    expect(G.structureChests.size).toBeGreaterThan(5);
    expect(G.structureSigns.size).toBeGreaterThan(5);
    expect(G.safeZones.length).toBeGreaterThan(0);
    expect(G.puzzles.size).toBeGreaterThan(0); // yakın tapınakların bulmacaları kayıtlı
    const first = G.structureChests.values().next().value;
    expect(first).toMatchObject({ structType: expect.any(String), structureId: expect.any(String) });
    expect(Array.isArray(first.loot)).toBe(true);
    expect(G.content).toBe(S);
  });

  it('ışınlanınca uzak yapılar kademeli yüklenir (kare başına en çok bir hücre); eski yapılar boşalır, bulmaca durumu kaybolmaz', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G, S } = kit;
    const t1 = anchorOf(SEED, 'anahtartapinagi', 0, 0);
    const rec = S.structs.get(t1.id);
    kit.solveStructure(rec);
    expect(structureSolved(S, rec)).toEqual({ solved: t1.puzzles.length, total: t1.puzzles.length });
    const before = S.structs.size;
    kit.tp(500, 70, 400);
    kit.step(1);
    expect(S.cellQueue.length).toBeGreaterThan(0);
    // yeni cell kuyruğu bir sabit adımda tek hücre işler
    const q0 = S.cellQueue.length;
    kit.step(1);
    expect(S.cellQueue.length).toBe(q0 - 1);
    kit.step(60 * 4);
    expect(S.structs.has(t1.id)).toBe(false); // 256+ blok ötede boşaldı
    expect(G.puzzles.has(t1.puzzles[0].id)).toBe(false);
    // çözülmüş durum "bekleyen" olarak korunur
    expect(G.puzzles.isSolved(t1.puzzles[0].id)).toBe(true);
    const ser = G.puzzles.serialize();
    expect(ser[t1.puzzles[0].id].solved).toBe(true);
    expect(S.known.has(t1.id)).toBe(true); // işaret kalıcı
    expect(before).toBeGreaterThan(0);
    // geri dönünce yeniden kaydolur ve çözülmüş kalır
    kit.tp(-27, 58, 40);
    kit.step(60 * 2);
    expect(S.structs.has(t1.id)).toBe(true);
    expect(G.puzzles.has(t1.puzzles[0].id)).toBe(true);
    expect(G.puzzles.get(t1.puzzles[0].id).solved).toBe(true);
  });

  it('keşif: yapıya ≤ 24 blok kala bir kez structureDiscovered; ilerleme + büyük başlık; kayıtlı keşif yeniden yayılmaz', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 300, y: 70, z: 300 } });
    kit.init();
    const { G, S } = kit;
    const t1 = anchorOf(SEED, 'anahtartapinagi', 0, 1);
    kit.tp(t1.x + 40, t1.y, t1.z);
    kit.step(60 * 3);
    expect(kit.emitted('structureDiscovered').filter((e) => e.id === t1.id).length).toBe(0);
    kit.tp(t1.x + 10, t1.y, t1.z);
    kit.step(60);
    const ev = kit.emitted('structureDiscovered').filter((e) => e.id === t1.id);
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ structType: 'anahtartapinagi', zone: 0 });
    expect(G.progression.discovered.structures).toContain(t1.id);
    expect(G.hud.banner.text).toBe('Anahtar Tapınağı');
    kit.step(60 * 3);
    expect(kit.emitted('structureDiscovered').filter((e) => e.id === t1.id).length).toBe(1);
    expect(S.known.get(t1.id).exact).toBe(true);
    // kayıttan yükleme: keşfedilmiş id yaklaşık işaret olarak bilinir, yakınlaşınca yayılmaz
    const k2 = makeContentG({ seed: SEED, pos: { x: t1.x + 10, y: t1.y, z: t1.z } });
    k2.G.progression.restore(G.progression.serialize());
    k2.init();
    k2.step(60);
    expect(k2.emitted('structureDiscovered').filter((e) => e.id === t1.id).length).toBe(0);
  });

  it('kayıtlı keşiften gelen yaklaşık işaret gerçek yapı görülünce düzelir', () => {
    const t1 = anchorOf(SEED, 'anahtartapinagi', 0, 0);
    const kit = makeContentG({ seed: SEED, pos: { x: 600, y: 70, z: 600 } });
    kit.G.progression.discovered.structures.push(t1.id);
    kit.init();
    const k = kit.S.known.get(t1.id);
    expect(k.exact).toBe(false);
    expect(Math.hypot(k.x - t1.x, k.z - t1.z)).toBeLessThan(90); // yaklaşık işaret hücre merkezine yakın: en çok hücre köşegeni (≈ 90)
    kit.tp(t1.x, t1.y, t1.z);
    kit.step(60 * 2);
    expect(kit.S.known.get(t1.id).exact).toBe(true);
    expect(kit.S.known.get(t1.id).x).toBe(t1.x);
  });

  it('insa modunda sistem etkisiz; api güvenli boş değerler döner', () => {
    const kit = makeContentG({ seed: SEED, mode: 'insa', pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    kit.step(30);
    expect(kit.S.structs.size).toBe(0);
    const info = kit.api.getMapInfo();
    expect(info.markers).toEqual([]);
    expect(info.tiles.w).toBe(0);
    expect(kit.api.getJournal().quests).toEqual([]);
    expect(kit.api.getPendingRewards()).toEqual([]);
  });
});

describe('content: bulmaca köprüsü', () => {
  it('plaka: oyuncu ayağındaki plakada her adım "step" gider; 3 adımda çözülür → kutlama iletisi + olay', () => {
    const kit = room();
    const { G } = kit;
    kit.step(3);
    const steps = received.filter((e) => e.type === 'step');
    expect(steps.length).toBe(3);
    expect(steps[0]).toMatchObject({ x: 5, y: 70, z: 6, playerId: 'player' });
    expect(kit.emitted('puzzleSolved')[0]).toMatchObject({ id: 't1', puzzleType: 'testplaka' });
    kit.step(2);
    expect(kit.S.fx.current()).toContain('Bulmaca çözüldü');
    expect(kit.speaks.some((t) => t.indexOf('Bulmaca çözüldü') === 0)).toBe(true);
    expect(kit.sounds.some((s) => s.name === 'puzzle_solved')).toBe(true);
    // plakadan inince event gelmez
    received.length = 0;
    G.body.x = 7.5;
    kit.step(5);
    expect(received.filter((e) => e.type === 'step').length).toBe(0);
  });

  it('itilebilir blok: yürüyüş yönünde (dx/dz) step; throttle 0,18 sn', () => {
    const kit = room();
    const { G } = kit;
    G.world.setBlock(5, 70, 8, B.PUSH_BLOCK);
    G.body.x = 5.5;
    G.body.z = 7.6;
    G.player.yaw = Math.PI; // ileri = +Z
    G.inputState.moveZ = 1;
    kit.step(1);
    const pushes = received.filter((e) => e.type === 'step' && e.dz === 1);
    expect(pushes.length).toBe(1);
    expect(pushes[0]).toMatchObject({ x: 5, y: 70, z: 8, dx: 0 });
    kit.step(5);
    expect(received.filter((e) => e.dz === 1).length).toBe(1); // 0,18 sn dolmadı
    kit.step(10);
    expect(received.filter((e) => e.dz === 1).length).toBeGreaterThan(1);
    // geri yürüyünce (blok arkada) itme yok
    received.length = 0;
    G.player.yaw = 0;
    kit.step(20);
    expect(received.filter((e) => e.dz === 1 || e.dz === -1).length).toBe(0);
    G.inputState.moveZ = 0;
  });

  it('portal hücresine temas: "entity" olayı yaw/vx/vz ile; portalShot olayı bulmacaya iletilir (handled işaretlenir)', () => {
    const kit = room();
    const { G } = kit;
    G.world.setBlock(6, 70, 6, B.PORTAL_BLUE);
    G.body.x = 6.5;
    G.body.z = 6.5;
    G.player.yaw = 1.25;
    G.body.vx = 2;
    G.body.vz = -1;
    kit.step(1);
    const ev = received.find((e) => e.type === 'entity');
    expect(ev).toMatchObject({ x: 6, y: 70, z: 6, playerId: 'player', yaw: 1.25, vx: 2, vz: -1 });
    const shot = {
      type: 'portalShot', x: 6, y: 71, z: 7, face: { nx: 0, ny: 0, nz: -1 }, color: 'mavi',
    };
    G.emit(shot);
    expect(received.some((e) => e.type === 'portalShot' && e.color === 'mavi')).toBe(true);
    expect(shot.handled).toBe(true);
  });

  it('blockUse → bulmaca; blocks sistemi handleInteract\'ı kendisi çağırdıysa aynı tikte çift işlenmez', () => {
    const kit = room();
    const { G } = kit;
    const evt = { type: 'blockUse', x: 6, y: 71, z: 7 };
    G.emit(evt);
    expect(received.filter((e) => e.type === 'use').length).toBe(1);
    expect(evt.handled).toBe(true);
    kit.step(2);
    expect(kit.S.fx.current()).toBe('Kolu çektin.');
    // blocks yolu: önce doğrudan handleInteract, sonra blockUse
    kit.step(1);
    received.length = 0;
    G.puzzles.handleInteract({ type: 'use', x: 6, y: 71, z: 7 });
    G.emit({ type: 'blockUse', x: 6, y: 71, z: 7 });
    expect(received.filter((e) => e.type === 'use').length).toBe(1);
  });

  it('gerçek tapınak bulmacası: blockUse bir çapaya ulaşınca durum değişir', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: -27, y: 58, z: 40 } });
    kit.init();
    const { G, S } = kit;
    const t1 = anchorOf(SEED, 'anahtartapinagi', 0, 0);
    expect(S.structs.get(t1.id).puzzlesOn).toBe(true);
    let changed = 0;
    for (let i = 0; i < t1.puzzles.length && !changed; i++) {
      const info = G.puzzles.get(t1.puzzles[i].id);
      if (!info) continue;
      const pts = [];
      const walk = (n, d) => {
        if (!n || typeof n !== 'object' || d > 5) return;
        if (Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)) pts.push([n.x, n.y, n.z]);
        Object.keys(n).forEach((k) => walk(n[k], d + 1));
      };
      walk(info.anchors, 0);
      for (let k = 0; k < pts.length && !changed; k++) {
        const before = JSON.stringify(G.puzzles.get(t1.puzzles[i].id).state);
        const evt = { type: 'blockUse', x: pts[k][0], y: pts[k][1], z: pts[k][2] };
        kit.step(1);
        G.emit(evt);
        if (JSON.stringify(G.puzzles.get(t1.puzzles[i].id).state) !== before) changed++;
      }
    }
    expect(changed).toBe(1);
  });

  it('yedek use algılama: blocks blockUse yayımlamazsa etkileşim kenarında hedef blok çözülür (boss kapısı ipucu)', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 10.5, y: 70, z: 14.5 } });
    kit.init();
    const { G, S } = kit;
    kit.load(10, 12, 16);
    G.world.setBlock(10, 71, 12, B.BOSS_DOOR);
    S.doorCells.set('10,71,12', { zone: 1, kind: 'door' });
    G.player.yaw = 0;
    G.player.pitch = 0;
    G.inputState.placePressed = true;
    kit.step(1);
    kit.step(1);
    expect(S.fx.current()).toContain('Mühür açılmadan geçemezsin');
    // elde yerleştirilebilir blok varsa (yerleştirme niyeti) dokunmaz
    S.fx.reset();
    G.inventory.add('blok:taş', 5);
    G.inventory.selected = G.inventory.find('blok:taş') !== undefined ? 0 : 0;
    kit.step(10);
    G.inputState.placePressed = true;
    kit.step(1);
    kit.step(1);
    expect(S.fx.current()).toBeNull();
  });

  it('efekt: teleport yaw/hız (keepMomentum) + yaratık ışınlama; carry yalnız üstündeki gövdeyi taşır', () => {
    const kit = room();
    const { G, S } = kit;
    G.body.vx = 3;
    G.body.vy = -4;
    applyEffect(S, { kind: 'teleport', x: 20.5, y: 80, z: 21.5, yaw: 1.5, reason: 'dusme' });
    expect(kit.teleports.at ? kit.teleports[kit.teleports.length - 1] : null).toMatchObject({ x: 20.5, y: 80, z: 21.5, op: { safe: false, yaw: 1.5 } });
    expect(G.body.vx).toBe(0);
    expect(G.player.yaw).toBe(1.5);
    G.body.vy = -6;
    applyEffect(S, {
      kind: 'teleport', x: 1.5, y: 90, z: 1.5, yaw: 0.5, vx: 4, vz: -2, keepMomentum: true, reason: 'portal',
    });
    expect(G.body.vx).toBe(4);
    expect(G.body.vz).toBe(-2);
    expect(G.body.vy).toBe(-6);
    expect(G.body.fallPeakY).toBe(90);
    // yaratık
    const mob = { x: 0, y: 0, z: 0, yaw: 0 };
    G.em.get = (id) => (id === 7 ? mob : null);
    applyEffect(S, { kind: 'teleport', entityId: 7, x: 9, y: 8, z: 7, yaw: 2 });
    expect(mob).toMatchObject({ x: 9, y: 8, z: 7, yaw: 2 });
    // carry: platform kutusu üstünde duran taşınır
    G.body.x = 10.5;
    G.body.y = 61;
    G.body.z = 10.5;
    G.body.fallPeakY = 61;
    const box = { x0: 10, y0: 60, z0: 10, x1: 11, y1: 60, z1: 11 };
    applyEffect(S, { kind: 'carry', dx: 1, dy: 1, dz: 0, box });
    expect(G.body.x).toBeCloseTo(11.5);
    expect(G.body.y).toBeCloseTo(62);
    expect(G.body.fallPeakY).toBeCloseTo(62);
    // havada / kenarda: taşınmaz
    G.body.y = 63.5;
    applyEffect(S, { kind: 'carry', dx: 1, dy: 0, dz: 0, box });
    expect(G.body.x).toBeCloseTo(11.5);
    G.body.y = 61;
    G.body.x = 14;
    applyEffect(S, { kind: 'carry', dx: 1, dy: 0, dz: 0, box });
    expect(G.body.x).toBe(14);
  });

  it('efekt: giveItem / takeItem / message / sound / particles', () => {
    const kit = room();
    const { G, S } = kit;
    applyEffect(S, { kind: 'giveItem', item: 'item:portal_tabancası', count: 1 });
    expect(G.inventory.count('item:portal_tabancası')).toBe(1);
    expect(kit.emitted('itemPickedUp').some((e) => e.item === 'item:portal_tabancası')).toBe(true);
    applyEffect(S, { kind: 'giveItem', item: 'item:yok_boyle', count: 1 }); // bilinmeyen eşya atlanır
    applyEffect(S, { kind: 'takeItem', item: 'item:portal_tabancası', count: 1 });
    expect(G.inventory.count('item:portal_tabancası')).toBe(0);
    // envanterde yoksa yerdeki kopya düşer
    G.em.items.set(3, { id: 3, item: 'blok:altın_blok', count: 1, x: 5.5, y: 71, z: 5.5 });
    G.emit({ type: 'blockBroken', x: 5, y: 70, z: 5, id: B.GOLD_BLOCK });
    applyEffect(S, { kind: 'takeItem', item: 'blok:altın_blok', count: 1 });
    expect(G.em.items.size).toBe(0);
    applyEffect(S, { kind: 'sound', name: 'lever', x: 1, y: 2, z: 3, pitch: 0.8 });
    expect(kit.sounds[kit.sounds.length - 1]).toMatchObject({ name: 'lever', op: { pitch: 0.8 } });
    expect(kit.sounds[kit.sounds.length - 1].pos).toEqual({ x: 1.5, y: 2.5, z: 3.5 });
    applyEffect(S, { kind: 'message', text: 'Merhaba' });
    kit.step(2);
    expect(S.fx.current()).toBe('Merhaba');
    expect(() => applyEffect(S, { kind: 'bilinmeyen' })).not.toThrow();
    expect(() => applyEffect(S, null)).not.toThrow();
  });

  it('api: getPuzzleHint yakın bulmacanın ipucunu verir, yoksa null; resetNearestPuzzle çözülmüşe dokunmaz', () => {
    const kit = room();
    const { G } = kit;
    expect(kit.api.getPuzzleHint()).toBeNull(); // test bulmacası hint vermez
    expect(kit.api.resetNearestPuzzle()).toBe(true);
    kit.step(3);
    expect(G.puzzles.get('t1').solved).toBe(true);
    expect(kit.api.resetNearestPuzzle()).toBe(false);
    kit.step(60 * 3);
    expect(kit.S.fx.current()).toContain('zaten çözüldü');
    G.body.x = 400;
    G.body.z = 400;
    expect(kit.api.resetNearestPuzzle()).toBe(false);
  });
});

describe('content: parkur', () => {
  const pk = anchorOf(SEED, 'parkur', 1, 0);
  const course = pk.parkour;

  function pkKit() {
    const kit = makeContentG({ seed: SEED, pos: { x: course.start.x + 0.5, y: course.start.y + 4, z: course.start.z + 0.5 } });
    kit.init();
    return kit;
  }
  const onCell = (kit, c) => kit.tp(c.x + 0.5, c.y, c.z + 0.5);

  it('başlangıç plakası süreyi başlatır (hud.parkour), kontrol noktası son nokta olur, düşüş ölmeden son noktaya ışınlar', () => {
    const kit = pkKit();
    const { G, S } = kit;
    expect(S.courses.length).toBeGreaterThan(0);
    onCell(kit, course.start);
    kit.step(1);
    expect(G.hud.parkour).toMatchObject({ checkpoint: 0, difficulty: course.tier });
    kit.step(60);
    expect(G.hud.parkour.timer).toBeGreaterThan(0.9);
    expect(G.hud.parkour.timer).toBeLessThan(1.3);
    // kontrol noktası 0
    const cp0 = course.checkpoints[0];
    onCell(kit, cp0);
    kit.step(1);
    expect(G.hud.parkour.checkpoint).toBe(1);
    expect(kit.emitted('checkpoint')[0]).toMatchObject({ id: course.id, index: 0 });
    expect(G.player.lastCheckpoint).toMatchObject({ x: cp0.x + 0.5, y: cp0.y });
    // aynı noktada durmak olayı tekrarlamaz
    kit.step(10);
    expect(kit.emitted('checkpoint').length).toBe(1);
    // düşüş: son kontrol noktasının 5 altında → ışınlanır, süre sürer
    kit.teleports.length = 0;
    kit.tp(cp0.x + 0.5, cp0.y - 5, cp0.z + 0.5);
    G.body.fallPeakY = cp0.y + 8;
    kit.step(1);
    expect(G.body.fallPeakY).toBeLessThanOrEqual(G.body.y + 2.5 + 1e-9);
    expect(kit.teleports.length).toBe(1);
    expect(kit.teleports[0]).toMatchObject({ x: cp0.x + 0.5, y: cp0.y, z: cp0.z + 0.5 });
    expect(G.hud.parkour).not.toBeNull();
    expect(G.survival.hp).toBe(G.survival.maxHp); // hasarsız
  });

  it('bitiş plakası: parkourDone {ms, newBest}, rekor kaydı, ilk bitirme ödülü kuyruğa, süre 6 sn sonra kapanır; aynı koşuyu iyileştirince yeni rekor', () => {
    const kit = pkKit();
    const { G } = kit;
    onCell(kit, course.start);
    kit.step(120);
    onCell(kit, course.end);
    kit.step(1);
    const done = kit.emitted('parkourDone');
    expect(done.length).toBe(1);
    expect(done[0]).toMatchObject({ id: course.id, tier: course.tier, newBest: true });
    expect(done[0].ms).toBeGreaterThan(1900);
    expect(done[0].ms).toBeLessThan(2300);
    expect(G.progression.stats.parkourBest[course.id]).toBe(done[0].ms);
    expect(G.progression.pendingRewards().map((r) => r.key)).toContain('parkour:' + course.tier + ':first');
    expect(G.inventory.count('item:yıldız')).toBeGreaterThan(0);
    expect(G.hud.parkour).not.toBeNull(); // final süresi kısa süre görünür
    kit.step(60 * 7);
    expect(G.hud.parkour).toBeNull();
    // ikinci koşu daha yavaş: rekor değil
    onCell(kit, { x: course.start.x - 3, y: course.start.y, z: course.start.z });
    kit.step(2);
    onCell(kit, course.start);
    kit.step(60 * 4);
    onCell(kit, course.end);
    kit.step(1);
    expect(kit.emitted('parkourDone')[1].newBest).toBe(false);
    // üçüncü: daha hızlı
    onCell(kit, { x: course.start.x - 3, y: course.start.y, z: course.start.z });
    kit.step(2);
    onCell(kit, course.start);
    kit.step(30);
    onCell(kit, course.end);
    kit.step(1);
    expect(kit.emitted('parkourDone')[2].newBest).toBe(true);
    expect(G.progression.stats.parkourBest[course.id]).toBe(kit.emitted('parkourDone')[2].ms);
  });

  it('başlamadan bitişe basmak sayılmaz (ipucu); parkurdan uzaklaşmak koşuyu iptal eder; ölü oyuncu sayılmaz', () => {
    const kit = pkKit();
    const { G, S } = kit;
    onCell(kit, course.end);
    kit.step(2);
    expect(kit.emitted('parkourDone').length).toBe(0);
    expect(S.fx.current()).toContain('Süre başlamadı');
    onCell(kit, course.start);
    kit.step(2);
    expect(G.hud.parkour).not.toBeNull();
    kit.tp(course.rect.x1 + 60, course.start.y, course.rect.z1 + 60);
    kit.step(2);
    expect(G.hud.parkour).toBeNull();
    expect(S.courses.find((c) => c.id === course.id).active).toBe(false);
    onCell(kit, course.start);
    G.player.dead = true;
    kit.step(3);
    expect(G.hud.parkour).toBeNull();
  });

  it('hiç yerde durmamış oyuncu parkur altındaki mağarada ışınlanmaz (yalnız koşu/yakın zamanda yerdeyken sıfırlanır)', () => {
    const kit = pkKit();
    kit.teleports.length = 0;
    kit.tp(course.start.x + 0.5, course.start.y - 20, course.start.z + 0.5);
    kit.step(30);
    expect(kit.teleports.length).toBe(0);
  });

  it('yok olan platformlar 20 Hz uygulanır (düzenleme kaydı yok)', () => {
    const kit = pkKit();
    const { G, S } = kit;
    kit.load(0, 0, 16);
    const y = 100;
    G.world.setBlock(2, y, 2, B.GLASS_WHITE);
    const fake = {
      id: 'sahte', rec: { id: 'x' }, lastCp: -1, active: false, t0: 0, onStart: false, onCp: -2, onEnd: false, lastGroundT: -99, resetMsgT: -99, noStartMsgT: -99, finalMs: 0,
      pk: {
        id: 'sahte', tier: 3, tierName: 'Altın', rect: { x0: -5, z0: -5, x1: 5, z1: 5 }, start: { x: 40, y: 1, z: 40 }, end: { x: 41, y: 1, z: 40 }, checkpoints: [], minY: 90, maxY: 100, fallMargin: 3.5,
        dynamics: [{
          index: 0, kind: 'vanish', cells: [{ x: 2, y, z: 2 }], on: 1, off: 1, phase: 0, block: B.GLASS_WHITE,
        }],
      },
    };
    S.courses.push(fake);
    G.world.edits.clear();
    G.body.x = 0;
    G.body.z = 0;
    const seen = new Set();
    for (let i = 0; i < 180; i++) {
      kit.step(1);
      seen.add(G.world.getBlock(2, y, 2));
    }
    expect(seen.has(0)).toBe(true);
    expect(seen.has(B.GLASS_WHITE)).toBe(true);
    // sahte parkurun yok olan platformu kayıt tutmaz (dünyadaki gerçek parkurlar başka hücreleri yazabilir)
    expect(G.world.edits.has('2,' + y + ',2')).toBe(false);
  });
});

describe('content: tabela, gözcü kulesi, harita boyama', () => {
  it('yapı tabelasına sağ tık: metin cümle cümle gösterilir ve sesli okunur; yapı dışı tabela ele alınmaz', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G, S } = kit;
    const [key, sg] = G.structureSigns.entries().next().value;
    const [x, y, z] = key.split(',').map(Number);
    const evt = { type: 'blockUse', x, y, z, id: B.SIGN };
    G.emit(evt);
    expect(evt.handled).toBe(true);
    kit.step(2);
    const first = S.fx.current();
    expect(first.length).toBeGreaterThan(10);
    expect(first.length).toBeLessThanOrEqual(150);
    expect(sg.text.indexOf(first.slice(0, 20))).toBeGreaterThanOrEqual(0);
    expect(kit.speaks[kit.speaks.length - 1]).toContain(first.slice(0, 20));
    const other = { type: 'blockUse', x: 3, y: 90, z: 3, id: B.SIGN };
    G.emit(other);
    expect(other.handled).toBeFalsy();
  });

  it('gözcü kulesi güvertesi: bir kez reveal (bölge yarıçapıyla) → harita seviyesi 2 + işaretler', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G, S } = kit;
    let tower = null;
    S.structs.forEach((r) => { if (r.def.lookout && !tower) tower = r; });
    expect(tower).toBeTruthy();
    const lk = tower.def.lookout;
    kit.tp(lk.deck.x + 0.5, lk.deck.y, lk.deck.z + 0.5);
    kit.step(60);
    const rev = kit.emitted('reveal');
    expect(rev.length).toBe(1);
    expect(rev[0]).toMatchObject({ x: tower.def.x, z: tower.def.z, radius: lk.revealRadius });
    expect(G.progression.reveal.some((v) => v === 2)).toBe(true);
    kit.step(60 * 3);
    expect(kit.emitted('reveal').length).toBe(1); // tekrar yayılmaz
    // güvertenin altında (zemin) tetiklenmez
    const k2 = makeContentG({ seed: SEED, pos: { x: lk.deck.x + 0.5, y: lk.deck.y - 6, z: lk.deck.z + 0.5 } });
    k2.init();
    k2.step(60);
    expect(k2.emitted('reveal').length).toBe(0);
  });

  it('paintTiles: tüm ızgara taranır, bütçe aşılmaz; yalnız açılmış hücre boyanır', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G, S } = kit;
    kit.api.getMapInfo();
    G.progression.revealAt(500, 400, 40, 1); // ızgaranın sonlarına doğru (taramanın sonunda)
    const before = S.map.data.reduce((a, v) => a + (v ? 1 : 0), 0);
    const n = paintTiles(S, 50);
    expect(n).toBe(50);
    const mid = S.map.data.reduce((a, v) => a + (v ? 1 : 0), 0);
    expect(mid).toBe(before + 50);
    while (paintTiles(S, 500) > 0);
    let rev = 0;
    for (let i = 0; i < G.progression.reveal.length; i++) if (G.progression.reveal[i]) rev++;
    expect(S.map.data.reduce((a, v) => a + (v ? 1 : 0), 0)).toBe(rev);
  });

  it('questTarget: görev hedef türüne göre yapı (mühür, boss, bölge geçidi, parkur kademesi, bulmaca)', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { S } = kit;
    expect(questTarget(S, { id: 'z0_muhur' }).type).toBe('muhursunagi');
    expect(questTarget(S, { id: 'z1_boss' }).type).toBe('bossarena');
    expect(questTarget(S, { id: 'z1_gec' }).type).toBe('muhursunagi');
    expect(questTarget(S, { id: 'z1_gec' }).zone).toBe(0);
    expect(questTarget(S, { id: 'pk_1' }).type).toBe('parkur');
    expect(questTarget(S, { id: 'ilk_tapinak' }).type).toBe('anahtartapinagi');
    expect(questTarget(S, { id: 'ilk_bulmaca' })).toBeTruthy();
    expect(questTarget(S, { id: 'ilk_odun' })).toBeNull();
    expect(questTarget(S, { id: 'yok_boyle_gorev' })).toBeNull();
    expect(questTarget(S, null)).toBeNull();
  });
});

describe('content: ödül kuyruğu', () => {
  it('bekleyen ödül idempotent: tekrar yayım çift kuyruk yapmaz; markRewardClaimed bir kez düşer; yeniden bildirim yalnız bekleyenleri yayar', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G } = kit;
    G.emit({ type: 'parkourDone', id: 'parkur:1,1', tier: 2, ms: 50000 });
    G.emit({ type: 'parkourDone', id: 'parkur:1,2', tier: 2, ms: 40000 });
    expect(kit.api.getPendingRewards()).toEqual([{ key: 'parkour:2:first' }]);
    expect(kit.emitted('reward').filter((r) => r.key === 'parkour:2:first').length).toBe(1);
    // 90 sn'de bir yeniden bildirim
    kit.step(60 * 91);
    const retry = kit.emitted('reward').filter((r) => r.retry === true);
    expect(retry.length).toBeGreaterThanOrEqual(1);
    expect(retry.every((r) => r.key === 'parkour:2:first')).toBe(true);
    // sunucu işledi
    expect(kit.api.markRewardClaimed('parkour:2:first')).toBe(true);
    expect(kit.api.getPendingRewards()).toEqual([]);
    expect(kit.api.markRewardClaimed('parkour:2:first')).toBe(true); // 409 sonrası yinelenen çağrı zararsız
    expect(kit.api.markRewardClaimed('zone:9:boss')).toBe(false);
    const n = kit.emitted('reward').length;
    kit.step(60 * 91);
    expect(kit.emitted('reward').length).toBe(n); // artık bekleyen yok
    // aynı ödül yeniden üretilmez
    G.emit({ type: 'parkourDone', id: 'parkur:1,3', tier: 2, ms: 30000 });
    expect(kit.api.getPendingRewards()).toEqual([]);
  });

  it('açılışta (2,5 sn sonra) kayıttan gelen bekleyen ödüller yeniden bildirilir', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.G.progression.rewards.pending.push('zone:1:boss');
    kit.init();
    kit.step(60 * 3);
    expect(kit.emitted('reward').map((r) => r.key)).toEqual(['zone:1:boss']);
  });
});

describe('content: harita ve günlük', () => {
  it('getMapInfo: döşeme ızgarası, palet, bölgeler, işaretler; yalnız açılan hücreler boyanır', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G } = kit;
    G.emit({ type: 'tick', dt: 0.25, x: 0, z: 0, light: 15, torch: false, biome: 'cayir' });
    kit.step(30);
    const info = kit.api.getMapInfo();
    expect(info.tiles.w).toBe(MAP_GRID);
    expect(info.tiles.h).toBe(MAP_GRID);
    expect(info.tiles.data.length).toBe(MAP_GRID * MAP_GRID);
    expect(info.tiles.palette).toBe(MAP_PALETTE);
    expect(info.tiles.paletteBase).toBe(1);
    expect(MAP_PALETTE.length).toBe(2 * BIOME_KEYS.length + 3); // bilinmiyor + biyom + yüksek ton + 2 su
    let known = 0;
    for (let i = 0; i < info.tiles.data.length; i++) if (info.tiles.data[i] !== 0) known++;
    expect(known).toBeGreaterThan(20);
    let rev = 0;
    for (let i = 0; i < G.progression.reveal.length; i++) if (G.progression.reveal[i] !== 0) rev++;
    expect(known).toBe(rev); // boyalı = açılmış
    info.tiles.data.forEach((v) => expect(v).toBeLessThan(MAP_PALETTE.length));
    expect(info.bounds.maxX - info.bounds.minX).toBe(info.size);
    expect(info.zones.length).toBe(5);
    expect(info.zones[0].unlocked).toBe(true);
    expect(info.zones[1].unlocked).toBe(false);
    expect(info.markers[0]).toMatchObject({ type: 'spawn', discovered: true });
    expect(info.player).toMatchObject({ x: 0, z: 0 });
    expect(info.guide).toBeTruthy();
    expect(info.explored).toBeGreaterThan(0);
  });

  it('işaretler: keşfedilmiş yapılar discovered:true; gözcü kulesi açımı (revealed=2) keşfedilmemişi "?" gösterir', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G, S } = kit;
    let info = kit.api.getMapInfo();
    const nBefore = info.markers.length;
    const t = anchorOf(SEED, 'anahtartapinagi', 0, 1);
    // reveal(2) yapının üstüne
    G.emit({ type: 'reveal', x: t.x, z: t.z, radius: 30 });
    S.version++;
    info = kit.api.getMapInfo();
    const m = info.markers.find((q) => q.id === t.id);
    expect(m).toBeTruthy();
    expect(m.discovered).toBe(false);
    expect(info.markers.length).toBeGreaterThan(nBefore);
    // keşfedilince discovered:true ve renk
    kit.tp(t.x + 5, t.y, t.z);
    kit.step(60);
    info = kit.api.getMapInfo();
    const m2 = info.markers.find((q) => q.id === t.id);
    expect(m2.discovered).toBe(true);
    expect(m2.color).toBe('#7fe8ff');
    // keşfedilmemiş ve açılmamış yapılar hiç listelenmez
    info.markers.forEach((q) => { if (q.type !== 'spawn') expect(typeof q.name).toBe('string'); });
  });

  it('getJournal: ilerleme günlüğü (görevler, başarımlar, istatistik, yetenekler)', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const j = kit.api.getJournal();
    expect(j.quests.length).toBeGreaterThan(5);
    expect(j.quests[0]).toMatchObject({ state: 'active' });
    expect(j.achievements.length).toBeGreaterThan(20);
    expect(j.discovered).toMatchObject({ structures: expect.any(Number), biomes: expect.any(Number) });
    expect(j.abilities).toEqual({
      doubleJump: false, grapple: false, glide: false, portalGun: false,
    });
    expect(j.stats.level).toBe(0);
  });

  it('mapApi tek başına: ilerleme yoksa temel değerler', () => {
    const api = mapApi({ G: { progression: null, journal: null, body: null }, map: null, mode: 'macera' });
    expect(api.getJournal().quests).toEqual([]);
    expect(api.getMapInfo()).toBeNull();
  });
});

describe('content: rehberlik ve ipuçları', () => {
  it('getGuidance: ana görev metni + en yakın uygun yapıya pusula yönü; keşfedilen hedef değişir', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G, S } = kit;
    let g = kit.api.getGuidance();
    expect(g.quest.id).toBe('ilk_odun');
    expect(g.nextGoal).toContain('kütük');
    expect(g.target.type).toBe('anahtartapinagi');
    expect(g.direction).toContain('Anahtar Tapınağı');
    expect(g.main.goal).toContain('Anahtar Tapınağı');
    expect(['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı']).toContain(g.target.compass);
    // yön canlı: oyuncu yaw'ı değişince göreli açı değişir
    const rel0 = g.target.relYaw;
    G.player.yaw += 1;
    g = kit.api.getGuidance();
    expect(Math.abs(g.target.relYaw - rel0)).toBeGreaterThan(0.5);
    // en yakın tapınak keşfedilince/kristal alınınca ana hedef sonraki tapınağa geçer
    const first = g.main.id;
    G.progression.crystals[0].push(first);
    S.version++;
    g = kit.api.getGuidance();
    expect(g.main.id).not.toBe(first);
    // iki kristal de alındı → mühür kulesi
    const other = anchorOf(SEED, 'anahtartapinagi', 0, 0).id === first ? anchorOf(SEED, 'anahtartapinagi', 0, 1).id : anchorOf(SEED, 'anahtartapinagi', 0, 0).id;
    G.progression.crystals[0].push(other);
    S.version++;
    g = kit.api.getGuidance();
    expect(g.main.type).toBe('muhursunagi');
    expect(g.main.goal).toContain('Mühür Kulesi');
  });

  it('nearestOfType / directionText: çapa + görülmüş yapılar; hariç tutma', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { S } = kit;
    const near = nearestOfType(S, 'anahtartapinagi', { zone: 0 });
    expect(near.zone).toBe(0);
    const other = nearestOfType(S, 'anahtartapinagi', { zone: 0, exclude: (id) => id === near.id });
    expect(other.id).not.toBe(near.id);
    expect(nearestOfType(S, 'anahtartapinagi', { zone: 4 }).zone).toBe(4);
    expect(directionText(S, 'muhursunagi', 0, null)).toMatch(/blok/);
    expect(directionText(S, 'yokboyletur', 0, null)).toBe('');
    expect(getGuidance(S).active).toBe(true);
  });

  it('ipuçları: düşük can acil ipucu; yeni görev ipucu 14 sn; mühür bariyeri yakınlığı; blocks ipucunun üzerine yazılmaz', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G } = kit;
    kit.step(60 * 3); // hazır (2,5 sn) + ilk hesap
    G.survival.hp = 3;
    kit.step(40);
    expect(G.hud.hint).toContain('Canın azaldı');
    G.survival.hp = G.survival.maxHp;
    kit.step(40);
    expect(G.hud.hint === null || G.hud.hint.indexOf('Canın azaldı') < 0).toBe(true);
    // mühür bariyeri yakın
    G.hud.zone.id = 0;
    G.chunkManager.getSealDistance = () => 6;
    kit.step(40);
    expect(G.hud.hint).toContain('Mühür açılmadan geçemezsin: 0/2');
    G.chunkManager.getSealDistance = () => Infinity;
    kit.step(40);
    // blocks'un etkileşim ipucu varken biz yazmayız
    G.hud.hint = '[E] Sandığı aç';
    G.survival.hp = 2;
    kit.step(60);
    expect(G.hud.hint).toBe('[E] Sandığı aç');
    G.hud.hint = null;
    kit.step(2);
    expect(G.hud.hint).toContain('Canın azaldı');
  });

  it('görev HUD\'u: progression.questHud ile hud.quest güncellenir', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G } = kit;
    kit.step(60 * 3);
    expect(G.hud.quest.title).toBe('İlk Odunlar');
    for (let i = 0; i < 3; i++) G.emit({ type: 'blockBroken', x: i, y: 70, z: 0, id: B.LOG_OAK });
    kit.step(70);
    expect(G.hud.quest.title).not.toBe('İlk Odunlar');
  });
});
