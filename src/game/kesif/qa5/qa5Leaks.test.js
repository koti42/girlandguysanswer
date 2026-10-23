/*
 * qa5 (Faz 5, qa_logic) — SIZINTI + BOYUT DEĞİŞİMİ ATOMİKLİĞİ (sahte renderer, TÜM şehir sistemleriyle: cityLocks, vehicles, traffic, crowd, cityNpc,
 * cityMissions, cityDiscovery, cityApi, cityHud, cityPhoto + temel sistemler):
 *   - 1000 şehre-gir/çık döngüsü (2000 swap): dünya dinleyici sayıları, kayıt kancaları, sistem kaydı, sahne kökleri, canlı chunk yöneticileri, işçi
 *     havuzları, ZAMANLAYICILAR (setTimeout/setInterval) ilk ısınma noktasına göre BÜYÜMEZ; eski dünyaya erişim (retire tripwire FIRLATIR) 0;
 *   - özellik testi: rastgele işlem dizisinde (swap, kare, ışınlanma, kayıt, kayıt parçaları) her swap sonrası DIM_BOUND_FIELDS tek bağlamla tutarlı,
 *     G.world, chunkManager.world, em, tech aynı bağlam (yarım atama yok), G.world emekli değil;
 *   - dispose: hiçbir chunk yöneticisi/havuz canlı kalmaz.
 * Ortam: KESIF_QA5_CYCLES (vars. 1000).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  afterAll, beforeAll, describe, expect, it, vi,
} from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { DIM_BOUND_FIELDS } from '../gameDimension.js';
import { seededRandom } from '../sim/rng.js';
import { createSystem as cityLocks } from '../systems/cityLocks.js';
import { createSystem as vehicles } from '../systems/vehicles.js';
import { createSystem as traffic } from '../systems/traffic.js';
import { createSystem as crowd } from '../systems/crowd.js';
import { createSystem as cityNpc } from '../systems/cityNpc.js';
import { createSystem as cityMissions } from '../systems/cityMissions.js';
import { createSystem as cityDiscovery } from '../systems/cityDiscovery.js';
import { createSystem as cityApi } from '../systems/cityApi.js';
import { createSystem as cityHud } from '../systems/cityHud.js';
import { createSystem as cityPhoto } from '../systems/cityPhoto.js';
import { standardSystemFiles } from '../gameSystems.js';

vi.setConfig({ testTimeout: 1800000 });

const ENV = (globalThis.process && globalThis.process.env) || {};
const CYCLES = Number(ENV.KESIF_QA5_CYCLES || 1000);

/* ---- zamanlayıcı sayacı (yalnız bu dosyanın testleri süresince) ---- */
const live = new Map();
const orig = {};
function patchTimers() {
  ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'].forEach((n) => { orig[n] = globalThis[n]; });
  globalThis.setTimeout = (fn, ms, ...a) => {
    const h = orig.setTimeout(() => { live.delete(h); fn(...a); }, ms);
    live.set(h, 'timeout');
    return h;
  };
  globalThis.setInterval = (fn, ms, ...a) => {
    const h = orig.setInterval(fn, ms, ...a);
    live.set(h, 'interval');
    return h;
  };
  globalThis.clearTimeout = (h) => { live.delete(h); return orig.clearTimeout(h); };
  globalThis.clearInterval = (h) => { live.delete(h); return orig.clearInterval(h); };
}
function unpatchTimers() {
  Object.keys(orig).forEach((n) => { globalThis[n] = orig[n]; });
}
beforeAll(patchTimers);
afterAll(unpatchTimers);

function boot() {
  const k = makeDimG({ render: true, systems: ['blocks', 'tech', 'magic', 'treefall', 'content', 'props', 'mobs', 'dimension'] });
  const { G } = k;
  const names = [];
  [['cityLocks', cityLocks], ['vehicles', vehicles], ['traffic', traffic], ['crowd', crowd], ['cityNpc', cityNpc], ['cityMissions', cityMissions],
    ['cityDiscovery', cityDiscovery], ['cityApi', cityApi], ['cityHud', cityHud], ['cityPhoto', cityPhoto]].forEach(([n, f]) => {
    const s = f(G);
    G.addSystem(s);
    if (typeof s.init === 'function') s.init(G);
    names.push(n);
  });
  return { k, names };
}

function listenerTotals(w) {
  const out = {};
  Object.keys(w._listeners).forEach((x) => { out[x] = w._listeners[x].length; });
  return JSON.stringify(out);
}

