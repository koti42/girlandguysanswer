import { describe, expect, it } from 'vitest';
import { World } from './world.js';
import { spawnPoint } from './worldgen.js';
import { B } from './blocks.js';
import { MAX_BLOCK_ID, SAVE_VERSION, SECTION_VOLUME } from './constants.js';
import { Inventory } from './inventory.js';
import { createClock, createWeather, updateWeather, serializeClock } from './daynight.js';
import { createSurvival, applyDamage } from './survival.js';
import { createProgression } from './progression.js';
import {
  EDIT_UNCHANGED, applyEditsToWorld, decodeEdits, diffsToEntries, encodeEdits, migrateChunkDiffs,
} from './saveEdits.js';
import {
  applyGame, deserializeGame, estimateSaveSize, migrateSave, registerSaveMigration, serializeGame, summarizeSave,
  unregisterSaveMigration, utf8Length, worldCodeOf,
} from './save.js';
import { buildCloudEnvelope, openCloudEnvelope, CLOUD_MAX_BYTES } from './saveEnvelope.js';
import { encodeRle } from './mapFormat.js';

const SEED = 4242;

function makeWorld(seed) {
  const w = new World({ seed, mode: 'macera' });
  const sp = spawnPoint(seed);
  const cx = Math.floor(sp.x / 16);
  const cz = Math.floor(sp.z / 16);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.ensureChunk(cx + dx, cz + dz);
  return { w, sp, cx, cz };
}

function fakePuzzleManager(map) {
  return {
    restored: null,
    serialize() { return map; },
    restore(m) { this.restored = m; },
  };
}

function buildState() {
  const { w, sp, cx, cz } = makeWorld(SEED);
  const bx = Math.floor(sp.x);
  const bz = Math.floor(sp.z);
  const gy = w.surfaceY(bx, bz, { ignoreFoliage: true });
  // bina: tuğla kutusu, mağara kazısı, meşaleler, kırılan bloklar
  for (let y = gy + 1; y <= gy + 4; y++) {
    for (let x = bx - 3; x <= bx + 3; x++) {
      for (let z = bz - 3; z <= bz + 3; z++) {
        const wall = x === bx - 3 || x === bx + 3 || z === bz - 3 || z === bz + 3;
        if (wall) w.setBlock(x, y, z, y % 2 ? B.BRICK : B.STONE_BRICK);
      }
    }
  }
  for (let x = bx - 3; x <= bx + 3; x++) for (let z = bz - 3; z <= bz + 3; z++) w.setBlock(x, gy + 5, z, B.PLANKS_OAK);
  w.setBlock(bx, gy + 1, bz, B.TORCH);
  w.setBlock(bx + 1, gy + 1, bz, B.CHEST);
  for (let y = gy; y > gy - 6; y--) w.setBlock(bx + 6, y, bz + 6, B.AIR);
  const inv = new Inventory();
  inv.add('item:kazma_demir', 1);
  inv.add('blok:taş', 40);
  inv.add('item:elma', 5);
  inv.damageHeld(0);
  const surv = createSurvival();
  applyDamage(surv, 4, { cause: 'düşme' });
  const clock = createClock({ startPhase: 0.4, day: 3 });
  const weather = createWeather(SEED);
  updateWeather(weather, 500, { temperature: 0.5 });
  const prog = createProgression(SEED);
  for (let i = 0; i < 2; i++) prog.onEvent({ type: 'crystalCollected', zone: 0, id: 'k' + i });
  for (let i = 0; i < 2; i++) prog.onEvent({ type: 'crystalPlaced', zone: 0, id: 'k' + i });
  prog.onEvent({ type: 'bossDefeated', zone: 1 });
  prog.onEvent({ type: 'blockBroken', id: B.STONE });
  for (let i = 0; i < 20; i++) prog.onEvent({ type: 'tick', dt: 0.5, x: bx + i * 3, z: bz, light: 15 });
  const puzzles = fakePuzzleManager({
    'turbe:1,1/0': { type: 'basincplakasi', solved: true, state: { open: true, t: 1.5 } },
    'tapinak:2,2/1': { type: 'runedizisi', solved: false, state: { seq: [1, 2, 3], idx: 1 } },
  });
  const chests = new Map([
    [bx + 1 + ',' + (gy + 1) + ',' + bz, [{ item: 'item:elma', count: 3 }, null, { item: 'item:kazma_taş', count: 1, dur: 20 }]],
    ['5,40,5', []],
  ]);
  const entities = [
    { id: 1, type: 'tavuk', x: bx + 2, y: gy + 1, z: bz + 2, hp: 3, yaw: 1.5, vx: 3, ai: { state: 'x' } },
    { id: 2, type: 'golgehukumdar', x: bx + 500, y: 70, z: bz, hp: 400, maxHp: 800, phase: 2 },
    { type: 'drop', item: 'item:elmas', count: 2, x: bx, y: gy + 1, z: bz },
  ];
  const player = {
    x: sp.x, y: sp.y, z: sp.z, yaw: 1.234567, pitch: -0.3, spawn: [bx + 0.5, gy + 1, bz + 0.5], flying: false, cameraMode: 'tp',
  };
  return {
    w, sp, cx, cz, inv, surv, clock, weather, prog, puzzles, chests, entities, player, bx, bz, gy,
  };
}

