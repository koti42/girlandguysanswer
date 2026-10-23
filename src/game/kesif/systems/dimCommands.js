/*
 * KEŞİF — boyut hata ayıklama komutları (api.command; yalnız ?debug=1 / dev). Sözleşme §5 "Debug".
 *
 *   dim [neon|overworld]        anlık boyut değiştirir (geçiş makinesi YOK; maliyetsiz). Argümansız: bulunulan boyut
 *   dimhop <n> [min] [max] [lead]   n geçiş (gerçek geçiş makinesi, ücretsiz) — her geçiş arası min..max sn (varsayılan 0..3) rastgele (tohumlu) bekler;
 *                               lead sn (varsayılan 2): varış önceden hazırlanır (kapı açılışı taklidi); 0 = soğuk geçiş
 *   dimstat                     boyut/geçiş/bellek özeti (stale=0, dinleyici sayıları, geometri, işçi, yığın, hop p95)
 *   tpd <bölge|terminal no>     şehirde bölge merkezine ('merkez','gece_pazari','liman','teknoloji','tepe','konteyner') ya da terminal numarasına (0–15) ışınlar
 *   props                       prop katmanı özeti
 *   givegate                    Portal Tabancası + yetenek + Kuantum Çekirdeği + 3 Enerji Hücresi
 *   nocost [on|off]             kapı maliyeti, kalibrasyon ve bekleme süreleri kapalı
 *   (time zaten var: şehirde saat/faz: time gece | time 0.75 | time freeze)
 */
import { registerCommand } from './sessionCommands.js';
import { CELL_ITEM, CORE_ITEM } from '../sim/dim/travel.js';
import { PORTAL_GUN_ITEM } from '../sim/techData.js';
import { chargeInventory } from '../sim/techCharge.js';
import { mulberry32 } from '../sim/rng.js';
import { getCityPlan } from '../sim/city/cityPlan.js';

const ok = (message, data) => ({ ok: true, message, data });
const err = (message) => ({ ok: false, message });

function p95(list) {
  if (list.length === 0) return 0;
  const a = list.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
}

function listenerCounts(world) {
  const out = {};
  if (!world || !world._listeners) return out;
  Object.keys(world._listeners).forEach((k) => { out[k] = world._listeners[k].length; });
  return out;
}

export function dimStat(G, sys) {
  const mgr = G.dimMgr;
  const tr = G.transition;
  const ctxO = mgr ? mgr.get('overworld') : null;
  const ctxN = mgr ? mgr.get('neon') : null;
  const info = G.renderer && G.renderer.info ? G.renderer.info : null;
  let heap = null;
  try {
    if (typeof performance !== 'undefined' && performance.memory) heap = performance.memory.usedJSHeapSize;
  } catch {
    heap = null;
  }
  const hops = sys ? sys.hopMs : [];
  return {
    dim: G.dim,
    swaps: mgr ? mgr.stats.swaps : 0,
    hops: mgr ? mgr.stats.hops : 0,
    stageMs: mgr ? mgr.stats.stageMs : null,
    hookMs: mgr ? mgr.stats.hookMs : null,
    prewarms: mgr ? mgr.stats.prewarms : 0,
    prewarmAborts: mgr ? mgr.stats.prewarmAborts : 0,
    staleWorldHits: mgr ? mgr.stats.staleWorldHits : 0,
    lastSwapMs: mgr ? Math.round(mgr.stats.lastSwapMs * 10) / 10 : 0,
    transition: tr ? tr.info : null,
    gate: G.dimGate ? G.dimGate.info() : null,
    portalMode: G.portalMode || 'normal',
    chunks: { overworld: ctxO && ctxO.world ? ctxO.world.chunkCount : 0, neon: ctxN && ctxN.world ? ctxN.world.chunkCount : 0 },
    listeners: { overworld: listenerCounts(ctxO && ctxO.world), neon: listenerCounts(ctxN && ctxN.world) },
    geometries: info ? info.memory.geometries : null,
    textures: info ? info.memory.textures : null,
    workers: G.chunkManager && typeof G.chunkManager.info === 'function' ? G.chunkManager.info().workers : null,
    heap,
    hopCount: hops.length,
    hopMsP95: Math.round(p95(hops)),
    hopMsMax: hops.length ? Math.round(Math.max.apply(null, hops)) : 0,
    autosaves: G.dimAutosaves || 0,
    cityKredi: ctxN && ctxN.city ? ctxN.city.kredi : 0,
    terminalsFound: ctxN ? ctxN.terminals.found : 0,
    calibrated: mgr ? mgr.dimMeta.calibrated : false,
  };
}

