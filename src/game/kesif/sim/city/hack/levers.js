/*
 * KEŞİF sim/city/hack — "RENK KOLLARI" (bağlantılı kol mantık bulmacası; sözleşme §1.9, §8). SAF durum makinesi (three/DOM/Math.random/Date.now yok),
 * belirlenimci, serileştirilebilir, worker-güvenli.
 *
 * Kurallar: n kol, her kolun m konumu vardır (2: yukarı/aşağı, 3: yukarı/orta/aşağı; konum 1 adım ilerler ve başa sarar). Bir kolu çekmek o kolun
 * VE ona bağlı kolların konumunu 1 ilerletir (bağlantılar ekranda yazılıdır: tahmin değil çıkarım bulmacası). Amaç: tüm kolları HEDEF desene getirmek.
 * Üretim geriye doğrudur (hedefe rastgele çekmelerin tersi uygulanır) → HER bulmaca çözülebilir; `solveLevers` BFS ile en az hamleyi bulur.
 * Kademe 0-1: hamle sınırı ve süre YOK (zaman baskısı yok), sıfırlama serbest. Kademe 2: hamle bütçesi (sıfırlama çekmeleri de sayılır).
 * Kademe 3: bütçe + 90 sn süre (erişilebilirlik modunda süre ×2).
 *
 *   LEVER_STYLES    6 kol stili (renk + şekil + ad: renk körü ayrımı)
 *   leversSpec(seed, tier) → {kind, tier, n, m, cols:int[n][n], target, start, optimal, budget (Infinity|int), timeLimit (sn, 0 = yok)}
 *   createLevers({seed, tier, accessibility?}) / restoreLevers(saved)
 *   solveLevers(spec) → {moves:int[], optimal} | null
 * Makine: press(i) → 'ok'|'won'|'lost'|'ignored'   reset()   tick(dt)   view()   serialize()   status
 */
import { stream } from '../cityPlanKit.js';

export const LEVER_STYLES = Object.freeze([
  Object.freeze({ name: 'Kırmızı kol', color: '#ff4d6d', shape: 'ucgen' }),
  Object.freeze({ name: 'Mavi kol', color: '#3aa0ff', shape: 'daire' }),
  Object.freeze({ name: 'Yeşil kol', color: '#35d07f', shape: 'kare' }),
  Object.freeze({ name: 'Sarı kol', color: '#ffc933', shape: 'yildiz' }),
  Object.freeze({ name: 'Mor kol', color: '#b07cff', shape: 'besgen' }),
  Object.freeze({ name: 'Turuncu kol', color: '#ff8a3d', shape: 'altigen' }),
]);

export const POS_LABELS = Object.freeze({
  2: Object.freeze(['Yukarı', 'Aşağı']),
  3: Object.freeze(['Yukarı', 'Orta', 'Aşağı']),
});

/* n kol, m konum, extra: kol başına ek bağlantı, k: geriye doğru rastgele çekme sayısı, minOpt: en az hamle */
const TIERS = Object.freeze([
  Object.freeze({
    n: 3, m: 2, links: 1, k: 3, minOpt: 2, budgetMul: 0, budgetAdd: 0, timeLimit: 0,
  }),
  Object.freeze({
    n: 4, m: 2, links: 1, k: 4, minOpt: 3, budgetMul: 0, budgetAdd: 0, timeLimit: 0,
  }),
  Object.freeze({
    n: 4, m: 3, links: 1, k: 5, minOpt: 4, budgetMul: 3, budgetAdd: 6, timeLimit: 0,
  }),
  Object.freeze({
    n: 5, m: 3, links: 2, k: 6, minOpt: 5, budgetMul: 2, budgetAdd: 4, timeLimit: 90,
  }),
]);

const TAG_LEVERS = 0xd21;
const MAX_DT = 1;

function tierOf(t) {
  const n = Math.floor(Number(t));
  return n >= 0 && n <= 3 ? n : 0;
}

function seedOf(s) {
  const n = Number(s);
  return Number.isFinite(n) ? n | 0 : 0;
}

function apply(pos, col, m) {
  const out = pos.slice();
  for (let j = 0; j < out.length; j++) out[j] = (out[j] + col[j]) % m;
  return out;
}

function keyOf(pos) {
  return pos.join('');
}