function save(s, extra) {
  return serializeGame(Object.assign({
    world: s.w,
    inventory: s.inv,
    survival: s.surv,
    clock: s.clock,
    weather: s.weather,
    progression: s.prog,
    puzzleManager: s.puzzles,
    entities: s.entities,
    chests: s.chests,
    player: s.player,
    seed: SEED,
    mode: 'macera',
    name: 'Deneme Dünyası',
    playTime: 4321,
    createdAt: 1700000000000,
    savedAt: 1700000500000,
  }, extra || {}));
}

describe('düzenleme farkı kodlaması (saveEdits)', () => {
  it('kodla → çöz: her hücre doğru, 255 = değişmedi', () => {
    const edits = new Map([['0,10,0', 5], ['15,127,15', 60], ['-1,0,-16', 0], ['16,64,0', 91], ['3,3,3', MAX_BLOCK_ID + 1], ['x', 1], ['1,400,1', 1], ['1,-401,1', 1], ['2,-400,2', 7], ['2,367,2', 8]]);
    const enc = encodeEdits(edits);
    expect(enc.count).toBe(6); // MAX_BLOCK_ID + 1, geçersiz anahtarlar ve aralık dışı y (400, -401) atılır; -400 ve 367 geçerli
    // anahtar 'cx,cz,si': si = (y + 400) >> 4 (macera). y=10 → 25, y=127 → 32, y=0 → 25, y=64 → 29, y=-400 → 0, y=367 → 47
    expect(Object.keys(enc.chunks).sort()).toEqual(['-1,-1,25', '0,0,0', '0,0,25', '0,0,32', '0,0,47', '1,0,29']);
    const dec = decodeEdits(enc.chunks);
    expect(dec.ok).toBe(true);
    expect(dec.bad).toEqual([]);
    expect(dec.count).toBe(6);
    const entries = diffsToEntries(dec.list).map((e) => e.join(',')).sort();
    expect(entries).toEqual(['-1,0,-16,0', '0,10,0,5', '15,127,15,60', '16,64,0,91', '2,-400,2,7', '2,367,2,8'].sort());
    dec.list.forEach((c) => expect(c.diff.length).toBe(SECTION_VOLUME));
    // legacy (insa) dünya aralığı 0..127: y=-400 ve 367 geçersiz, kesit indeksi y>>4
    const lg = encodeEdits(new Map([['0,10,0', 5], ['0,-1,0', 5], ['0,128,0', 5], ['3,127,3', 9]]), 0);
    expect(lg.count).toBe(2);
    expect(Object.keys(lg.chunks).sort()).toEqual(['0,0,0', '0,0,7']);
    expect(diffsToEntries(decodeEdits(lg.chunks, 0).list, 0).map((e) => e.join(',')).sort()).toEqual(['0,10,0,5', '3,127,3,9']);
    expect(decodeEdits(lg.chunks, 0).bad).toEqual([]);
    expect(decodeEdits({ '0,0,8': lg.chunks['0,0,0'] }, 0).bad).toEqual(['0,0,8']); // legacy 8 kesit
    expect(EDIT_UNCHANGED).toBe(255);
  });

  it('seyrek düzenleme çok küçük kodlanır (RLE farkı)', () => {
    const e = {};
    for (let i = 0; i < 1000; i++) e[(i % 16) + ',' + (60 + (i % 7)) + ',' + ((i * 5) % 16)] = 60 + (i % 3);
    const enc = encodeEdits(e);
    const len = Object.keys(enc.chunks).reduce((a, k) => a + enc.chunks[k].length, 0);
    expect(enc.chunkCount).toBe(2); // y 60..66 iki kesite (y=63/64 sınırı: (y+400)>>4 = 28 | 29) düşer; yalnız dokunulan kesitler yazılır
    expect(len).toBeLessThan(12000);
    // yalnız tek kesit dokunulduysa tek parça: 48 kesitlik sütun yazılmaz
    const one = encodeEdits({ '1,-100,1': 5, '2,-99,2': 6 });
    expect(Object.keys(one.chunks)).toEqual(['0,0,18']);
  });

  it('Map ve düz nesne aynı çıktıyı verir; çıktı belirlenimci', () => {
    const o = { '1,2,3': 5, '40,2,3': 6, '-5,9,9': 7 };
    const a = encodeEdits(o);
    const b = encodeEdits(new Map(Object.entries(o)));
    expect(a).toEqual(b);
    expect(Object.keys(a.chunks)).toEqual(Object.keys(a.chunks).slice().sort());
  });

  it('bozuk parçalar `bad`a girer, atmaz; geçersiz kök ok:false', () => {
    const good = encodeEdits({ '0,1,0': 5 }).chunks['0,0,25'];
    const dec = decodeEdits({
      '0,0,25': good, '1,0,25': 'bozuk!!', '2,0,25': 5, 'a,b,1': good, '0,1,25': encodeRle(new Uint8Array(10)), '0,0,99': good, '0,0': good,
    });
    expect(dec.ok).toBe(true);
    expect(dec.list).toHaveLength(1);
    expect(dec.bad.sort()).toEqual(['0,0', '0,0,99', '0,1,25', '1,0,25', '2,0,25', 'a,b,1']);
    expect(decodeEdits([]).ok).toBe(false);
    expect(decodeEdits('x').ok).toBe(false);
    expect(decodeEdits(null)).toMatchObject({ ok: true, list: [] });
  });

  it('MAX_BLOCK_ID (254) dahil tüm kimlikler korunur; yalnız 255 "değişmedi" sayılır', () => {
    const arr = new Uint8Array(SECTION_VOLUME).fill(255);
    arr[5] = 200;
    arr[6] = 127;
    arr[7] = 254;
    const dec = decodeEdits({ '0,0,25': encodeRle(arr) });
    expect(dec.count).toBe(3);
    expect(dec.list[0].diff[5]).toBe(200);
    expect(dec.list[0].diff[6]).toBe(127);
    expect(dec.list[0].diff[7]).toBe(254);
    expect(dec.list[0].diff[8]).toBe(255);
  });
});

