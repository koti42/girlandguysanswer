import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { World } from './world.js';
import { spawnPoint } from './worldgen.js';
import { B } from './blocks.js';
import { SAVE_VERSION, SECTION_VOLUME } from './constants.js';
import { Inventory } from './inventory.js';
import { itemByKey } from './items.js';
import { createClock, createWeather } from './daynight.js';
import { createSurvival } from './survival.js';
import { Progression, createProgression } from './progression.js';
import { applyGame, deserializeGame, serializeGame } from './save.js';
import { buildCloudEnvelope } from './saveEnvelope.js';
import { importMap } from './saveMapIO.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function baseSave() {
  const seed = 31337;
  const w = new World({ seed, mode: 'macera' });
  const sp = spawnPoint(seed);
  const cx = Math.floor(sp.x / 16);
  const cz = Math.floor(sp.z / 16);
  for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) w.ensureChunk(cx + dx, cz + dz);
  const bx = Math.floor(sp.x);
  const bz = Math.floor(sp.z);
  for (let i = 0; i < 300; i++) w.setBlock(bx + (i % 10), 66 + (i % 5), bz + ((i / 10) | 0) % 10, i % 9 === 0 ? B.AIR : B.BRICK);
  const inv = new Inventory();
  inv.add('item:kazma_demir', 1);
  inv.add('blok:taş', 20);
  const prog = createProgression(seed);
  prog.onEvent({ type: 'bossDefeated', zone: 1 });
  prog.onEvent({ type: 'blockBroken', id: B.STONE });
  for (let i = 0; i < 10; i++) prog.onEvent({ type: 'tick', dt: 0.3, x: bx + i * 4, z: bz, light: 15 });
  return serializeGame({
    world: w,
    inventory: inv,
    survival: createSurvival(),
    clock: createClock(),
    weather: createWeather(seed),
    progression: prog,
    puzzleManager: { serialize: () => ({ 'turbe:1,1/0': { type: 'basincplakasi', solved: true, state: { open: true } } }) },
    entities: [{ type: 'tavuk', x: bx, y: 70, z: bz, hp: 4 }, { type: 'drop', item: 'item:elma', count: 2, x: bx, y: 70, z: bz }],
    chests: new Map([[bx + ',70,' + bz, [{ item: 'item:elma', count: 3 }]]]),
    player: { x: sp.x, y: sp.y, z: sp.z, yaw: 1, pitch: 0.2, spawn: [bx, 70, bz] },
    seed,
    mode: 'macera',
    name: 'Fuzz',
    playTime: 99,
    savedAt: 5,
  });
}

const JUNK = [
  null, undefined, 0, -1, 1e308, -1e308, NaN, Infinity, 0.5, 2 ** 53, '', 'x', '\u0000', '<script>', '__proto__', 'constructor',
  true, false, [], {}, [null], [[]], { a: { b: { c: 1 } } }, 'A'.repeat(500), [1, 2, 3, 4, 5, 6], { __proto__: null }, 255, 128, 127,
];

function cloneVal(v) {
  if (Array.isArray(v)) return v.map(cloneVal);
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach((k) => { o[k] = cloneVal(v[k]); });
    return o;
  }
  return v;
}
/** Her kullanımda taze (paylaşılmayan) bozuk değer. */
function junk(rnd) {
  return cloneVal(JUNK[Math.floor(rnd() * JUNK.length)]);
}

function collectPaths(o, prefix, out, depth) {
  if (depth > 5 || o === null || typeof o !== 'object') return;
  Object.keys(o).forEach((k) => {
    const p = prefix.concat([k]);
    out.push(p);
    const v = o[k];
    if (v && typeof v === 'object' && !(typeof v === 'string')) collectPaths(v, p, out, depth + 1);
  });
}

function getAt(o, path) {
  let cur = o;
  for (let i = 0; i < path.length; i++) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[path[i]];
  }
  return cur;
}
function setAt(o, path, val, del) {
  let cur = o;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur === null || typeof cur !== 'object') return;
    cur = cur[path[i]];
  }
  if (cur === null || typeof cur !== 'object') return;
  const k = path[path.length - 1];
  if (del) {
    if (Array.isArray(cur)) cur.splice(Number(k), 1);
    else delete cur[k];
  } else {
    cur[k] = val;
  }
}