/** BFS: start → target (kollar kümesi n^m ≤ 243 durum). */
export function solveLevers(spec) {
  const { m, cols, target } = spec;
  const start = spec.start;
  const tk = keyOf(target);
  const sk = keyOf(start);
  if (sk === tk) return { moves: [], optimal: 0 };
  const prev = new Map();
  prev.set(sk, null);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (let f = 0; f < frontier.length; f++) {
      const cur = frontier[f];
      const ck = keyOf(cur);
      for (let i = 0; i < cols.length; i++) {
        const nx = apply(cur, cols[i], m);
        const nk = keyOf(nx);
        if (prev.has(nk)) continue;
        prev.set(nk, { from: ck, move: i });
        if (nk === tk) {
          const moves = [];
          let at = nk;
          while (prev.get(at) !== null) {
            const p = prev.get(at);
            moves.push(p.move);
            at = p.from;
          }
          moves.reverse();
          return { moves, optimal: moves.length };
        }
        next.push(nx);
      }
    }
    frontier = next;
  }
  return null;
}

/** 24 denemede hiç uygun bulmaca çıkmazsa (olasılık ~0): hedefe tek çekme uzaklıkta sabit bulmaca. */
function fallbackSpec(k, T) {
  const cols = [];
  for (let i = 0; i < T.n; i++) {
    const c = new Array(T.n).fill(0);
    c[i] = 1;
    cols.push(c);
  }
  const target = new Array(T.n).fill(0);
  const start = target.slice();
  start[0] = T.m - 1;
  return {
    kind: 'levers', tier: k, n: T.n, m: T.m, cols, target, start, optimal: 1, budget: Infinity, timeLimit: T.timeLimit,
  };
}

export function leversSpec(seed, tier) {
  const k = tierOf(tier);
  const T = TIERS[k];
  const sd = seedOf(seed);
  let best = null;
  for (let salt = 0; salt < 24; salt++) {
    const st = stream(sd, k * 64 + salt + 1, TAG_LEVERS);
    const n = T.n;
    const m = T.m;
    // bağlantılar: kol i çekilince bağlı kollar da ilerler
    const cols = [];
    for (let i = 0; i < n; i++) {
      const c = new Array(n).fill(0);
      c[i] = 1;
      cols.push(c);
    }
    for (let i = 0; i < n; i++) {
      const cnt = T.links;
      for (let q = 0; q < cnt; q++) {
        if (k === 0 && i === n - 1) break; // kademe 0: son kol bağsız (çok kolay)
        let j = st.i(n - 1);
        if (j >= i) j++;
        cols[i][j] = 1;
      }
    }
    const target = [];
    for (let i = 0; i < n; i++) target.push(st.i(m));
    // geriye doğru: hedeften rastgele çekmelerin tersi
    let start = target.slice();
    for (let r = 0; r < T.k; r++) {
      const i = st.i(n);
      for (let j = 0; j < n; j++) start[j] = (((start[j] - cols[i][j]) % m) + m) % m;
    }
    const spec = {
      kind: 'levers', tier: k, n, m, cols, target, start, optimal: 0, budget: Infinity, timeLimit: T.timeLimit,
    };
    const sol = solveLevers(spec);
    if (!sol || sol.optimal < 1) continue; // başlangıç = hedef olamaz
    spec.optimal = sol.optimal;
    if (sol.optimal >= T.minOpt) {
      best = spec;
      break;
    }
    if (best === null || sol.optimal > best.optimal) best = spec;
  }
  if (best === null) best = fallbackSpec(k, T);
  best.budget = T.budgetMul > 0 ? best.optimal * T.budgetMul + T.budgetAdd : Infinity;
  return best;
}

function linkTextOf(spec, i) {
  const names = [];
  for (let j = 0; j < spec.n; j++) if (spec.cols[i][j] === 1) names.push(LEVER_STYLES[j].name);
  return LEVER_STYLES[i].name + ' çekilince şunlar bir adım ilerler: ' + names.join(', ') + '.';
}

export function createLevers(opts) {
  const o = opts || {};
  return build(seedOf(o.seed), tierOf(o.tier), !!o.accessibility, null);
}

