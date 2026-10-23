/*
 * qa5 (Faz 5, qa_logic) — KAYIT / YÜKLEME FUZZ'I (kayıt v1–v3, dims.neon, cityState, araçlar, kilitler, görevler, talep kuyruğu):
 *   - geçerli zengin kayıtlar (rastgele geçerli içerik) kayıpsız ve bayt-kararlı gidiş-dönüş yapar (serialize → JSON → deserialize → serialize aynı);
 *   - YAPISAL bozma (ağaçta rastgele yol: sil / tür değiştir / çöp değer / dev sayı / NaN / kesik dizi / __proto__ anahtarı) + metin kesme +
 *     eski sürümler (v0/v1/v2) + düşmanca yükler: ASLA atmaz, NaN/Infinity üretmez, prototip kirlenmez, çıktı her zaman güvenli değere indirgenir ve
 *     ikinci temizleme aynı sonucu verir (idempotent), sınırlar (city ≤ 60 KB, toplam ≤ 400 KB) tutar;
 *   - talep kuyruğu: city.claims kalıcılığı (bekleyen = 1 yeniden yükleme sonrası da bekler), onaylı = 2 geri dönmez, bozuk değer sıfırlanır.
 * Ortam: KESIF_QA5_FUZZ (yineleme çarpanı, vars. 1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../sim/rng.js';
import { Inventory } from '../sim/inventory.js';
import { ITEMS } from '../sim/items.js';
import { deserializeGame, migrateSave, serializeGame } from '../sim/save.js';
import { DIM_SAVE_LIMITS } from '../sim/dim/dimensions.js';
import {
  jsonBytes, safeBlob, sanitizeDims, sanitizeNeon, unregisterDimSanitizer,
} from '../sim/dim/dimSanitize.js';
import { createDimCtxSim, restoreDim, serializeDim } from '../sim/dim/dimState.js';
import {
  baseState, bigNeon, fakeWorld, installFlatCity, playedNeonCtx, scatterEdits, v2Save,
} from '../sim/dim/dimTestKit.js';
import { CLOUD_MARGIN, buildCloudEnvelope, openCloudEnvelope } from '../sim/saveEnvelope.js';
import { B } from '../sim/blocks.js';
import { unregisterDimGen } from '../sim/dim/genRegistry.js';
import { installCityStateSanitizer, sanitizeCityState } from '../sim/city/cityState.js';
import { sanitizeVehicleSave } from '../sim/city/vehicle/vehicleSave.js';
import {
  sanitizeFlags, sanitizeNpcs, sanitizeShop,
} from '../sim/city/ped/npcSave.js';
import { sanitizeDiscovery } from '../sim/city/mission/discovery.js';
import { createClaimQueue } from '../sim/city/mission/claimQueue.js';
import { evaluateClaims, markClaimed, pendingClaims } from '../sim/city/cityEvents.js';
import { CHAIN_ORDER } from '../sim/city/mission/quests.js';
import { ACHIEVEMENT_BY_ID } from '../sim/city/mission/achievements.js';
import {
  callSafe, canon, deepFinite, diffPath, findProto, nonFinitePath, protoPath,
} from './qa5Kit.js';

vi.setConfig({ testTimeout: 900000 });

const ENV = (globalThis.process && globalThis.process.env) || {};
const MUL = Number(ENV.KESIF_QA5_FUZZ || 1);
/** KESIF_QA5_SEED: tohum kayması (kapı koşusunda farklı rastgele akışlar: 0, 1, 2…). */
const SEED_OFF = Number(ENV.KESIF_QA5_SEED || 0) * 7919;
const rngOf = (seed) => seededRandom((seed + SEED_OFF) >>> 0);
const PROTO_NAMES = Object.getOwnPropertyNames(Object.prototype);
const PROTO_SNAPSHOT = JSON.stringify(PROTO_NAMES);

let uninstall = null;
beforeEach(() => {
  uninstall = installFlatCity();
  installCityStateSanitizer();
});
afterEach(() => {
  if (uninstall) uninstall();
  unregisterDimSanitizer('neon', 'city');
  unregisterDimGen('city');
});

/* ------------------------------------------------------------------------------------------------
 * Üreticiler
 * ---------------------------------------------------------------------------------------------- */
function defineOwn(o, k, v) {
  Object.defineProperty(o, k, {
    value: v, enumerable: true, configurable: true, writable: true,
  });
}

