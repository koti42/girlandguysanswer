/*
 * qa5 (Faz 5, qa_logic) — YÜKLEME YOLU FUZZ'I (gerçek sistemlerle): oynanmış bir şehir oyunundan GERÇEK kayıt (buildSave: dims.neon + sistem durumları + ext) alınır,
 * ağaçta rastgele bozulur (sil / tür değiştir / çöp / dev sayı / __proto__ / kesik dizi), yeni bir oyuna `restoreFromSave` + sistem geri yüklemesi + şehre açılış
 * (startIn) uygulanır ve 150 kare koşulur. Değişmezler: yükleme ASLA atmaz; ok ise gövde konumu/hayat sonlu, dünya bağlı (G.world dim ile tutarlı),
 * bayat dünya erişimi 0, ikinci kayıt (buildSave) alınabilir ve yeniden yüklenir (gidiş-dönüş çökmez).
 * Ortam: KESIF_QA5_LOAD (iterasyon sayısı, vars. 24), KESIF_QA5_SEED.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
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
import { buildSave, restoreFromSave } from '../systems/sessionSave.js';
import { callSafe, nonFinitePath } from './qa5Kit.js';

vi.setConfig({ testTimeout: 1800000 });

const ENV = (globalThis.process && globalThis.process.env) || {};
const N = Number(ENV.KESIF_QA5_LOAD || 24);
const SEED_OFF = Number(ENV.KESIF_QA5_SEED || 0) * 7919;

function boot() {
  const k = makeDimG({ render: true, systems: ['blocks', 'tech', 'magic', 'treefall', 'content', 'props', 'mobs', 'dimension'] });
  const { G } = k;
  [cityLocks, vehicles, traffic, crowd, cityNpc, cityMissions, cityDiscovery, cityApi, cityHud].forEach((f) => {
    const s = f(G);
    G.addSystem(s);
    if (typeof s.init === 'function') s.init(G);
  });
  return k;
}

function defineOwn(o, key, v) {
  Object.defineProperty(o, key, {
    value: v, enumerable: true, configurable: true, writable: true,
  });
}

const HOSTILE = [null, true, false, 0, -1, 1, 0.5, 2 ** 31, 1e308, -1e308, '', 'x', '😀', '__proto__', [], {}, [1, 2], { a: 1 }, 99, 255, 256];

function walk(node, p, out, depth) {
  if (depth > 7 || !node || typeof node !== 'object') return out;
  Object.keys(node).forEach((k) => { out.push(p.concat([k])); walk(node[k], p.concat([k]), out, depth + 1); });
  return out;
}

function mutate(rng, root) {
  const ps = walk(root, [], [], 0).filter((p) => p[0] !== 'edits'); // düzenleme dizgeleri başka testlerde (qa5SaveFuzz) bozulur; burada yapı
  if (ps.length === 0) return root;
  const p = rng.pick(ps);
  let par = root;
  for (let j = 0; j < p.length - 1; j++) par = par[p[j]];
  const key = p[p.length - 1];
  const cur = par[key];
  const op = rng.int(0, 8);
  if (op === 0) delete par[key];
  else if (op === 1) par[key] = rng.pick(HOSTILE);
  else if (op === 2 && Array.isArray(cur)) par[key] = cur.slice(0, rng.int(0, cur.length));
  else if (op === 3 && typeof cur === 'number') par[key] = cur * rng.pick([-1, 1e9, 1e-9, 2 ** 40, 0.5, NaN]);
  else if (op === 4 && cur && typeof cur === 'object' && !Array.isArray(cur)) defineOwn(cur, rng.pick(['__proto__', 'constructor', 'toString', 'hasOwnProperty']), rng.pick(HOSTILE));
  else if (op === 5 && typeof cur === 'string') par[key] = cur + rng.pick(['\u0000', '😀', 'x'.repeat(300), '../']);
  else if (op === 6) par[key] = typeof cur === 'object' && cur !== null ? [] : {};
  else par[key] = rng.pick(HOSTILE);
  return root;
}

/** Şehirde 150 kare oynanmış, bir terminal bulunmuş, çip/keşif/kredi içeren gerçek kayıt. */
function playedSave(inCity) {
  const k = boot();
  const { G, mgr } = k;
  k.frame(1 / 60, 30);
  mgr.swap('neon', { reason: 'debug' });
  const w = G.world;
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) w.ensureChunk(cx, cz);
  k.place(8.5, 64, 6.5, 0);
  k.frame(1 / 60, 150);
  const c = mgr.get('neon').city || (mgr.get('neon').city = { v: 1 });
  c.kredi = 345;
  c.claims = { firstjob: 1 };
  c.stats = { citySeconds: 77 };
  mgr.markTerminal(3);
  if (!inCity) mgr.swap('overworld', { reason: 'terminal' });
  k.frame(1 / 60, 20);
  const save = buildSave(G, { name: 'qa5', createdAt: 1, now: 2 });
  return JSON.parse(JSON.stringify(save));
}