describe('serializeGame / deserializeGame: gerçek dünyada gidiş-dönüş', () => {
  it('düzenlemeler, envanter, hayatta kalma, saat, hava, ilerleme, bulmaca, sandık, varlıklar birebir geri gelir', () => {
    const s = buildState();
    const sv = save(s);
    expect(sv.v).toBe(SAVE_VERSION);
    expect(sv.editStats.cells).toBeGreaterThan(100);
    const json = JSON.stringify(sv);
    const r = deserializeGame(json);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    const g = r.game;
    expect(g).toMatchObject({ mode: 'macera', seed: SEED, name: 'Deneme Dünyası', playTime: 4321, createdAt: 1700000000000 });
    expect(g.edits.count).toBe(s.w.edits.size);

    // canlı nesnelere uygula
    const w2 = new World({ seed: SEED, mode: 'macera' });
    w2.ensureChunk(s.cx, s.cz); // yalnız biri yüklü; kalanı sonra üretilir
    const inv2 = new Inventory();
    const surv2 = createSurvival();
    const clock2 = createClock();
    const prog2 = createProgression(SEED);
    const pm2 = fakePuzzleManager({});
    const res = applyGame(g, {
      world: w2, inventory: inv2, survival: surv2, clock: clock2, progression: prog2, puzzleManager: pm2,
    });
    expect(res.warnings).toEqual([]);

    s.w.forEachChunk((c) => w2.ensureChunk(c.cx, c.cz));
    let diff = 0;
    s.w.forEachChunk((c) => {
      const a = c.toDense(0, 368);
      const b = w2.getChunk(c.cx, c.cz).toDense(0, 368);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    });
    expect(diff).toBe(0);
    expect(w2.serializeEdits()).toEqual(s.w.serializeEdits());

    expect(inv2.toJSON()).toEqual(s.inv.toJSON());
    expect(surv2.hp).toBeCloseTo(s.surv.hp, 1);
    expect(surv2.hunger).toBeCloseTo(s.surv.hunger, 1);
    expect(clock2.day).toBe(3);
    expect(clock2.time).toBeCloseTo(s.clock.time, 1);
    expect(serializeClock(clock2).day).toBe(serializeClock(s.clock).day);
    expect(res.weather.seed).toBe(s.weather.seed);
    expect(res.weather.t).toBeCloseTo(s.weather.t, 0);
    expect(prog2.serialize()).toEqual(s.prog.serialize());
    expect(prog2.hasAbility('doubleJump')).toBe(true);
    expect(w2.isZoneUnlocked(1)).toBe(true);
    expect(w2.isZoneUnlocked(2)).toBe(false);
    expect(pm2.restored).toEqual(s.puzzles.serialize());
    expect(res.player.pos).toEqual([Number(s.sp.x.toFixed(2)), Number(s.sp.y.toFixed(2)), Number(s.sp.z.toFixed(2))]);
    expect(res.player.yaw).toBe(1.235);
    expect(res.player.flags).toEqual({ cameraMode: 'tp', flying: false });
    expect(res.entities.map((e) => e.type)).toEqual(['golgehukumdar', 'tavuk']); // boss önce
    expect(res.entities[1]).not.toHaveProperty('ai');
    expect(res.entities[1]).not.toHaveProperty('vx');
    expect(res.drops).toHaveLength(1);
    expect(res.drops[0]).toMatchObject({ item: 'item:elmas', count: 2 });
    const chestKey = s.bx + 1 + ',' + (s.gy + 1) + ',' + s.bz;
    expect(res.chests.get(chestKey)).toHaveLength(27);
    expect(res.chests.get(chestKey)[0]).toEqual({ item: 'item:elma', count: 3 });
    expect(res.chests.get(chestKey)[2]).toEqual({ item: 'item:kazma_taş', count: 1, dur: 20 });
    expect(res.chests.get('5,40,5').every((x) => x === null)).toBe(true); // boş sandık korunur (tüketilmiş ganimet)
  });

  it('aynı durum iki kez serileştirilince çıktı aynı metindir (belirlenimci, anahtar sıralı)', () => {
    const s = buildState();
    expect(JSON.stringify(save(s))).toBe(JSON.stringify(save(s)));
  });

  it('JSON gidiş-dönüşü kaybı yok: deserialize(serialize(x)) yeniden serileştirilince eşit düzenleme verir', () => {
    const s = buildState();
    const a = save(s);
    const r = deserializeGame(a);
    const w = new World({ seed: SEED, mode: 'macera' });
    applyGame(r.game, { world: w });
    const b = serializeGame({ world: w, seed: SEED, mode: 'macera' });
    expect(b.edits).toEqual(a.edits);
    expect(b.editStats).toEqual(a.editStats);
  });

  it('düzenleme yüklü chunk\'a hemen, yüklenmemişe üretilince uygulanır', () => {
    const w = new World({ seed: 7 });
    w.ensureChunk(0, 0);
    w.setBlock(3, 70, 3, B.BRICK);
    w.setBlock(40, 70, 3, B.BRICK); // chunk 2,0 yüklü değil → setBlock false, applyEdits ile yazalım
    w.applyEdits([[40, 70, 3, B.BRICK]]);
    const sv = serializeGame({ world: w, seed: 7, mode: 'macera' });
    const g = deserializeGame(sv).game;
    const w2 = new World({ seed: 7 });
    w2.ensureChunk(0, 0);
    expect(applyEditsToWorld(w2, g.edits.list)).toBe(2);
    expect(w2.getBlock(3, 70, 3)).toBe(B.BRICK);
    w2.ensureChunk(2, 0);
    expect(w2.getBlock(40, 70, 3)).toBe(B.BRICK);
  });

  it('varlık ve düşen eşya sınırları; bozuk girdiler atılır', () => {
    const s = buildState();
    const ents = [{ type: 'golgehukumdar', x: 5000, y: 70, z: 5000, hp: 1 }];
    for (let i = 0; i < 300; i++) ents.push({ type: 'tavuk', x: i, y: 70, z: 0, hp: 4, ai: { a: 1 }, nested: { a: 1 }, name: 'x'.repeat(100) });
    for (let i = 0; i < 300; i++) ents.push({ type: 'drop', item: 'blok:taş', count: 500, x: i, y: 70, z: 1 });
    ents.push(null, 5, 'x', { type: 'tavuk', x: NaN, y: 1, z: 1 }, { type: 'yok'.repeat(20), x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 });
    ents.push({ type: 'drop', item: 'item:yok_esya', x: 1, y: 1, z: 1 });
    const sv = save(s, { entities: ents });
    expect(sv.entities).toHaveLength(80);
    expect(sv.entities[0].type).toBe('golgehukumdar');
    expect(sv.drops).toHaveLength(100);
    expect(sv.drops.every((d) => d.count === 64)).toBe(true);
    expect(sv.entities[1]).toMatchObject({ type: 'tavuk', hp: 4, name: 'x'.repeat(48) });
    expect(sv.entities.every((e) => Number.isFinite(e.x) && !('ai' in e) && !('nested' in e))).toBe(true);
  });

  it('entities kaynağı serialize() olan yönetici ya da {entities,drops} olabilir', () => {
    const s = buildState();
    const mgr = { serialize: () => ({ entities: [{ type: 'koyun', x: 1, y: 2, z: 3, hp: 8 }], drops: [{ item: 'item:elma', count: 2, x: 1, y: 2, z: 3 }] }) };
    const sv = save(s, { entities: mgr });
    expect(sv.entities).toEqual([{ type: 'koyun', x: 1, y: 2, z: 3, hp: 8 }]);
    expect(sv.drops).toEqual([{ item: 'item:elma', count: 2, x: 1, y: 2, z: 3 }]);
    const boom = { serialize() { throw new Error('x'); } };
    expect(save(s, { entities: boom }).entities).toEqual([]);
  });

  it('sandık doğrulaması: bilinmeyen eşya, fazla adet, kötü anahtar', () => {
    const s = buildState();
    const chests = {
      '1,2,3': [{ item: 'blok:taş', count: 999 }, { item: 'item:yok', count: 1 }, [ 'item:kazma_demir', 5, 9999 ], 0, null],
      'a,b,c': [], '1,2': [], '1,9999,3': [], '1,-9999,3': [],
    };
    const sv = save(s, { chests });
    expect(Object.keys(sv.chests)).toEqual(['1,2,3']);
    expect(sv.chests['1,2,3']).toEqual([['blok:taş', 64], 0, ['item:kazma_demir', 1, 250]]);
    const g = deserializeGame(sv).game;
    expect(g.chests['1,2,3'][0]).toEqual({ item: 'blok:taş', count: 64 });
    expect(g.chests['1,2,3'][2]).toEqual({ item: 'item:kazma_demir', count: 1, dur: 250 });
    expect(g.chests['1,2,3']).toHaveLength(27);
  });

  it('insa/harita modları ve ilerleme olmayan kayıt', () => {
    const w = new World({ seed: 1, mode: 'insa' });
    const sv = serializeGame({ world: w, mode: 'insa', seed: 1, name: '<b>Ev</b>' });
    expect(sv.mode).toBe('insa');
    expect(sv.name).toBe('bEv/b');
    expect(sv.progression).toBeNull();
    const r = deserializeGame(sv);
    expect(r.ok).toBe(true);
    expect(r.game.progression).toBeNull();
    expect(r.game.player.inventory).toBeNull();
    expect(r.game.player.survival).toBeNull();
  });
});