function checkInvariants(r) {
  expect(r.ok).toBe(true);
  const g = r.game;
  expect(g.v).toBe(SAVE_VERSION);
  expect(['macera', 'insa', 'harita']).toContain(g.mode);
  expect(['number', 'string']).toContain(typeof g.seed);
  expect(Array.from(g.name).length).toBeLessThanOrEqual(60);
  expect(Number.isFinite(g.playTime) && g.playTime >= 0).toBe(true);
  if (g.player.pos !== null) {
    expect(g.player.pos).toHaveLength(3);
    g.player.pos.forEach((n) => expect(Number.isFinite(n)).toBe(true));
  }
  expect(Number.isFinite(g.player.yaw)).toBe(true);
  expect(Math.abs(g.player.pitch)).toBeLessThanOrEqual(1.6);
  if (g.player.survival) {
    const sv = g.player.survival;
    expect(sv.hp).toBeGreaterThan(0);
    expect(sv.hp).toBeLessThanOrEqual(sv.maxHp);
    expect(sv.hunger >= 0 && sv.hunger <= 20).toBe(true);
  }
  g.edits.list.forEach((c) => {
    expect(c.diff).toBeInstanceOf(Uint8Array);
    expect(c.diff.length).toBe(SECTION_VOLUME);
    for (let i = 0; i < c.diff.length; i += 97) expect(c.diff[i] === 255 || c.diff[i] <= 127).toBe(true);
  });
  expect(g.entities.length).toBeLessThanOrEqual(80);
  g.entities.forEach((e) => {
    expect(typeof e.type).toBe('string');
    expect([e.x, e.y, e.z].every(Number.isFinite)).toBe(true);
    expect(e).not.toHaveProperty('ai');
  });
  expect(g.drops.length).toBeLessThanOrEqual(100);
  g.drops.forEach((d) => {
    const it = itemByKey(d.item);
    expect(it).not.toBeNull();
    expect(d.count >= 1 && d.count <= it.stack).toBe(true);
  });
  Object.keys(g.chests).forEach((k) => {
    expect(k).toMatch(/^-?\d+,\d{1,3},-?\d+$/);
    expect(g.chests[k]).toHaveLength(27);
    g.chests[k].forEach((s) => {
      if (s === null) return;
      const it = itemByKey(s.item);
      expect(it).not.toBeNull();
      expect(s.count >= 1 && s.count <= it.stack).toBe(true);
    });
  });
  if (g.progression !== null) {
    const p = new Progression(g.seed);
    expect(p.restore(g.progression)).toBe(true);
    expect(p.zonesUnlocked[0]).toBe(true);
  }
  if (g.player.inventory) expect(new Inventory().fromJSON(g.player.inventory).toJSON().v).toBe(1);
}