function loadInto(save) {
  const k = boot();
  const { G, mgr } = k;
  const res = callSafe(() => restoreFromSave(G, save), 'restoreFromSave');
  if (!res.ok) return { k, res, applied: false };
  callSafe(() => {
    if (res.systems) G.registry.restore(G, res.systems, (sys, fn) => { try { return fn(); } catch { return undefined; } });
    if (G.dimBoot) {
      const boot0 = G.dimBoot;
      G.dimBoot = null;
      mgr.startIn(boot0.dim, boot0.arrival);
    }
  }, 'sistem geri yükleme / startIn');
  return { k, res, applied: true };
}

describe('qa5 yükleme fuzz — gerçek sistemlerle', () => {
  it('düzgün kayıtlar (şehirde ve ana diyarda kaydedilmiş) gidiş-dönüş yapar: yükle → 120 kare → yeniden kaydet → yeniden yükle', () => {
    [true, false].forEach((inCity) => {
      const save = playedSave(inCity);
      expect(save.player.dim).toBe(inCity ? 'neon' : 'overworld');
      expect(save.dims.neon).toBeTruthy();
      const a = loadInto(save);
      expect(a.res.ok).toBe(true);
      a.k.frame(1 / 60, 120);
      expect(a.k.G.dim).toBe(inCity ? 'neon' : 'overworld');
      expect(nonFinitePath({ x: a.k.G.body.x, y: a.k.G.body.y, z: a.k.G.body.z })).toBe('');
      const again = JSON.parse(JSON.stringify(buildSave(a.k.G, { name: 'qa5', createdAt: 1, now: 3 })));
      expect(again.dims.neon.city.kredi).toBe(345);
      expect(again.dims.neon.city.claims).toEqual({ firstjob: 1 });
      expect(again.dims.neon.terminals & 8).toBe(8);
      const b = loadInto(again);
      expect(b.res.ok).toBe(true);
      b.k.frame(1 / 60, 60);
      expect(b.k.mgr.stats.staleWorldHits).toBe(0);
    });
  });

  it(N + ' bozulmuş gerçek kayıt: yükleme/geri yükleme/şehre açılış/150 kare ASLA atmaz; ok ise durum sonlu ve tutarlı', () => {
    const bases = [playedSave(true), playedSave(false)];
    const rng = seededRandom(0x10ad + SEED_OFF);
    let okN = 0;
    let failN = 0;
    for (let i = 0; i < N; i++) {
      let raw = JSON.parse(JSON.stringify(bases[i % 2]));
      for (let m = rng.int(1, 5); m > 0; m--) raw = mutate(rng, raw);
      const label = 'yükleme#' + i;
      const { k, res, applied } = loadInto(raw);
      if (!res.ok || !applied) {
        failN++;
        expect(typeof res.code, label).toBe('string');
        continue;
      }
      okN++;
      callSafe(() => k.frame(1 / 60, 150), label + ' 150 kare');
      const { G, mgr } = k;
      expect(nonFinitePath({ x: G.body.x, y: G.body.y, z: G.body.z, hp: G.survival.hp, hunger: G.survival.hunger }), label + ' gövde/hayat').toBe('');
      expect(['overworld', 'neon']).toContain(G.dim);
      expect(G.world.dim, label).toBe(G.dim);
      expect(G.world.retired, label).toBeFalsy();
      expect(mgr.stats.staleWorldHits, label + ' bayat dünya').toBe(0);
      // yeniden kaydedilebilir ve tekrar yüklenebilir
      const s2 = callSafe(() => JSON.parse(JSON.stringify(buildSave(G, { name: 'qa5', createdAt: 1, now: 9 }))), label + ' yeniden kayıt');
      expect(nonFinitePath(s2.dims || {}), label + ' dims sonlu').toBe('');
      const again = loadInto(s2);
      expect(again.res.ok, label + ' yeniden yükleme ' + (again.res.error || '')).toBe(true);
    }
    if (ENV.KESIF_QA5_REPORT) console.log('yükleme fuzz: ok ' + okN + ', reddedilen ' + failN);
    expect(okN + failN).toBe(N);
    expect(okN).toBeGreaterThan(N * 0.4);
  });
});