describe('deserializeGame: doğrulama', () => {
  function good() {
    return JSON.parse(JSON.stringify(save(buildState())));
  }

  it('geçersiz kökler {ok:false} döner, atmaz', () => {
    ['', 'x', '{', 'null', '[]', '5', 'true'].forEach((j) => {
      const r = deserializeGame(j);
      expect(r.ok).toBe(false);
      expect(typeof r.code).toBe('string');
      expect(typeof r.error).toBe('string');
    });
    [null, undefined, 5, [], 'abc'].forEach((x) => expect(deserializeGame(x).ok).toBe(false));
  });

  it('tohum yok / geçersiz mod / daha yeni sürüm', () => {
    const g = good();
    expect(deserializeGame(Object.assign({}, g, { seed: null })).code).toBe('seed');
    expect(deserializeGame(Object.assign({}, g, { seed: {} })).code).toBe('seed');
    expect(deserializeGame(Object.assign({}, g, { mode: 'hile' })).code).toBe('mode');
    expect(deserializeGame(Object.assign({}, g, { v: SAVE_VERSION + 1 })).code).toBe('newer');
    expect(deserializeGame(Object.assign({}, g, { edits: [] })).code).toBe('edits');
  });

  it('bozuk düzenleme chunk\'ı: varsayılan atla+uyar, strict hata', () => {
    const g = good();
    const key = Object.keys(g.edits)[0];
    g.edits[key] = 'bozuk';
    const r = deserializeGame(g);
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toContain('edits:1');
    expect(r.game.edits.chunkCount).toBe(Object.keys(g.edits).length - 1);
    expect(deserializeGame(g, { strict: true }).ok).toBe(false);
  });

  it('sayılar sınırlanır, ad temizlenir, bozuk bölümler uyarı olur', () => {
    const g = good();
    g.player.pos = [1e12, -1e9, NaN];
    g.player.yaw = 'x';
    g.player.pitch = 99;
    g.player.hp = 1e6;
    g.player.hunger = -4;
    g.player.inv = 'bozuk';
    g.time.dayLengthSec = 1;
    g.time.day = -3;
    g.name = '  \u0000<script>\n  ' + 'a'.repeat(200);
    g.playTime = -5;
    g.progression = 'x';
    g.puzzleStates = JSON.parse('{"__proto__":{"type":"x"}}');
    g.puzzleStates.ok = { type: 'a', solved: true, state: { f() {}, n: NaN } };
    g.puzzleStates.bad = 5;
    const r = deserializeGame(g);
    expect(r.ok).toBe(true);
    const p = r.game.player;
    expect(p.pos).toBeNull();
    expect(p.yaw).toBe(0);
    expect(p.pitch).toBe(1.6);
    expect(p.survival.hp).toBeLessThanOrEqual(p.survival.maxHp);
    expect(p.survival.hunger).toBe(0);
    expect(p.inventory).toBeNull();
    expect(r.game.time.clock.dayLengthSec).toBe(60);
    expect(r.game.time.clock.day).toBe(0);
    expect(['<', '>', ' '].some((ch) => r.game.name.indexOf(ch) >= 0)).toBe(false);
    expect(Array.from(r.game.name).length).toBeLessThanOrEqual(60);
    expect(r.game.playTime).toBe(0);
    expect(r.game.progression).toBeNull();
    expect(r.warnings).toEqual(expect.arrayContaining(['inv', 'progression']));
    expect(Object.keys(r.game.puzzleStates)).toEqual(['ok']);
    expect(r.game.puzzleStates.ok.state).toEqual({ n: 0 });
  });

  it('inventar bozulması geçerli yuvaya indirgenir', () => {
    const g = good();
    g.player.inv.slots[0] = ['item:yok', 3];
    g.player.inv.slots[1] = ['blok:taş', 9999];
    g.player.inv.slots[2] = ['item:kazma_demir', 1, 99999];
    const r = deserializeGame(g);
    const inv = new Inventory().fromJSON(r.game.player.inventory);
    expect(inv.slotAt(0)).toBeNull();
    expect(inv.slotAt(1).count).toBe(64);
    expect(inv.slotAt(2).dur).toBeLessThanOrEqual(250);
  });
});