const HOSTILE_STR = ['', ' ', 'x', '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf', '😀😀', '‮​', '\0', 'a'.repeat(5000), '1e999', '-0', 'ı̇', 'İ', '../', '<script>', '%00'];
const HOSTILE_NUM = [0, -0, 1, -1, 0.5, -0.5, 255, 256, 65535, 65536, 2 ** 31, -(2 ** 31), 2 ** 32, 2 ** 53, 1e15, 1e308, -1e308, 5e-324, NaN, Infinity, -Infinity];

/** Rastgele JSON-benzeri (NaN/Infinity dahil, düşmanca anahtarlı) değer. */
function chaos(rng, depth) {
  const r = rng.next();
  if (depth <= 0 || r < 0.45) {
    const k = rng.int(0, 5);
    if (k === 0) return null;
    if (k === 1) return rng.chance(0.5);
    if (k === 2 || k === 3) return rng.pick(HOSTILE_NUM);
    return rng.pick(HOSTILE_STR);
  }
  if (r < 0.7) {
    const a = [];
    const n = rng.int(0, 8);
    for (let i = 0; i < n; i++) a.push(chaos(rng, depth - 1));
    return a;
  }
  const o = {};
  const n = rng.int(0, 8);
  for (let i = 0; i < n; i++) {
    const key = rng.chance(0.4) ? rng.pick(HOSTILE_STR) : 'k' + rng.int(0, 20);
    defineOwn(o, key, chaos(rng, depth - 1));
  }
  return o;
}

/** Zengin GEÇERLİ şehir durumu (her alt sistem alanı dolu). */
function richCity() {
  const veh = sanitizeVehicleSave({
    garage: { owned: [{ cls: 'taksi' }, { cls: 'spor' }, { cls: 'motor' }], active: 1 },
    summoned: {
      idx: 0, x: 12.5, y: 64, z: -30.25, yaw: 1.2, dmg: 0.2,
    },
    rental: {
      cls: 'hoverbike', left: 321.5, x: 3, y: 64, z: 9, yaw: 0,
    },
    vstats: { km: 12.345, enters: 4 },
  });
  return {
    v: 1,
    kredi: 345,
    garage: veh.garage,
    summoned: veh.summoned,
    rental: veh.rental,
    vstats: veh.vstats,
    flags: { ilk: 1, tanisti: 3 },
    npcs: { kerem: { r: 2, v: 3, d: 4, s: { 'kerem.root': 2 } } },
    shop: sanitizeShop({
      d: 1, s: { 'kerem|item:elma': 2 }, g: { 'item:elma': 2 }, k: { 'item:elma': 1 }, t: 12.5, kg: 10,
    }),
    discovery: sanitizeDiscovery({
      chips: '0123456789abcdef'.repeat(3) + 'ffff', graffiti: { 3: [1, 2], 40: [0, 1] }, rooms: 5, sets: 3, story: 2, shops: ['kerem', 'sule'],
    }),
    runs: { 0: { n: 3, b: { taksi: [1234, 2] } }, 5: { n: 1, b: {} } },
    jobs: { done: 3, earned: 99, log: [5, 9] },
    mission: {
      k: 'race', id: 'race0', c: 'taksi', n: [10, 20], r: {
        id: 'race0', s: 1, g: 0, l: 1, p: 0, t: 12.5, h: 3, c: 0, a: 1, b: 0,
      },
    },
    quests: { [CHAIN_ORDER[0]]: 1, [CHAIN_ORDER[1]]: 2 },
    ach: Object.keys(ACHIEVEMENT_BY_ID).slice(0, 3),
    claims: { firstjob: 1, easter: 2 },
    stats: { citySeconds: 99, tmask: 5, dimHops: 2 },
  };
}

/** props ve varlık yöneticisi taklitli bağlam (serializeDim ∘ restoreDim bu alanları da taşısın). */
function ctxWithParts(seedWorld) {
  const ctx = createDimCtxSim('neon', seedWorld);
  ctx.props = {
    data: {},
    serialize() { return this.data; },
    restore(o) { this.data = o; },
  };
  ctx.em = {
    last: { mobs: [], items: [] },
    serialize() { return this.last; },
    restore(o) { this.last = o; },
  };
  return ctx;
}

function richNeon(seedWorld) {
  const ctx = playedNeonCtx(seedWorld);
  ctx.city = richCity();
  return serializeDim(ctx);
}

/* ------------------------------------------------------------------------------------------------
 * Yapısal bozma
 * ---------------------------------------------------------------------------------------------- */
function paths(node, base, out, depth) {
  if (depth > 6 || !node || typeof node !== 'object') return out;
  Object.keys(node).forEach((k) => {
    const p = base.concat([k]);
    out.push(p);
    paths(node[k], p, out, depth + 1);
  });
  return out;
}

function getAt(root, p) {
  let n = root;
  for (let i = 0; i < p.length - 1; i++) n = n[p[i]];
  return n;
}