export function installDimCommands(G, sys) {
  registerCommand('dim', 'dim [neon|overworld]', (g, a) => {
    const mgr = g.dimMgr;
    if (!mgr) return err('Boyut yöneticisi yok.');
    if (!a[0]) return ok('Boyut: ' + g.dim, { dim: g.dim });
    const to = a[0].toLowerCase() === 'neon' ? 'neon' : a[0].toLowerCase() === 'overworld' || a[0] === 'ana' ? 'overworld' : null;
    if (!to) return err('Kullanım: dim [neon|overworld]');
    if (g.transition && g.transition.active) return err('Boyut geçişi sürüyor.');
    if (to === g.dim) return ok('Zaten ' + to + '.', { dim: g.dim });
    const r = mgr.swap(to, { reason: 'debug' });
    return r.ok ? ok('Boyut: ' + to, { dim: to, pos: r.pos }) : err('Geçiş başarısız: ' + r.reason);
  });

  registerCommand('dimhop', 'dimhop <n> [min] [max] [lead]', (g, a) => {
    const n = Math.max(0, Math.min(500, Math.floor(Number(a[0]))));
    if (!(n > 0)) return err('Kullanım: dimhop <n> [min] [max]');
    const lo = Number.isFinite(Number(a[1])) ? Math.max(0, Number(a[1])) : 0;
    const hi = Number.isFinite(Number(a[2])) ? Math.max(lo, Number(a[2])) : Math.max(lo, 3);
    const lead = Number.isFinite(Number(a[3])) ? Math.max(0, Number(a[3])) : 2;
    sys.hopRun = {
      remaining: n, lo, hi, lead, nextAt: 0, armedFor: null, armedAt: 0, rng: mulberry32(0x4d455244 ^ n), started: 0,
    };
    return ok(n + ' geçiş sıraya alındı (' + lo + '–' + hi + ' sn bekleme).', { remaining: n });
  });

  registerCommand('dimstat', 'dimstat', (g) => ok('Boyut özeti hazır.', dimStat(g, sys)));

  registerCommand('tpd', 'tpd <merkez|gece_pazari|liman|teknoloji|tepe|konteyner|0..15>', (g, a) => {
    const mgr = g.dimMgr;
    if (!mgr || g.dim !== 'neon') return err('tpd yalnızca Neon Meridyen\'de çalışır.');
    const ctx = mgr.get('neon');
    const list = ctx.terminals.list;
    if (!list) return err('Terminal listesi yok.');
    const KEYS = ['merkez', 'gece_pazari', 'liman', 'teknoloji', 'tepe', 'konteyner'];
    let idx = -1;
    const w = (a[0] || '').toLowerCase();
    if (/^\d+$/.test(w)) idx = Math.floor(Number(w));
    else if (KEYS.indexOf(w) >= 0) {
      // bölge adı → planın o bölgedeki terminali (merkez = 0, Kapı Meydanı); terminal.district alanı cityplan'dandır
      const plan = getCityPlan(ctx.world.seed);
      for (let i = 0; i < plan.terminals.length; i++) {
        const t = plan.terminals[i];
        if (t.district === w && (t.kind === 'district' || t.kind === 'plaza')) {
          idx = i;
          break;
        }
      }
    }
    if (!(idx >= 0 && idx < list.length)) return err('Kullanım: tpd <' + KEYS.join('|') + '|0..15>');
    const arr = mgr.arrivalFor('neon', { terminal: idx });
    const r = g.teleport(arr.x, arr.y, arr.z, { safe: true, maxR: 24, yaw: arr.yaw });
    return ok('Terminal ' + idx + ' önüne ışınlandın.', { terminal: idx, pos: r });
  });

  registerCommand('props', 'props', (g) => {
    const st = typeof g.propStats === 'function' ? g.propStats() : null;
    const pw = g.props;
    return ok('Prop özeti.', { dim: g.dim, renderer: st, loaded: pw && typeof pw.loadedCount === 'function' ? pw.loadedCount() : null });
  });

  registerCommand('givegate', 'givegate', (g) => {
    if (g.mode !== 'macera') return err('Yalnız macera modunda.');
    g.grantAbility('portalGun');
    g.inventory.add(PORTAL_GUN_ITEM, 1);
    g.inventory.add(CORE_ITEM, 1);
    g.inventory.add(CELL_ITEM, 3);
    chargeInventory(g.inventory, 1000);
    return ok('Portal Tabancası, Kuantum Çekirdeği ve 3 Enerji Hücresi verildi.');
  });

  registerCommand('nocost', 'nocost [on|off]', (g, a) => {
    if (!g.cheats) g.cheats = { god: false, fly: false };
    const v = (a[0] || '').toLowerCase();
    g.cheats.nocost = v === 'off' ? false : true;
    if (g.dimGate) g.dimGate.resetCooldown();
    return ok('Kapı maliyeti/beklemesi ' + (g.cheats.nocost ? 'kapalı' : 'açık') + '.', { nocost: g.cheats.nocost });
  });
}