describe('sürüm göçü', () => {
  it('v0 eski biçim (üst düzey pos/inv/hp, düz düzenleme nesnesi; insa) güncel sürüme yükseltilir', () => {
    const inv = new Inventory();
    inv.add('item:elma', 4);
    const legacy = {
      mode: 'insa', seed: 99, name: 'Eski', pos: [1, 70, 2], yaw: 0.5, hp: 12, hunger: 15, inv: inv.toJSON(),
      edits: { '1,70,1': B.BRICK, '20,70,1': B.STONE },
    };
    const m = migrateSave(legacy);
    expect(m).toMatchObject({ ok: true, from: 0 });
    expect(m.data.v).toBe(SAVE_VERSION);
    const r = deserializeGame(JSON.stringify(legacy));
    expect(r.ok).toBe(true);
    expect(r.game.migratedFrom).toBe(0);
    expect(r.game.player.pos).toEqual([1, 70, 2]);
    expect(r.game.player.survival.hp).toBe(12);
    expect(r.game.edits.count).toBe(2);
    expect(r.game.player.inventory.slots[0]).toEqual(['item:elma', 4]);
  });

  it('kayıtlı göç dönüştürücüsü kullanılır; atan ya da hatalı göç ok:false; geri alınır', () => {
    registerSaveMigration(0, (d) => Object.assign({}, d, { v: SAVE_VERSION, name: 'Göçmen', seed: 5 }));
    try {
      const r = deserializeGame({ foo: 1, mode: 'insa' });
      expect(r.ok).toBe(true);
      expect(r.game.name).toBe('Göçmen');
    } finally {
      unregisterSaveMigration(0);
    }
    registerSaveMigration(0, () => { throw new Error('x'); });
    try {
      expect(deserializeGame({ seed: 1, mode: 'insa' })).toMatchObject({ ok: false, code: 'migrate' });
    } finally {
      unregisterSaveMigration(0);
    }
    registerSaveMigration(0, (d) => Object.assign({}, d, { v: 0 })); // sürümü yükseltmez
    try {
      expect(deserializeGame({ seed: 1, mode: 'insa' }).code).toBe('migrate');
    } finally {
      unregisterSaveMigration(0);
    }
    expect(deserializeGame({ seed: 1, mode: 'insa' }).ok).toBe(true);
  });

  it('v1 macera dünyası (yükseklik düzeni değişti) çökmeden, açık mesajla reddedilir; yeni sürümden kayıt reddedilir', () => {
    const old = { v: 1, mode: 'macera', seed: 5, name: 'Eski dünya', edits: { '0,0': encodeRle(new Uint8Array(32768).fill(255)) } };
    const r = deserializeGame(old);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('oldworld');
    expect(r.error).toBe('Bu dünya eski sürümden; yeni bir dünya başlat.');
    expect(deserializeGame(JSON.stringify(old)).code).toBe('oldworld');
    expect(deserializeGame({ v: 1, seed: 5 }).code).toBe('oldworld'); // mod yoksa macera
    expect(deserializeGame({ v: SAVE_VERSION + 1, seed: 5, mode: 'macera' }).code).toBe('newer');
  });

  it('v1 insa kaydı: sütun farkları (cx,cz, 32768) kesit farklarına (cx,cz,si) bölünür', () => {
    const full = new Uint8Array(32768).fill(255);
    full[(70 << 8) + (3 << 4) + 2] = B.BRICK; // y=70 → kesit 4
    full[(5 << 8) + 1] = B.STONE; // y=5 → kesit 0
    const old = { v: 1, mode: 'insa', seed: 5, name: 'Ev', edits: { '2,3': encodeRle(full), 'bozuk': 'x' } };
    const r = deserializeGame(old);
    expect(r.ok).toBe(true);
    expect(r.game.migratedFrom).toBe(1);
    expect(r.game.v).toBe(SAVE_VERSION);
    expect(r.game.edits.count).toBe(2);
    expect(r.game.edits.list.map((c) => c.cx + ',' + c.cz + ',' + c.si).sort()).toEqual(['2,3,0', '2,3,4']);
    const entries = diffsToEntries(r.game.edits.list, 0).map((e) => e.join(',')).sort();
    expect(entries).toEqual(['33,5,48,' + B.STONE, '34,70,51,' + B.BRICK].sort());
    expect(Object.keys(migrateChunkDiffs({ '2,3': encodeRle(full) })).sort()).toEqual(['2,3,0', '2,3,4']);
  });
});