describe('bozuk kayıt fuzz', () => {
  const base = baseSave();
  const baseJson = JSON.stringify(base);
  const paths = [];
  collectPaths(base, [], paths, 0);

  it('temel kayıt geçerli', () => {
    const r = deserializeGame(baseJson);
    checkInvariants(r);
    expect(r.warnings).toEqual([]);
  });

  it('alan düzeyinde rastgele bozma: asla atmaz, ok ise değişmezler korunur', { timeout: 120000 }, () => {
    const rnd = rng(2024);
    let okCount = 0;
    let failCount = 0;
    const codes = new Set();
    for (let i = 0; i < 1500; i++) {
      const d = JSON.parse(baseJson);
      const n = 1 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const path = paths[Math.floor(rnd() * paths.length)];
        const mode = rnd();
        if (mode < 0.15) {
          setAt(d, path, undefined, true);
        } else if (mode < 0.25) {
          // başka bir yoldan değer kopyala (tür karışıklığı)
          setAt(d, path, getAt(d, paths[Math.floor(rnd() * paths.length)]));
        } else {
          setAt(d, path, junk(rnd));
        }
      }
      let r;
      expect(() => { r = deserializeGame(d); }).not.toThrow();
      expect(typeof r.ok).toBe('boolean');
      if (r.ok) {
        okCount++;
        checkInvariants(r);
        if (i % 25 === 0) {
          const w = new World({ seed: 31337, mode: 'macera' });
          expect(() => applyGame(r.game, {
            world: w, inventory: new Inventory(), survival: createSurvival(), clock: createClock(), progression: createProgression(1),
          })).not.toThrow();
        }
      } else {
        failCount++;
        codes.add(r.code);
        expect(typeof r.code).toBe('string');
        expect(typeof r.error).toBe('string');
        expect(r).not.toHaveProperty('game');
      }
    }
    expect(okCount).toBeGreaterThan(300);
    expect(failCount).toBeGreaterThan(15);
    expect(codes.size).toBeGreaterThanOrEqual(2);
  });

  it('metin düzeyinde bozma (kesme, bayt çevirme, ekleme): asla atmaz', { timeout: 120000 }, () => {
    const rnd = rng(77);
    let failed = 0;
    for (let i = 0; i < 600; i++) {
      let s = baseJson;
      const kind = Math.floor(rnd() * 4);
      if (kind === 0) {
        s = s.slice(0, Math.floor(rnd() * s.length));
      } else if (kind === 1) {
        const arr = s.split('');
        const n = 1 + Math.floor(rnd() * 8);
        for (let k = 0; k < n; k++) arr[Math.floor(rnd() * arr.length)] = String.fromCharCode(32 + Math.floor(rnd() * 95));
        s = arr.join('');
      } else if (kind === 2) {
        const p = Math.floor(rnd() * s.length);
        s = s.slice(0, p) + s.slice(p + 1 + Math.floor(rnd() * 40));
      } else {
        const p = Math.floor(rnd() * s.length);
        s = s.slice(0, p) + '\u0000\ud800{[' + s.slice(p);
      }
      let r;
      expect(() => { r = deserializeGame(s); }).not.toThrow();
      expect(typeof r.ok).toBe('boolean');
      if (r.ok) checkInvariants(r);
      else failed++;
    }
    expect(failed).toBeGreaterThan(100);
  });

  it('tamamen rastgele JSON değerleri ve ham metin', () => {
    const rnd = rng(5);
    const gen = (depth) => {
      const t = Math.floor(rnd() * (depth > 3 ? 4 : 7));
      if (t === 0) return junk(rnd);
      if (t === 1) return Math.floor(rnd() * 1000) - 500;
      if (t === 2) return 'ab'.repeat(Math.floor(rnd() * 20));
      if (t === 3) return rnd() < 0.5;
      if (t === 4 || t === 5) {
        const a = [];
        const n = Math.floor(rnd() * 5);
        for (let i = 0; i < n; i++) a.push(gen(depth + 1));
        return a;
      }
      const o = {};
      const n = Math.floor(rnd() * 6);
      const ks = ['v', 'mode', 'seed', 'player', 'edits', 'progression', 'chests', 'entities', 'time', 'name', 'x'];
      for (let i = 0; i < n; i++) o[ks[Math.floor(rnd() * ks.length)]] = gen(depth + 1);
      return o;
    };
    for (let i = 0; i < 800; i++) {
      const v = gen(0);
      let r;
      expect(() => { r = deserializeGame(v); }).not.toThrow();
      expect(typeof r.ok).toBe('boolean');
      expect(() => { r = deserializeGame(JSON.stringify(v) || ''); }).not.toThrow();
      expect(typeof r.ok).toBe('boolean');
    }
  });

  it('çok derin iç içe JSON ve devasa girdi', () => {
    const deep = '['.repeat(50000) + ']'.repeat(50000);
    expect(() => deserializeGame(deep)).not.toThrow();
    expect(deserializeGame(deep).ok).toBe(false);
    const nested = JSON.parse(baseJson);
    let cur = nested.puzzleStates;
    for (let i = 0; i < 200; i++) {
      cur.n = {};
      cur = cur.n;
    }
    expect(() => deserializeGame(nested)).not.toThrow();
    expect(deserializeGame('x'.repeat(9 * 1024 * 1024))).toMatchObject({ ok: false, code: 'too_large' });
  });

  it('prototip kirliliği olmaz', () => {
    const evil = '{"v":1,"seed":1,"__proto__":{"polluted":true},"player":{"__proto__":{"polluted2":true},"constructor":{"prototype":{"polluted3":true}}},'
      + '"puzzleStates":{"__proto__":{"type":"x","solved":true}},"chests":{"__proto__":[]},"progression":{"__proto__":{"polluted4":1},"stats":{"__proto__":{"polluted5":1},"crafted":{"__proto__":3}}}}';
    const r = deserializeGame(evil);
    expect(typeof r.ok).toBe('boolean');
    const o = {};
    ['polluted', 'polluted2', 'polluted3', 'polluted4', 'polluted5'].forEach((k) => expect(o[k]).toBeUndefined());
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
    const p = createProgression(1);
    p.restore(JSON.parse(evil).progression);
    expect(({}).polluted4).toBeUndefined();
  });

  it('bozuk bulut zarfı/harita içe aktarma da atmaz', () => {
    const rnd = rng(9);
    for (let i = 0; i < 100; i++) {
      const d = JSON.parse(baseJson);
      const path = paths[Math.floor(rnd() * paths.length)];
      setAt(d, path, junk(rnd));
      expect(() => buildCloudEnvelope(d)).not.toThrow();
      expect(() => importMap(d)).not.toThrow();
    }
  });
});

describe('kaynak kuralları (sim: saf, es2020, ≤ 900 satır)', () => {
  const files = [
    'progression', 'progressionData', 'progressionMap', 'progressionMetrics', 'progressionState', 'quests', 'questsData',
    'achievements', 'achievementsData', 'save', 'saveEdits', 'saveSanitize', 'saveEnvelope', 'saveStorage', 'saveMapIO',
  ];
  const banned = [
    /Math\.random/, /Date\.now/, /Object\.hasOwn\b/, /\.replaceAll\(/, /structuredClone/, /[\w\])]\.at\(/, /\bbtoa\(/, /\batob\(/,
    /from ['"]three/, /\bwindow\./, /\bdocument\./, /TODO/, /not implemented/, /new Date\(/,
  ];
  files.forEach((f) => {
    it(f + '.js', () => {
      const src = readFileSync(fileURLToPath(new URL('./' + f + '.js', import.meta.url)), 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      banned.forEach((re) => expect(re.test(code), f + ' içinde ' + re).toBe(false));
      expect(src.split('\n').length, f).toBeLessThanOrEqual(900);
    });
  });
});