function snapshot(k) {
  const { G, mgr } = k;
  const ow = mgr.get('overworld');
  const ne = mgr.get('neon');
  return {
    owListeners: listenerTotals(ow.world),
    neListeners: ne ? listenerTotals(ne.world) : '',
    saveHooks: G.saveHooks.length,
    systems: G.registry.list().length,
    sceneRoots: G.scene.children.length,
    liveManagers: k.cms.filter((m) => !m.disposed).length,
    livePools: k.cms.filter((m) => m.pool && !m.pool.disposed).length,
    timers: live.size,
  };
}

/** Şehir sistemleri swap'ın İÇİNDE kendi örneklerini kurar (crowd, vehicles, props, colliders, puzzles, spawner): bu alanlar yönetici bağlamıyla birebir aynı olmak zorunda değildir. */
const SYSTEM_OWNED = ['crowd', 'vehicles', 'props', 'colliders', 'puzzles', 'spawner', 'spawn'];

/** strict: swap'tan HEMEN sonra (kare koşmadan) yönetici tarafından atanan alanların tamamı yeni bağlamla aynı; sistem sahipli alanlar dışlanır. */
function assertBound(k, label, strict) {
  const { G, mgr } = k;
  const c = mgr.get(G.dim);
  if (strict) {
    DIM_BOUND_FIELDS.filter((f) => SYSTEM_OWNED.indexOf(f) < 0).forEach((f) => {
      const v = c[f] === undefined ? null : c[f];
      expect(G[f] === v, label + ' alan ' + f + ' bağlam ' + G.dim).toBe(true);
    });
  }
  expect(G.world.dim, label).toBe(G.dim);
  expect(G.world.retired, label).toBeFalsy();
  expect(G.chunkManager.world === G.world, label + ' chunkManager.world').toBe(true);
  expect(G.chunkManager.disposed, label + ' chunkManager canlı').toBeFalsy();
  expect(mgr.stats.staleWorldHits, label + ' bayat dünya erişimi').toBe(0);
}