describe('boyut ve bulut zarfı', () => {
  it('utf8Length ve estimateSaveSize', () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('çğış')).toBe(8);
    expect(utf8Length('€')).toBe(3);
    expect(utf8Length('😀')).toBe(4);
    const o = { a: 'çş' };
    expect(estimateSaveSize(o)).toBe(utf8Length(JSON.stringify(o)));
    const cyc = {};
    cyc.c = cyc;
    expect(estimateSaveSize(cyc)).toBe(0);
  });

  it('ağır düzenlenmiş dünya bulut sınırının altında kalır (yapısal + gürültü)', () => {
    const w = new World({ seed: 11 });
    let n = 0;
    // 9 chunk: 16x16x24 yapısal tuğla desenli blok + her chunkta 600 rastgele gürültü
    let s = 1234567;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let cz = 0; cz < 3; cz++) {
      for (let cx = 0; cx < 3; cx++) {
        for (let y = 60; y < 84; y++) {
          for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
              const id = (x + z + y) % 7 === 0 ? B.GLASS : y % 4 === 0 ? B.PLANKS_OAK : B.BRICK;
              w.edits.set((cx * 16 + x) + ',' + y + ',' + (cz * 16 + z), id);
              n++;
            }
          }
        }
        for (let i = 0; i < 600; i++) {
          w.edits.set((cx * 16 + Math.floor(rnd() * 16)) + ',' + (30 + Math.floor(rnd() * 90)) + ',' + (cz * 16 + Math.floor(rnd() * 16)), Math.floor(rnd() * 90));
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(55000);
    const sv = serializeGame({ world: w, seed: 11, mode: 'macera' });
    const bytes = estimateSaveSize(sv);
    expect(bytes).toBeLessThan(CLOUD_MAX_BYTES);
    expect(bytes).toBeLessThan(400000);
    const env = buildCloudEnvelope(sv);
    expect(env.ok).toBe(true);
    expect(env.truncated).toBe(false);
    expect(env.payload.length).toBe(JSON.stringify(sv).length);
    expect(deserializeGame(env.payload).ok).toBe(true);
  });

  function noisyEdits(chunks, seed) {
    // sıkıştırılamaz: her hücre rastgele; chunk başına ~100 KB RLE
    const edits = {};
    let s = seed;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    chunks.forEach(([cx, cz]) => {
      for (let y = 40; y < 128; y += 1) {
        for (let z = 0; z < 16; z++) {
          for (let x = 0; x < 16; x++) {
            edits[(cx * 16 + x) + ',' + y + ',' + (cz * 16 + z)] = 1 + Math.floor(rnd() * 90);
          }
        }
      }
    });
    return edits;
  }

  it('bulut zarfı: sığmayan kayıtta varlıklar → harita sisi → sandıklar → uzak düzenlemeler sırayla kesilir', () => {
    const chunks = [];
    for (let i = 0; i < 24; i++) chunks.push([i - 12, 0]);
    const w = new World({ seed: 3 });
    const noisy = noisyEdits(chunks, 99);
    Object.keys(noisy).forEach((k) => w.edits.set(k, noisy[k]));
    const s = buildState();
    const sv = serializeGame({
      world: w, seed: 3, mode: 'macera', player: { x: 0.5, y: 70, z: 0.5 }, progression: s.prog, entities: s.entities, chests: s.chests,
    });
    const full = estimateSaveSize(sv);
    const env = buildCloudEnvelope(sv, { maxBytes: 400000 });
    expect(full).toBeGreaterThan(400000);
    expect(env.ok).toBe(true);
    expect(env.truncated).toBe(true);
    expect(env.stripped[0]).toBe('entities');
    expect(env.stripped).toContain('mapReveal');
    expect(env.stripped).toContain('chests');
    expect(env.stripped.some((x) => x.indexOf('edits:') === 0)).toBe(true);
    expect(env.bytes).toBeLessThanOrEqual(400000 - 4096);
    expect(env.payload.length).toBeLessThanOrEqual(400000);
    expect(env.save.truncated).toBe(true);
    // oyuncuya yakın chunk korunur, uzaktakiler önce gider
    const kept = Object.keys(env.save.edits);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(Object.keys(sv.edits).length);
    const dist = (k) => Math.abs(Number(k.split(',')[0]));
    const droppedKeys = Object.keys(sv.edits).filter((k) => kept.indexOf(k) < 0);
    expect(Math.min(...droppedKeys.map(dist))).toBeGreaterThanOrEqual(Math.max(...kept.map(dist)) - 1);
    expect(sv.truncated).toBeUndefined(); // girdi değiştirilmez
    expect(Object.keys(sv.edits)).toHaveLength(24 * 6); // chunk başına y 40..127 → 6 kesit parçası
    const back = deserializeGame(env.payload);
    expect(back.ok).toBe(true);
    expect(back.game.truncated).toBe(true);
  });

  it('hiçbir şekilde sığmıyorsa ok:false too_large; geçersiz girdi', () => {
    const w = new World({ seed: 3 });
    const sv = serializeGame({ world: w, seed: 3, name: 'x'.repeat(50) });
    expect(buildCloudEnvelope(sv, { maxBytes: 3000 })).toMatchObject({ ok: false, code: 'too_large' });
    expect(buildCloudEnvelope(null)).toMatchObject({ ok: false, code: 'format' });
    expect(buildCloudEnvelope(sv).ok).toBe(true);
    expect(buildCloudEnvelope(sv).truncated).toBe(false);
  });

  it('openCloudEnvelope: {save} sarmalı, düz kayıt, JSON metni', () => {
    const w = new World({ seed: 3 });
    const sv = serializeGame({ world: w, seed: 3 });
    expect(openCloudEnvelope({ save: sv, saved_at: 'x', bytes: 1 })).toBe(sv);
    expect(openCloudEnvelope(sv)).toBe(sv);
    expect(openCloudEnvelope(JSON.stringify({ save: sv })).seed).toBe(3);
    expect(openCloudEnvelope('bozuk')).toBeNull();
    expect(openCloudEnvelope({ foo: 1 })).toBeNull();
    expect(openCloudEnvelope(null)).toBeNull();
  });
});

describe('özet', () => {
  it('summarizeSave ve worldCodeOf', () => {
    const s = buildState();
    const sv = save(s);
    const sm = summarizeSave(sv);
    expect(sm).toMatchObject({
      name: 'Deneme Dünyası', seed: SEED, mode: 'macera', playTime: 4321, savedAt: 1700000500000, truncated: false,
    });
    expect(sm.zone).toEqual({ id: 1, name: 'Fısıldayan Ormanlar' });
    expect(sm.worldCode).toBe(worldCodeOf(SEED));
    expect(sm.worldCode).toMatch(/^[0-9A-Z]{8}$/);
    expect(worldCodeOf('abcd1234')).toBe('ABCD1234');
    expect(worldCodeOf('merhaba dunya')).toMatch(/^[0-9A-Z]{8}$/);
    expect(summarizeSave(null)).toMatchObject({ name: 'Macera', seed: null, worldCode: '' });
    expect(summarizeSave({ progression: { zonesUnlocked: 5 }, mode: 'x' }).zone.id).toBe(0);
  });
});
