/*
 * KEŞİF sim/city/hack — "ZAR MANTIĞI" (zar çıkarım bulmacası; sözleşme §1.9, §8). KUMAR/ŞANS DEĞİLDİR: zarlar atılmaz; ipuçlarından tek değer dizisi
 * ÇIKARILIR (mantık / olasılık düşüncesi bulmacası). Sim saf (three/DOM/Math.random/Date.now yok), belirlenimci, serileştirilebilir, worker-güvenli.
 *
 * Oyuncu zarların yüzlerini 1..6 arasında ayarlar, "Doğrula"ya basar. Üretim: hedef değerler seçilir, doğru ipuçları tek tek eklenir ve çözüm tam OLARAK
 * BİR olana dek sürer (6^n ≤ 1296 durum taranır); gereksiz ipuçları ayıklanır. `solveDice(spec)` tüm çözümleri döndürür (hep 1 tane).
 * Süre YOK. Yanlış doğrulama ipucu geri bildirimi verir (hangi ipuçları sağlanmıyor) ve hak düşer: kademe 0/1/2/3 → 3/2/2/1 hak; haklar bitince "lost".
 * Kademe 0 (ve erişilebilirlik modu) ipuçlarının anlık ✓/✗ durumunu da gösterir.
 *
 *   diceSpec(seed, tier) → {kind, tier, n, clues:[{t,a?,b?,v?}], solution:int[], lives}
 *   clueText(clue) → Türkçe cümle        clueHolds(clue, vals) → bool
 *   createDice({seed, tier, accessibility?}) / restoreDice(saved) / solveDice(spec) → int[][]
 * Makine: set(i, v) · step(i, d=1) · submit() → 'won'|'wrong'|'lost'|'ignored' · view() · serialize() · status
 */
import { stream } from '../cityPlanKit.js';

const TIERS = Object.freeze([
  Object.freeze({ n: 2, lives: 3, reveal: true, maxClues: 5 }),
  Object.freeze({ n: 3, lives: 2, reveal: false, maxClues: 6 }),
  Object.freeze({ n: 3, lives: 2, reveal: false, maxClues: 5 }),
  Object.freeze({ n: 4, lives: 1, reveal: false, maxClues: 7 }),
]);

const TAG_DICE = 0xd31;

function tierOf(t) {
  const n = Math.floor(Number(t));
  return n >= 0 && n <= 3 ? n : 0;
}

function seedOf(s) {
  const n = Number(s);
  return Number.isFinite(n) ? n | 0 : 0;
}

/* ------------------------------------------------------------------------------------------------
 * İpuçları
 * ---------------------------------------------------------------------------------------------- */
const sumOf = (v) => v.reduce((a, b) => a + b, 0);

export function clueHolds(c, v) {
  switch (c.t) {
    case 'sum': return sumOf(v) === c.v;
    case 'sumpar': return (sumOf(v) & 1) === c.v;
    case 'gt': return v[c.a] > v[c.b];
    case 'eq': return v[c.a] === v[c.b];
    case 'par': return (v[c.a] & 1) === c.v;
    case 'ge': return v[c.a] >= c.v;
    case 'le': return v[c.a] <= c.v;
    case 'diff': return Math.abs(v[c.a] - v[c.b]) === c.v;
    case 'max': return Math.max.apply(null, v) === c.v;
    case 'min': return Math.min.apply(null, v) === c.v;
    case 'distinct': return new Set(v).size === v.length;
    case 'is': return v[c.a] === c.v;
    default: return false;
  }
}

export function clueText(c) {
  const z = (i) => (i + 1) + '. zar';
  switch (c.t) {
    case 'sum': return 'Zarların toplamı ' + c.v + '.';
    case 'sumpar': return 'Zarların toplamı ' + (c.v === 0 ? 'çift' : 'tek') + '.';
    case 'gt': return z(c.a) + ', ' + (c.b + 1) + '. zardan büyük.';
    case 'eq': return z(c.a) + ' ile ' + z(c.b) + ' aynı.';
    case 'par': return z(c.a) + ' ' + (c.v === 0 ? 'çift' : 'tek') + '.';
    case 'ge': return z(c.a) + ' en az ' + c.v + '.';
    case 'le': return z(c.a) + ' en çok ' + c.v + '.';
    case 'diff': return z(c.a) + ' ile ' + z(c.b) + ' arasındaki fark ' + c.v + '.';
    case 'max': return 'En büyük zar ' + c.v + '.';
    case 'min': return 'En küçük zar ' + c.v + '.';
    case 'distinct': return 'Zarların hepsi birbirinden farklı.';
    case 'is': return z(c.a) + ' tam ' + c.v + '.';
    default: return '';
  }
}