function build(seed, tier, a11y, saved) {
  const spec = leversSpec(seed, tier);
  const timeLimit = spec.timeLimit * (a11y ? 2 : 1);
  const S = {
    pos: spec.start.slice(), used: 0, moves: 0, phase: 'run', timeLeft: timeLimit, reason: '', last: -1,
  };
  if (saved) {
    S.pos = saved.pos;
    S.used = saved.used;
    S.moves = saved.moves;
    S.phase = saved.phase;
    S.timeLeft = saved.timeLeft;
    S.reason = saved.reason;
    S.last = saved.last;
  }

  function isTarget() {
    for (let i = 0; i < spec.n; i++) if (S.pos[i] !== spec.target[i]) return false;
    return true;
  }

  const m = {
    kind: 'levers',
    spec,
    tier,
    get status() {
      return S.phase === 'won' ? 'won' : S.phase === 'lost' ? 'lost' : 'running';
    },
    get phase() {
      return S.phase;
    },
    tick(dt) {
      if (S.phase !== 'run' || timeLimit <= 0 || !(dt > 0) || !Number.isFinite(dt)) return;
      S.timeLeft -= dt > MAX_DT ? MAX_DT : dt;
      if (S.timeLeft <= 0) {
        S.timeLeft = 0;
        S.phase = 'lost';
        S.reason = 'zaman';
      }
    },
    press(i) {
      if (S.phase !== 'run') return 'ignored';
      const k = Math.floor(Number(i));
      if (!(k >= 0 && k < spec.n)) return 'ignored';
      S.last = k;
      S.pos = apply(S.pos, spec.cols[k], spec.m);
      S.used++;
      S.moves++;
      if (isTarget()) {
        S.phase = 'won';
        return 'won';
      }
      if (S.used >= spec.budget) {
        S.phase = 'lost';
        S.reason = 'hamle';
        return 'lost';
      }
      return 'ok';
    },
    reset() {
      if (S.phase !== 'run') return false;
      S.pos = spec.start.slice();
      S.moves = 0;
      S.last = -1;
      return true;
    },
    view() {
      const labels = POS_LABELS[spec.m];
      const levers = [];
      for (let i = 0; i < spec.n; i++) {
        const links = [];
        for (let j = 0; j < spec.n; j++) if (j !== i && spec.cols[i][j] === 1) links.push(j);
        levers.push({
          index: i,
          name: LEVER_STYLES[i].name,
          color: LEVER_STYLES[i].color,
          shape: LEVER_STYLES[i].shape,
          pos: S.pos[i],
          posLabel: labels[S.pos[i]],
          target: spec.target[i],
          targetLabel: labels[spec.target[i]],
          ok: S.pos[i] === spec.target[i],
          links,
          linkText: linkTextOf(spec, i),
        });
      }
      let okCount = 0;
      for (let i = 0; i < spec.n; i++) if (levers[i].ok) okCount++;
      return {
        phase: S.phase,
        levers,
        positions: spec.m,
        okCount,
        used: S.used,
        moves: S.moves,
        budget: spec.budget === Infinity ? -1 : spec.budget,
        timeLeft: S.timeLeft,
        timeMax: timeLimit,
        reason: S.reason,
        live: S.phase === 'won' ? 'Tüm kollar hedefte. Kilit çözüldü.' : S.phase === 'lost' ? 'Kollar kilitlendi.' : okCount + ' / ' + spec.n + ' kol hedefte.',
        last: S.last,
      };
    },
    serialize() {
      return {
        v: 1,
        kind: 'levers',
        seed,
        tier,
        a11y,
        pos: S.pos.slice(),
        used: S.used,
        moves: S.moves,
        phase: S.phase,
        timeLeft: S.timeLeft || 0,
        reason: S.reason,
        last: S.last,
      };
    },
  };
  return m;
}

const PHASES = ['run', 'won', 'lost'];

export function restoreLevers(obj) {
  if (!obj || typeof obj !== 'object' || obj.kind !== 'levers' || obj.v !== 1) return null;
  const seed = seedOf(obj.seed);
  const tier = tierOf(obj.tier);
  const spec = leversSpec(seed, tier);
  const pos = [];
  for (let i = 0; i < spec.n; i++) {
    const v = Array.isArray(obj.pos) ? Math.floor(Number(obj.pos[i])) : NaN;
    pos.push(v >= 0 && v < spec.m ? v : spec.start[i]);
  }
  const finite = (v, lo, hi, def) => (Number.isFinite(Number(v)) ? Math.min(Math.max(Number(v), lo), hi) : def);
  const saved = {
    pos,
    used: Math.floor(finite(obj.used, 0, 9999, 0)),
    moves: Math.floor(finite(obj.moves, 0, 9999, 0)),
    phase: PHASES.indexOf(obj.phase) >= 0 ? obj.phase : 'run',
    timeLeft: finite(obj.timeLeft, 0, 600, 0),
    reason: obj.reason === 'zaman' || obj.reason === 'hamle' ? obj.reason : '',
    last: Math.floor(finite(obj.last, -1, spec.n - 1, -1)),
  };
  return build(seed, tier, !!obj.a11y, saved);
}