/** Ağacın kopyasında bir yolu bozar (JSON benzeri nesne; NaN/Infinity ve gerçek __proto__ anahtarı üretebilir). */
function mutate(rng, root) {
  const ps = paths(root, [], [], 0);
  if (ps.length === 0) return chaos(rng, 3);
  const p = rng.pick(ps);
  const parent = getAt(root, p);
  const key = p[p.length - 1];
  const cur = parent[key];
  const op = rng.int(0, 9);
  if (op === 0) delete parent[key];
  else if (op === 1) parent[key] = chaos(rng, 3);
  else if (op === 2) parent[key] = rng.pick(HOSTILE_NUM);
  else if (op === 3) parent[key] = rng.pick(HOSTILE_STR);
  else if (op === 4 && Array.isArray(cur)) parent[key] = cur.slice(0, rng.int(0, cur.length));
  else if (op === 5 && Array.isArray(cur)) parent[key] = cur.concat(cur, [chaos(rng, 2)]);
  else if (op === 6 && cur && typeof cur === 'object' && !Array.isArray(cur)) defineOwn(cur, rng.pick(['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty']), chaos(rng, 2));
  else if (op === 7 && typeof cur === 'number') parent[key] = cur * rng.pick([-1, 1e9, 1e-9, 2 ** 40, 0.5]);
  else if (op === 8 && typeof cur === 'string') parent[key] = cur.slice(0, rng.int(0, cur.length)) + rng.pick(HOSTILE_STR);
  else if (op === 9) parent[key] = typeof cur === 'object' && cur !== null ? [] : {};
  return root;
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/** Çıktı değişmezleri: JSON-güvenli sayılar, prototip anahtarı yok, Object.prototype üyelerini gölgeleyen anahtar yok. */
function shadowKeys(v, depth, out, path) {
  if (depth > 40 || !v || typeof v !== 'object') return out;
  const base = path || '';
  Object.keys(v).forEach((k) => {
    if (PROTO_NAMES.indexOf(k) >= 0) out.push(base + '/' + k);
    shadowKeys(v[k], depth + 1, out, base + '/' + k);
  });
  return out;
}

function safeOut(v, label) {
  expect(nonFinitePath(v), label + ' sayı sonlu').toBe('');
  expect(deepFinite(v), label + ' sayı sonlu').toBe(true);
  expect(protoPath(v), label + ' prototip anahtarı').toBe('');
  expect(findProto(v), label + ' prototip anahtarı').toBe(false);
  expect(shadowKeys(v, 0, []), label + ' Object.prototype üyesini gölgeleyen anahtar').toEqual([]);
  expect(canon(JSON.parse(JSON.stringify(v))), label + ' JSON gidiş-dönüş').toBe(canon(v));
}

function protoClean() {
  expect(JSON.stringify(Object.getOwnPropertyNames(Object.prototype))).toBe(PROTO_SNAPSHOT);
  expect({}.polluted).toBeUndefined();
  expect([].polluted).toBeUndefined();
}

const T = {
  city: 0, cityNull: 0, neon: 0, neonNull: 0, saves: 0, saveOk: 0, saveFail: 0, rounds: 0,
};

/* ------------------------------------------------------------------------------------------------
 * 1) şehir durumu
 * ---------------------------------------------------------------------------------------------- */
describe('qa5 kayıt fuzz — cityState (araç, kilit/görev, keşif, NPC, talepler)', () => {
  it('zengin geçerli durum KAYIPSIZ: sanitize(rich) == rich (bayt-kararlı)', () => {
    const rich = richCity();
    const w = [];
    const out = sanitizeCityState(clone(rich), w);
    expect(canon(out)).toBe(canon(rich));
    expect(w).toEqual([]);
    safeOut(out, 'zengin');
    expect(canon(sanitizeCityState(clone(out)))).toBe(canon(out));
    // bilinmeyen (ileri uyum) anahtar korunur, küçük
    const fwd = sanitizeCityState(Object.assign(clone(rich), { future: { a: 1, b: [1, 2] } }));
    expect(fwd.future).toEqual({ a: 1, b: [1, 2] });
  });

  it('3000 yapısal bozma + 1500 saf kaos: atmaz, güvenli, idempotent, sınırlı', () => {
    const rng = rngOf(0x5a17e + 1);
    const rich = richCity();
    const N = 3000 * MUL;
    for (let i = 0; i < N + 1500 * MUL; i++) {
      let raw;
      if (i < N) {
        raw = clone(rich);
        const k = rng.int(1, 5);
        for (let m = 0; m < k; m++) raw = mutate(rng, raw);
      } else raw = chaos(rng, 5);
      let out;
      out = callSafe(() => sanitizeCityState(raw, []), 'sanitizeCityState#' + i);
      T.city++;
      if (out === null) { T.cityNull++; continue; }
      safeOut(out, 'city#' + i);
      const again = sanitizeCityState(clone(out), []);
      expect(canon(again), 'idempotent city#' + i).toBe(canon(out));
      expect(out.kredi === undefined || (Number.isInteger(out.kredi) && out.kredi >= 0 && out.kredi <= 1e9)).toBe(true);
      expect(out.garage === undefined || out.garage.owned.length <= 6).toBe(true);
      if (out.claims) Object.keys(out.claims).forEach((k) => { expect(['firstjob', 'goldrace', 'chips60', 'easter']).toContain(k); expect([1, 2]).toContain(out.claims[k]); });
      if (out.stats) Object.keys(out.stats).forEach((k) => { expect(Number.isInteger(out.stats[k]) && out.stats[k] > 0).toBe(true); });
      if (out.quests) Object.keys(out.quests).forEach((k) => expect([1, 2]).toContain(out.quests[k]));
      if (out.mission) expect(['job', 'race']).toContain(out.mission.k);
      if (out.discovery) {
        expect(out.discovery.chips.length).toBe(60);
        expect(Object.keys(out.discovery.graffiti).length).toBeLessThanOrEqual(90);
      }
    }
    protoClean();
    expect(T.city - T.cityNull).toBeGreaterThan(1000);
  });

  it('alt doğrulayıcılar tek tek (2000 kaos): araç, bayrak, NPC, dükkân, keşif — atmaz, güvenli, idempotent', () => {
    const rng = rngOf(7771);
    const fns = {
      vehicle: sanitizeVehicleSave, flags: sanitizeFlags, npcs: sanitizeNpcs, shop: sanitizeShop, discovery: sanitizeDiscovery,
    };
    Object.keys(fns).forEach((name) => {
      for (let i = 0; i < 400 * MUL; i++) {
        const raw = chaos(rng, 4);
        let out;
        expect(() => { out = fns[name](raw); }).not.toThrow();
        safeOut(out, name);
        expect(canon(fns[name](clone(out))), name + ' idempotent').toBe(canon(out));
      }
    });
    protoClean();
  });

  it('safeBlob: derinlik/anahtar/dizi/metin/düğüm sınırları, sonsuz/NaN dizide 0 nesnede atlanır, döngüsel yapı atmaz', () => {
    const cyc = { a: 1 };
    cyc.self = cyc;
    expect(() => safeBlob(cyc)).not.toThrow();
    const rng = rngOf(31);
    for (let i = 0; i < 500; i++) {
      const b = safeBlob(chaos(rng, 6));
      if (b === null) continue;
      expect(deepFinite(b)).toBe(true);
      expect(findProto(b)).toBe(false);
      expect(jsonBytes(b)).toBeLessThan(2e6);
    }
  });
});

/* ------------------------------------------------------------------------------------------------
 * 2) dims.neon blobu
 * ---------------------------------------------------------------------------------------------- */
describe('qa5 kayıt fuzz — dims.neon (kilitler, prop, yığın, varlıklar, düzenlemeler)', () => {
  it('zengin geçerli blob: sanitizeNeon idempotent ve serializeDim gidiş-dönüşü kararlı (restoreDim ∘ serializeDim)', () => {
    const neon = richNeon(11);
    safeOut(neon, 'neon');
    expect(canon(sanitizeNeon(clone(neon)))).toBe(canon(neon));
    const ctx = ctxWithParts(11);
    const r = restoreDim(ctx, clone(neon));
    expect(r.ok).toBe(true);
    expect(canon(serializeDim(ctx))).toBe(canon(neon));
    // ikinci tur: aynı bağlama tekrar uygula → aynı
    restoreDim(ctx, clone(neon));
    expect(canon(serializeDim(ctx))).toBe(canon(neon));
  });

  it('2000 yapısal bozma: atmaz; ok ise güvenli, sınırlar (toplam ≤ 400 KB, city ≤ 60 KB, kimlikler ^[0-9a-z]{1,10}$), idempotent, restore ∘ serialize kararlı', () => {
    const rng = rngOf(0xbeef);
    const base = richNeon(12);
    const N = 2000 * MUL;
    for (let i = 0; i < N; i++) {
      let raw = clone(base);
      const k = rng.int(1, 6);
      for (let m = 0; m < k; m++) raw = mutate(rng, raw);
      let out;
      out = callSafe(() => sanitizeNeon(raw, []), 'sanitizeNeon#' + i);
      T.neon++;
      if (out === null) { T.neonNull++; continue; }
      safeOut(out, 'neon#' + i);
      expect(jsonBytes(out)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.total);
      if (out.city) expect(jsonBytes(out.city)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.city);
      Object.keys(out.props).forEach((id) => expect(/^[0-9a-z]{1,10}$/.test(id)).toBe(true));
      Object.keys(out.locks).forEach((id) => expect(/^[0-9a-z]{1,10}$/.test(id)).toBe(true));
      expect(out.terminals >= 0 && out.terminals <= 65535).toBe(true);
      expect(out.stash.length).toBeLessThanOrEqual(64);
      expect(out.entities.length).toBeLessThanOrEqual(DIM_SAVE_LIMITS.entities);
      expect(diffPath(sanitizeNeon(clone(out), []), out), 'idempotent neon#' + i).toBe('');
      if (i % 25 === 0) {
        const ctx = ctxWithParts(13);
        expect(() => restoreDim(ctx, clone(out))).not.toThrow();
        const s1 = serializeDim(ctx);
        const ctx2 = ctxWithParts(13);
        restoreDim(ctx2, clone(s1));
        expect(diffPath(serializeDim(ctx2), s1), 'restore∘serialize kararlı neon#' + i).toBe('');
      }
    }
    protoClean();
    expect(T.neon - T.neonNull).toBeGreaterThan(1500);
  });

  it('1000 saf kaos blob + dims üst düzey kaos: atmaz, yalnız bilinen boyut, güvenli', () => {
    const rng = rngOf(0xc4a05);
    for (let i = 0; i < 1000 * MUL; i++) {
      const raw = chaos(rng, 5);
      let d;
      expect(() => { d = sanitizeDims(raw, []); }).not.toThrow();
      expect(Object.keys(d).every((k) => k === 'neon')).toBe(true);
      safeOut(d, 'dims');
      expect(() => sanitizeDims({ neon: raw }, [])).not.toThrow();
    }
    protoClean();
  });

  it('talep kuyruğu kalıcılığı: bekleyen (1) kayıttan sonra da bekler, onaylı (2) geri dönmez, bozuk değer sıfırlanır', () => {
    const city = sanitizeCityState({ v: 1, claims: { firstjob: 1, goldrace: 2, chips60: 7, easter: 'x', junk: 1, __proto__: 1 } });
    expect(city.claims).toEqual({ firstjob: 1, goldrace: 2, chips60: 2 });
    const sent = [];
    const q = createClaimQueue({ getCity: () => city, now: () => 0, emit: (e) => sent.push(e.key) });
    expect(q.pending().sort()).toEqual(['neon:firstjob']);
    q.tick();
    expect(sent).toEqual(['neon:firstjob']);
    // kayıt → yükleme → kuyruk yeniden kurulur
    const saved = clone(city);
    const city2 = sanitizeCityState(saved);
    const q2 = createClaimQueue({ getCity: () => city2, now: () => 1000, emit: (e) => sent.push(e.key) });
    expect(q2.pending()).toEqual(['neon:firstjob']);
    expect(q2.onClaimed('neon:firstjob')).toBe(true);
    expect(q2.onClaimed('neon:firstjob')).toBe(false);
    expect(city2.claims.firstjob).toBe(2);
    // onaylı tekrar 1'e dönmez (evaluateClaims dokunmaz)
    const view = { chipsFound: 240, goldMedals: 8, jobsDone: 99, easter: 1 };
    expect(() => evaluateClaims(city2, view)).not.toThrow();
    expect(city2.claims.firstjob).toBe(2);
    // bilinmeyen/zehirli anahtarlar
    ['neon:nope', '__proto__', 'neon:', '', null, undefined, 5, {}].forEach((k) => expect(markClaimed(city2, k)).toBe(false));
    expect(pendingClaims(null)).toEqual([]);
    expect(pendingClaims({ claims: { firstjob: 1.5 } })).toEqual([]);
    protoClean();
  });
});

/* ------------------------------------------------------------------------------------------------
 * 3) tam kayıt (v1–v3)
 * ---------------------------------------------------------------------------------------------- */
function richInventory() {
  const inv = new Inventory();
  inv.add('item:ok', 17);
  inv.add('item:kazma_demir', 1);
  inv.add('blok:taş', 64);
  inv.add('item:küçük_anahtar', 1);
  return inv;
}

function richSave(seedWorld) {
  const dims = { neon: richNeon(seedWorld) };
  return serializeGame(baseState({
    inventory: richInventory(),
    seed: seedWorld,
    dim: 'neon',
    dimMeta: {
      calibrated: true, visits: 3, firstArrival: 1700000000000, link: { from: [1, 70, 2, 0.5] }, overworldPos: [1, 70, 2], lastHopAt: 12.5,
    },
    dims,
    player: { pos: [10.5, 64, 20.5], yaw: 1.5, pitch: 0.2 },
  }));
}

function checkGame(r, label) {
  expect(typeof r.ok, label).toBe('boolean');
  if (!r.ok) {
    expect(typeof r.code).toBe('string');
    expect(typeof r.error).toBe('string');
    T.saveFail++;
    return;
  }
  T.saveOk++;
  const g = r.game;
  safeOut(g.dims, label + ' dims');
  safeOut(g.dimMeta, label + ' dimMeta');
  expect(deepFinite(g.player), label + ' player').toBe(true);
  if (g.player.inventory) {
    const slots = g.player.inventory.slots.concat(g.player.inventory.armor);
    slots.forEach((sl) => {
      if (!sl) return;
      expect(Array.isArray(sl) && typeof sl[0] === 'string' && !!ITEMS[sl[0]], label + ' envanter yuvası ' + JSON.stringify(sl)).toBe(true);
      expect(Number.isInteger(sl[1]) && sl[1] >= 1 && sl[1] <= ITEMS[sl[0]].stack, label + ' yuva sayısı ' + JSON.stringify(sl)).toBe(true);
    });
    expect(diffPath(new Inventory().fromJSON(g.player.inventory).toJSON(), g.player.inventory), label + ' envanter kararlı').toBe('');
  }
  expect(['overworld', 'neon']).toContain(g.player.dim);
  if (g.player.dim === 'neon') {
    expect(g.dims.neon, label).toBeTruthy();
    expect(Math.abs(g.player.pos[0])).toBeLessThanOrEqual(800);
    expect(Math.abs(g.player.pos[2])).toBeLessThanOrEqual(800);
  }
  expect(Object.keys(g.dims).every((k) => k === 'neon')).toBe(true);
  if (g.dims.neon) expect(jsonBytes(g.dims.neon)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.total);
  expect(protoPath(g.player), label + ' player prototip').toBe('');
  expect(deepFinite(g.time)).toBe(true);
  expect(deepFinite(g.entities)).toBe(true);
}

describe('qa5 kayıt fuzz — tam kayıt: gidiş-dönüş, bozma, kesme, eski sürümler', () => {
  it('geçerli şehir kaydı: serialize → JSON → deserialize → serialize bayt-kararlı (dims, dimMeta, oyuncu)', () => {
    const sv = richSave(21);
    const text = JSON.stringify(sv);
    const r = deserializeGame(text);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.game.player.dim).toBe('neon');
    const state = {
      seed: r.game.seed,
      mode: 'macera',
      name: r.game.name,
      dim: r.game.player.dim,
      dimMeta: r.game.dimMeta,
      dims: r.game.dims,
      player: { pos: r.game.player.pos, yaw: r.game.player.yaw, pitch: r.game.player.pitch },
      world: { edits: new Map(), yMin: -400, yMax: 362, rawSeed: r.game.seed, mode: 'macera' },
      savedAt: r.game.savedAt,
      createdAt: r.game.createdAt,
    };
    const sv2 = serializeGame(state);
    expect(canon(sv2.dims)).toBe(canon(sv.dims));
    expect(canon(sv2.dimMeta)).toBe(canon(sv.dimMeta));
    expect(sv2.player.dim).toBe('neon');
    expect(canon(deserializeGame(JSON.stringify(sv2)).game.dims)).toBe(canon(r.game.dims));
  });

  it('1500 yapısal bozma (üst düzey, player, dimMeta, dims…): asla atmaz, ok ise tüm değişmezler', () => {
    const rng = rngOf(0xfee1);
    const base = richSave(22);
    for (let i = 0; i < 1500 * MUL; i++) {
      let raw = clone(base);
      const k = rng.int(1, 5);
      for (let m = 0; m < k; m++) raw = mutate(rng, raw);
      T.saves++;
      let r;
      r = callSafe(() => deserializeGame(raw), 'deserializeGame#' + i);
      checkGame(r, 'save#' + i);
    }
    protoClean();
  });

  it('1000 JSON metin bozması: rastgele kesme (her bayt konumu), silme, ekleme: atmaz; kesik metin ok:false', () => {
    const rng = rngOf(0x7e57);
    const text = JSON.stringify(richSave(23));
    // 200 kesme noktası: kesik JSON asla ok olmaz (kapanış yok)
    for (let i = 0; i < 200; i++) {
      const cut = rng.int(1, text.length - 2);
      let r;
      expect(() => { r = deserializeGame(text.slice(0, cut)); }).not.toThrow();
      expect(r.ok, 'kesik@' + cut).toBe(false);
    }
    const junk = ['null', '"x"', '{}', '[]', '-1', '1e999', '"__proto__"', '99999999999', 'true', '{"a":1}', '"neon"', '0', '1e-400', '[[[[[[[[[[]]]]]]]]]]'];
    for (let it = 0; it < 800 * MUL; it++) {
      let t = text;
      const muts = rng.int(1, 4);
      for (let m = 0; m < muts; m++) {
        const kind = rng.int(0, 2);
        const pos = rng.int(0, t.length - 1);
        if (kind === 0) {
          const re = /[:[,]("[^"]*"|-?[0-9.e+]+|true|false|null)/g;
          re.lastIndex = pos;
          const mm = re.exec(t);
          if (mm) t = t.slice(0, mm.index + 1) + junk[rng.int(0, junk.length - 1)] + t.slice(mm.index + mm[0].length);
        } else if (kind === 1) t = t.slice(0, pos) + t.slice(pos + rng.int(1, 9));
        else t = t.slice(0, pos) + junk[rng.int(0, junk.length - 1)] + t.slice(pos);
      }
      let r;
      expect(() => { r = deserializeGame(t); }).not.toThrow();
      T.saves++;
      checkGame(r, 'metin#' + it);
    }
    protoClean();
  });

  it('eski sürümler: v0/v1/v2 bozulmuş kayıtlar göç eder ya da açık kodla reddedilir (atmaz); v1 macera "oldworld"', () => {
    const rng = rngOf(0x01d);
    const v2 = v2Save();
    const v1 = Object.assign({}, v2, { v: 1 });
    const v0 = { mode: 'macera', seed: 4242, pos: [1, 70, 2], yaw: 1, pitch: 0.2, hp: 15, hunger: 18, inv: null, edits: { '3,70,4': 3 } };
    expect(deserializeGame(v1).code).toBe('oldworld');
    expect(deserializeGame(Object.assign({}, v0, { v: undefined })).code).toBe('oldworld');
    expect(deserializeGame(Object.assign({}, v1, { mode: 'insa' })).ok).toBe(true);
    expect(deserializeGame(Object.assign({}, v2)).ok).toBe(true);
    expect(deserializeGame(Object.assign({}, v2, { v: 4 })).code).toBe('newer');
    expect(deserializeGame(Object.assign({}, v2, { v: 2 ** 40 })).code).toBe('newer');
    expect(migrateSave(null).ok).toBe(false);
    for (let i = 0; i < 1200 * MUL; i++) {
      const base = [v0, v1, v2, Object.assign({}, v1, { mode: 'insa' }), Object.assign({}, v2, { mode: 'harita' })][i % 5];
      let raw = clone(base);
      for (let m = rng.int(1, 4); m > 0; m--) raw = mutate(rng, raw);
      if (i % 7 === 0 && raw && typeof raw === 'object') raw.v = rng.pick([0, 1, 2, 3, 4, -1, 1.5, NaN, '2', null, 2 ** 31, Infinity]);
      let r;
      r = callSafe(() => deserializeGame(raw), 'eski deserialize#' + i);
      callSafe(() => migrateSave(raw), 'migrateSave#' + i);
      T.saves++;
      checkGame(r, 'eski#' + i);
    }
    protoClean();
  });

  it('insa/harita kaydına gömülü dims/dimMeta yok sayılır (boyut alanı yalnız macera)', () => {
    const sv = clone(richSave(24));
    ['insa', 'harita'].forEach((mode) => {
      const r = deserializeGame(Object.assign({}, sv, { mode }));
      if (r.ok) {
        expect(r.game.dims).toEqual({});
        expect(r.game.player.dim === undefined || r.game.player.dim === 'overworld').toBe(true);
      }
    });
  });

  it('toplam: fuzz gerçekten çalıştı (yeterli ok ve reddedilen kayıt, yeterli şehir/neon örneği)', () => {
    if (MUL < 1) return;
    expect(T.saves).toBeGreaterThan(3000);
    expect(T.saveOk).toBeGreaterThan(500);
    expect(T.saveFail).toBeGreaterThan(100);
    expect(T.city).toBeGreaterThan(4000);
    expect(T.neon).toBeGreaterThan(1500);
    protoClean();
  });
});

/* ------------------------------------------------------------------------------------------------
 * 4) bulut zarfı (kırpma) fuzz'ı
 * ---------------------------------------------------------------------------------------------- */
describe('qa5 kayıt fuzz — bulut zarfı: rastgele sınırlarda kırpma', () => {
  it('300 rastgele (kayıt, sınır): atmaz, girdi DEĞİŞMEZ, sığarsa boyut ≤ sınır, kırpma sırası (neon → overworld), payload yeniden yüklenir ve güvenli', () => {
    const rng = rngOf(0xe17);
    const names = ['neon:npcs', 'neon:vehicles', 'neon:entities', 'neon:props'];
    let okN = 0;
    let truncN = 0;
    for (let i = 0; i < 300 * MUL; i++) {
      const ow = new Map();
      for (let k = 0; k < rng.int(0, 400); k++) ow.set(rng.int(-200, 200) + ',' + rng.int(40, 120) + ',' + rng.int(-200, 200), B.STONE);
      const neon = bigNeon({ edits: scatterEdits(rng.int(0, 60), rng.int(1, 120), 100 + i) });
      const sv = serializeGame(baseState({
        world: fakeWorld(ow),
        dim: rng.chance(0.4) ? 'neon' : 'overworld',
        dims: { neon },
        chests: new Map([['1,64,1', [{ item: 'blok:taş', count: 3 }]]]),
        player: { pos: [rng.int(-300, 300), 70, rng.int(-300, 300)], yaw: 0, pitch: 0 },
      }));
      const before = JSON.stringify(sv);
      const maxBytes = rng.chance(0.15) ? 1500000 : rng.int(1500, 400000);
      let env;
      env = callSafe(() => buildCloudEnvelope(sv, { maxBytes }), 'envelope#' + i);
      expect(JSON.stringify(sv), 'girdi değişmemeli #' + i).toBe(before);
      expect(typeof env.ok).toBe('boolean');
      if (!env.ok) {
        expect(['too_large', 'format']).toContain(env.code);
        continue;
      }
      okN++;
      expect(env.bytes, 'sınır #' + i).toBeLessThanOrEqual(maxBytes - CLOUD_MARGIN);
      expect(env.payload.length).toBeGreaterThan(100);
      if (env.stripped.length > 0) {
        truncN++;
        expect(env.truncated).toBe(true);
        expect(env.save.truncated).toBe(true);
        // sıra: neon aşamaları overworld aşamalarından ÖNCE; neon aşama sırası sabit
        const firstOw = env.stripped.findIndex((n) => n.indexOf('neon:') !== 0);
        if (firstOw >= 0) expect(env.stripped.slice(0, firstOw).length, 'neon önce #' + i).toBeGreaterThan(0);
        const idx = env.stripped.filter((n) => names.indexOf(n) >= 0).map((n) => names.indexOf(n));
        expect(idx).toEqual(idx.slice().sort((a, b) => a - b));
        // overworld düzenlemeleri neon kırpılırken korunur
        if (env.stripped.every((n) => n.indexOf('neon:') === 0)) {
          expect(env.save.edits).toEqual(sv.edits);
          expect(env.save.chests).toEqual(sv.chests);
        }
      }
      // gerçek yük: açılır, yüklenir, güvenli
      const opened = openCloudEnvelope(env.payload);
      expect(opened).toBeTruthy();
      const r = callSafe(() => deserializeGame(env.payload), 'yükle#' + i);
      expect(r.ok, 'kırpılmış kayıt yüklenebilmeli #' + i + ' ' + (r.error || '')).toBe(true);
      safeOut(r.game.dims, 'zarf dims#' + i);
      expect(r.game.truncated).toBe(env.stripped.length > 0);
    }
    expect(okN).toBeGreaterThan(100);
    expect(truncN).toBeGreaterThan(20);
    protoClean();
  });

  it('openCloudEnvelope düşmanca gövdeler: atmaz; yalnız kayıt nesnesi ya da {save} döner', () => {
    const rng = rngOf(0xe18);
    for (let i = 0; i < 1500; i++) {
      const v = chaos(rng, 4);
      let r;
      expect(() => { r = openCloudEnvelope(rng.chance(0.3) ? JSON.stringify(v) : v); }).not.toThrow();
      expect(r === null || (r && typeof r === 'object' && !Array.isArray(r))).toBe(true);
    }
    ['', '{', 'null', '[]', '5', '{"save":5}', '{"save":{"v":3},"v":3}', '{"v":3}'].forEach((t) => expect(() => openCloudEnvelope(t)).not.toThrow());
    expect(openCloudEnvelope('{"save":{"v":3,"mode":"macera"}}')).toEqual({ v: 3, mode: 'macera' });
    expect(openCloudEnvelope('{"v":3}')).toEqual({ v: 3 });
    expect(openCloudEnvelope('{"save":5}')).toBeNull();
  });
});