function allCandidates(n, reveal) {
  const out = [];
  for (let v = n; v <= 6 * n; v++) out.push({ t: 'sum', v });
  out.push({ t: 'sumpar', v: 0 }, { t: 'sumpar', v: 1 });
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      out.push({ t: 'gt', a, b });
    }
  }
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      out.push({ t: 'eq', a, b });
      for (let v = 1; v <= 5; v++) out.push({ t: 'diff', a, b, v });
    }
  }
  for (let a = 0; a < n; a++) {
    out.push({ t: 'par', a, v: 0 }, { t: 'par', a, v: 1 });
    for (let v = 2; v <= 6; v++) out.push({ t: 'ge', a, v });
    for (let v = 1; v <= 5; v++) out.push({ t: 'le', a, v });
    if (reveal) for (let v = 1; v <= 6; v++) out.push({ t: 'is', a, v });
  }
  for (let v = 1; v <= 6; v++) out.push({ t: 'max', v }, { t: 'min', v });
  out.push({ t: 'distinct' });
  return out;
}

function allAssignments(n) {
  const total = Math.pow(6, n);
  const out = [];
  for (let k = 0; k < total; k++) {
    const v = [];
    let r = k;
    for (let i = 0; i < n; i++) {
      v.push((r % 6) + 1);
      r = Math.floor(r / 6);
    }
    out.push(v);
  }
  return out;
}

export function solveDice(spec) {
  const all = allAssignments(spec.n);
  return all.filter((v) => spec.clues.every((c) => clueHolds(c, v)));
}

export function diceSpec(seed, tier) {
  const k = tierOf(tier);
  const T = TIERS[k];
  const n = T.n;
  const sd = seedOf(seed);
  const st = stream(sd, k + 1, TAG_DICE);
  const target = [];
  for (let i = 0; i < n; i++) target.push(1 + st.i(6));
  const cands = allCandidates(n, T.reveal).filter((c) => clueHolds(c, target));
  // belirlenimci karıştırma (Fisher–Yates, akıştan)
  for (let i = cands.length - 1; i > 0; i--) {
    const j = st.i(i + 1);
    const t = cands[i];
    cands[i] = cands[j];
    cands[j] = t;
  }
  let alive = allAssignments(n);
  const clues = [];
  for (let q = 0; q < cands.length && alive.length > 1 && clues.length < T.maxClues; q++) {
    const c = cands[q];
    const next = alive.filter((v) => clueHolds(c, v));
    if (next.length < alive.length) {
      clues.push(c);
      alive = next;
    }
  }
  // güvence: hâlâ belirsizse eksik zarları açıkça yaz (sonlu: her adım çözüm sayısını düşürür)
  for (let a = 0; a < n && alive.length > 1; a++) {
    const c = { t: 'is', a, v: target[a] };
    const next = alive.filter((v) => clueHolds(c, v));
    if (next.length < alive.length) {
      clues.push(c);
      alive = next;
    }
  }
  // gereksiz ipuçlarını ayıkla (çözüm tekliği korunarak)
  for (let i = clues.length - 1; i >= 0; i--) {
    const rest = clues.filter((_, j) => j !== i);
    const cnt = allAssignments(n).filter((v) => rest.every((c) => clueHolds(c, v))).length;
    if (cnt === 1) clues.splice(i, 1);
  }
  return {
    kind: 'dice', tier: k, n, clues, solution: target, lives: T.lives,
  };
}

export function createDice(opts) {
  const o = opts || {};
  return build(seedOf(o.seed), tierOf(o.tier), !!o.accessibility, null);
}