describe('qa5 sızıntı — kayıt: tüm şehir sistemleri kayıtlı ve sıraları benzersiz', () => {
  it('standart sistem dosyaları (gameSystems) şehir sistemlerinin tamamını içerir; sıra benzersiz; hepsi onDimension tanımlar', () => {
    const files = standardSystemFiles();
    ['cityLocks', 'cityHud', 'vehicles', 'vehicleAudio', 'vehicleUi', 'vehicleVisual', 'traffic', 'cityNpc', 'crowd', 'crowdVisual', 'cityMissions', 'cityPhoto', 'cityDiscovery', 'cityApi']
      .forEach((n) => expect(files, n).toContain('./systems/' + n + '.js'));
    const { k, names } = boot();
    expect(names).toHaveLength(10);
    const orders = k.G.registry.list().map((s) => s.order).filter((o) => typeof o === 'number');
    expect(new Set(orders).size).toBe(orders.length);
    ['cityLocks', 'vehicles', 'traffic', 'crowd', 'cityNpc', 'cityMissions', 'cityDiscovery', 'cityApi', 'cityHud', 'cityPhoto'].forEach((n) => {
      const s = k.G.registry.get(n);
      expect(s, n).toBeTruthy();
      expect(typeof s.onDimension, n + '.onDimension').toBe('function');
    });
    // statik: gameSystems'e yüklenen HER sistem dosyası onDimension tanımlar (sözleşme §18.5: yeni sistem için zorunlu)
    const missing = files.filter((f) => f !== './systems/session.js').filter((f) => !/onDimension\s*(\(|:)/.test(readFileSync(fileURLToPath(new URL('..' + f.slice(1), import.meta.url)), 'utf8')));
    expect(missing).toEqual([]);
  });
});

describe('qa5 boyut değişimi — atomiklik (özellik testi, rastgele işlem dizileri)', () => {
  [1, 2, 3].forEach((seed) => {
    it('tohum ' + seed + ': 250 rastgele işlem (swap/kare/ışınlanma/kayıt/kayıt parçası): her adımda bağlam tutarlı, bayat dünya 0', () => {
      const rng = seededRandom(0xa70 + seed);
      const { k } = boot();
      const { G, mgr } = k;
      k.frame(1 / 60, 20);
      assertBound(k, 'başlangıç');
      expect(mgr.swap('neon', { reason: 'debug' }).ok).toBe(true);
      assertBound(k, 'ilk swap', true);
      for (let i = 0; i < 250; i++) {
        const op = rng.int(0, 9);
        const label = 'op#' + i + ' (' + op + ')';
        if (op <= 3) {
          const to = rng.chance(0.2) ? G.dim : (G.dim === 'neon' ? 'overworld' : 'neon');
          const r = mgr.swap(to, { reason: rng.pick(['debug', 'terminal', 'gate', 'death']) });
          expect(typeof r.ok).toBe('boolean');
          assertBound(k, label + ' swap sonrası', true);
        } else if (op <= 6) k.frame(1 / 60, rng.int(1, 40));
        else if (op === 7) {
          if (G.dim === 'neon') {
            const x = rng.int(-300, 300);
            const z = rng.int(-300, 300);
            for (let cx = Math.floor((x - 48) / 16); cx <= Math.floor((x + 48) / 16); cx++) for (let cz = Math.floor((z - 48) / 16); cz <= Math.floor((z + 48) / 16); cz++) G.world.ensureChunk(cx, cz);
            k.place(x, 64, z, rng.next() * 6);
          }
        } else if (op === 8) G.requestSave('qa5');
        else {
          const parts = mgr.saveParts();
          expect(parts.dim === 'overworld' || parts.dim === 'neon').toBe(true);
          expect(JSON.parse(JSON.stringify(parts.dims || {}))).toBeTruthy();
        }
        assertBound(k, label);
      }
      k.frame(1 / 60, 300);
      assertBound(k, 'son');
      mgr.dispose();
      expect(k.cms.filter((m) => !m.disposed && m !== G.chunkManager).length).toBe(0);
    });
  });
});

describe('qa5 sızıntı — olumsuz kontrol: denetimin kendisi çalışıyor', () => {
  it('her boyut değişiminde dinleyici + zamanlayıcı sızdıran SENTETİK sistem anlık görüntüyü bozar (sızıntı denetimi kördeğil)', () => {
    const { k } = boot();
    const { G, mgr } = k;
    G.addSystem({
      name: 'sizdiran',
      order: 801,
      onDimension() {
        G.world.on('blockChange', () => {});
        setInterval(() => {}, 1e6);
      },
    });
    k.frame(1 / 60, 5);
    mgr.swap('neon', { reason: 'debug' });
    mgr.swap('overworld', { reason: 'debug' });
    const a = snapshot(k);
    for (let i = 0; i < 6; i++) {
      mgr.swap('neon', { reason: 'debug' });
      mgr.swap('overworld', { reason: 'debug' });
    }
    const b = snapshot(k);
    expect(b.timers).toBeGreaterThan(a.timers);
    expect(b.owListeners === a.owListeners && b.neListeners === a.neListeners).toBe(false);
    live.forEach((v, h) => { if (v === 'interval') { globalThis.clearInterval(h); } });
  });
});

describe('qa5 sızıntı — 1000 şehre-gir/çık döngüsü', () => {
  it(CYCLES + ' döngü (2×swap + kare): dinleyici, kanca, sistem, sahne kökü, chunk yöneticisi, havuz, zamanlayıcı sayıları ısınma noktasında kalır; bayat dünya 0', () => {
    const { k } = boot();
    const { G, mgr } = k;
    k.frame(1 / 60, 10);
    const warm = 30;
    let base = null;
    for (let i = 0; i < CYCLES; i++) {
      expect(mgr.swap('neon', { reason: 'debug' }).ok).toBe(true);
      if (i % 100 === 0) assertBound(k, 'döngü ' + i + ' şehir', true);
      k.frame(1 / 60, 2);
      expect(mgr.swap('overworld', { reason: 'terminal' }).ok).toBe(true);
      if (i % 100 === 0) assertBound(k, 'döngü ' + i + ' ana diyar', true);
      k.frame(1 / 60, 1);
      if (i === warm) base = snapshot(k);
      if (i > warm && i % 200 === 0) expect(snapshot(k), 'döngü ' + i).toEqual(base);
    }
    const end = snapshot(k);
    expect(end).toEqual(base);
    assertBound(k, 'döngü sonu');
    expect(G.dim).toBe('overworld');
    expect(mgr.stats.staleWorldHits).toBe(0);
    // sistem durumu: hâlâ çalışıyor
    k.frame(1 / 60, 200);
    mgr.swap('neon', { reason: 'debug' });
    k.frame(1 / 60, 200);
    assertBound(k, 'son şehir');
    mgr.dispose();
    expect(k.cms.filter((m) => !m.disposed && m !== G.chunkManager).length).toBe(0);
  });
});