function build(seed, tier, a11y, saved) {
  const spec = diceSpec(seed, tier);
  const assist = tier === 0 || a11y;
  const S = {
    vals: new Array(spec.n).fill(1), lives: spec.lives, phase: 'run', failed: [], reason: '',
  };
  if (saved) {
    S.vals = saved.vals;
    S.lives = saved.lives;
    S.phase = saved.phase;
    S.failed = saved.failed;
    S.reason = saved.reason;
  }
  const m = {
    kind: 'dice',
    spec,
    tier,
    get status() {
      return S.phase === 'won' ? 'won' : S.phase === 'lost' ? 'lost' : 'running';
    },
    get phase() {
      return S.phase;
    },
    tick() {},
    set(i, v) {
      const k = Math.floor(Number(i));
      const x = Math.floor(Number(v));
      if (S.phase !== 'run' || !(k >= 0 && k < spec.n) || !(x >= 1 && x <= 6)) return false;
      S.vals[k] = x;
      S.failed = [];
      return true;
    },
    step(i, d) {
      const k = Math.floor(Number(i));
      if (S.phase !== 'run' || !(k >= 0 && k < spec.n)) return false;
      const dir = d < 0 ? -1 : 1;
      S.vals[k] = ((S.vals[k] - 1 + dir + 6) % 6) + 1;
      S.failed = [];
      return true;
    },
    submit() {
      if (S.phase !== 'run') return 'ignored';
      const bad = [];
      for (let i = 0; i < spec.clues.length; i++) if (!clueHolds(spec.clues[i], S.vals)) bad.push(i);
      if (bad.length === 0) {
        S.phase = 'won';
        S.failed = [];
        return 'won';
      }
      S.failed = bad;
      S.lives--;
      if (S.lives <= 0) {
        S.lives = 0;
        S.phase = 'lost';
        S.reason = 'hak';
        return 'lost';
      }
      return 'wrong';
    },
    view() {
      const clues = spec.clues.map((c, i) => ({
        index: i,
        text: clueText(c),
        ok: assist ? clueHolds(c, S.vals) : (S.failed.length ? S.failed.indexOf(i) < 0 : null),
      }));
      return {
        phase: S.phase,
        dice: S.vals.map((v, i) => ({ index: i, value: v, label: (i + 1) + '. zar: ' + v })),
        clues,
        lives: S.lives,
        maxLives: spec.lives,
        failed: S.failed.slice(),
        assist,
        reason: S.reason,
        live: S.phase === 'won' ? 'Zarlar doğru. Kilit çözüldü.' : S.phase === 'lost' ? 'Hakların bitti.'
          : S.failed.length ? S.failed.length + ' ipucu sağlanmıyor. Kalan hak: ' + S.lives + '.' : 'Zarları ipuçlarına göre ayarla.',
      };
    },
    serialize() {
      return {
        v: 1, kind: 'dice', seed, tier, a11y, vals: S.vals.slice(), lives: S.lives, phase: S.phase, failed: S.failed.slice(), reason: S.reason,
      };
    },
  };
  return m;
}

const PHASES = ['run', 'won', 'lost'];

export function restoreDice(obj) {
  if (!obj || typeof obj !== 'object' || obj.kind !== 'dice' || obj.v !== 1) return null;
  const seed = seedOf(obj.seed);
  const tier = tierOf(obj.tier);
  const spec = diceSpec(seed, tier);
  const vals = [];
  for (let i = 0; i < spec.n; i++) {
    const v = Array.isArray(obj.vals) ? Math.floor(Number(obj.vals[i])) : NaN;
    vals.push(v >= 1 && v <= 6 ? v : 1);
  }
  const failed = [];
  if (Array.isArray(obj.failed)) {
    for (let i = 0; i < obj.failed.length && failed.length < 16; i++) {
      const f = Math.floor(Number(obj.failed[i]));
      if (f >= 0 && f < spec.clues.length && failed.indexOf(f) < 0) failed.push(f);
    }
  }
  const lives = Math.floor(Number(obj.lives));
  return build(seed, tier, !!obj.a11y, {
    vals,
    lives: lives >= 0 && lives <= spec.lives ? lives : spec.lives,
    phase: PHASES.indexOf(obj.phase) >= 0 ? obj.phase : 'run',
    failed,
    reason: obj.reason === 'hak' ? 'hak' : '',
  });
}
