/*
 * KEŞİF sim/city/hack — "RÜN DİZİSİ" (Simon türü hafıza bulmacası; sözleşme §1.9, §8). SAF durum makinesi: three/DOM/Math.random/Date.now yok,
 * belirlenimci (dizi yalnız stream(seed, …) hash akışından), serileştirilebilir, worker-güvenli. Kumar teması yok: bir hafıza/dikkat oyunudur.
 *
 *   SIMON_SYMBOLS   4 sembol: her biri RENK + ŞEKİL + SES (nota) taşır → renk körü / ekran okuyucu / sessiz oynayan için ayrı ayrı ayırt edilir
 *   SIMON_TIERS     kademe 0..3: dizi uzunluğu 3/4/5/6; kademe 0-1 ZAMAN BASKISI YOK (giriş süresi yok, sınırsız tekrar)
 *   simonSpec(seed, tier) → {kind, tier, len, nsym, sequence:int[]}
 *   createSimon({seed, tier, accessibility?}) → makine
 *   restoreSimon(saved) → makine | null           (güvensiz girdi temizlenir)
 *   solveSimon(spec) → int[]                      çözüm tuş dizisi (test kanıtı: makine bu girdilerle kazanılır)
 *
 * Makine:  m.tick(dt sn)           gösterim oynatma + giriş süresi
 *          m.press(sym) → 'ok'|'round'|'won'|'lost'|'ignored'
 *          m.replay() → bool       gösterimi baştan oynatır (kademe 0-1 ve erişilebilirlik modunda sınırsız; kademe 2/3: 3/2 hak)
 *          m.view() → {phase, lit, round, len, inputIdx, timeLeft, timeMax, replays, symbols, live, sequenceText|null, reason}
 *          m.serialize() → düz JSON    m.status → 'running'|'won'|'lost'
 * Aşamalar: 'show' (dizi gösterilir; `lit` yanan sembol ya da -1) → 'input' (oyuncu tekrarlar) → 'won' | 'lost'.
 * Erişilebilirlik modu: tüm süreler ×2 (gösterim, boşluk, giriş süresi) + sınırsız tekrar + ekran okuyucu için dizi metni.
 */
import { stream } from '../cityPlanKit.js';

export const SIMON_SYMBOLS = Object.freeze([
  Object.freeze({
    id: 0, name: 'Kırmızı üçgen', color: '#ff4d6d', shape: 'ucgen', note: 261.63, key: '1',
  }),
  Object.freeze({
    id: 1, name: 'Mavi daire', color: '#3aa0ff', shape: 'daire', note: 329.63, key: '2',
  }),
  Object.freeze({
    id: 2, name: 'Yeşil kare', color: '#35d07f', shape: 'kare', note: 392.0, key: '3',
  }),
  Object.freeze({
    id: 3, name: 'Sarı yıldız', color: '#ffc933', shape: 'yildiz', note: 523.25, key: '4',
  }),
]);

/* show/gap: saniye (gösterim süresi / aralık); input: her tuş için süre (0 = sınırsız); replays: Infinity = sınırsız */
export const SIMON_TIERS = Object.freeze([
  Object.freeze({
    len: 3, show: 0.9, gap: 0.3, input: 0, replays: Infinity,
  }),
  Object.freeze({
    len: 4, show: 0.8, gap: 0.25, input: 0, replays: Infinity,
  }),
  Object.freeze({
    len: 5, show: 0.65, gap: 0.22, input: 6, replays: 3,
  }),
  Object.freeze({
    len: 6, show: 0.55, gap: 0.2, input: 4.5, replays: 2,
  }),
]);

const TAG_SIMON = 0xd11;
const LEAD = 0.6; // gösterim öncesi hazırlık (sn)
const NEXT_LEAD = 0.5;
const REPLAY_LEAD = 0.4;
const MAX_DT = 1;

function tierOf(t) {
  const n = Math.floor(Number(t));
  return n >= 0 && n <= 3 ? n : 0;
}

function seedOf(s) {
  const n = Number(s);
  return Number.isFinite(n) ? n | 0 : 0;
}

export function simonSpec(seed, tier) {
  const k = tierOf(tier);
  const T = SIMON_TIERS[k];
  const nsym = SIMON_SYMBOLS.length;
  const st = stream(seedOf(seed), k + 1, TAG_SIMON);
  const sequence = [];
  for (let i = 0; i < T.len; i++) {
    // aynı sembol art arda en çok iki kez (üçüncü tekrar başka sembole kaydırılır): sayması kolay ama sıkıcı olmayan diziler
    let s = st.i(nsym);
    if (i >= 2 && sequence[i - 1] === s && sequence[i - 2] === s) s = (s + 1 + st.i(nsym - 1)) % nsym;
    sequence.push(s);
  }
  return {
    kind: 'simon', tier: k, len: T.len, nsym, sequence,
  };
}

export function solveSimon(spec) {
  return spec.sequence.slice();
}

function sequenceTextOf(spec, round) {
  const names = [];
  for (let i = 0; i < round; i++) names.push(SIMON_SYMBOLS[spec.sequence[i]].name);
  return names.join(', ');
}

export function createSimon(opts) {
  const o = opts || {};
  const seed = seedOf(o.seed);
  const tier = tierOf(o.tier);
  const a11y = !!o.accessibility;
  return build(seed, tier, a11y, null);
}

function build(seed, tier, a11y, saved) {
  const spec = simonSpec(seed, tier);
  const T = SIMON_TIERS[tier];
  const scale = a11y ? 2 : 1;
  const maxReplays = a11y ? Infinity : T.replays;
  const S = {
    phase: 'show', round: 1, step: 0, t: -LEAD, inputIdx: 0, replays: maxReplays, timeLeft: T.input * scale, reason: '', last: -1, lastOk: true,
  };
  if (saved) {
    S.phase = saved.phase;
    S.round = saved.round;
    S.step = saved.step;
    S.t = saved.t;
    S.inputIdx = saved.inputIdx;
    S.replays = saved.replays < 0 ? Infinity : Math.min(saved.replays, maxReplays);
    S.timeLeft = saved.timeLeft;
    S.reason = saved.reason;
    S.last = saved.last;
    S.lastOk = saved.lastOk;
  }
  const showDur = T.show * scale;
  const gapDur = T.gap * scale;
  const inputMax = T.input * scale;

  function beginShow(lead) {
    S.phase = 'show';
    S.step = 0;
    S.t = -lead;
    S.inputIdx = 0;
    S.last = -1;
  }

  function lit() {
    if (S.phase !== 'show' || S.t < 0 || (S.step & 1) === 1) return -1;
    const i = S.step >> 1;
    return i < S.round ? spec.sequence[i] : -1;
  }

  const m = {
    kind: 'simon',
    spec,
    tier,
    get status() {
      return S.phase === 'won' ? 'won' : S.phase === 'lost' ? 'lost' : 'running';
    },
    get phase() {
      return S.phase;
    },
    tick(dt) {
      if (!(dt > 0) || !Number.isFinite(dt)) return;
      const d = dt > MAX_DT ? MAX_DT : dt;
      if (S.phase === 'show') {
        S.t += d;
        for (let guard = 0; guard < 64; guard++) {
          const dur = (S.step & 1) === 0 ? showDur : gapDur;
          if (S.t < dur) break;
          S.t -= dur;
          S.step++;
          if (S.step >= S.round * 2) {
            S.phase = 'input';
            S.inputIdx = 0;
            S.t = 0;
            S.timeLeft = inputMax;
            break;
          }
        }
      } else if (S.phase === 'input' && inputMax > 0) {
        S.timeLeft -= d;
        if (S.timeLeft <= 0) {
          S.timeLeft = 0;
          S.phase = 'lost';
          S.reason = 'zaman';
        }
      }
    },
    press(sym) {
      if (S.phase !== 'input') return 'ignored';
      const s = Math.floor(Number(sym));
      if (!(s >= 0 && s < spec.nsym)) return 'ignored';
      S.last = s;
      if (s !== spec.sequence[S.inputIdx]) {
        S.lastOk = false;
        S.phase = 'lost';
        S.reason = 'yanlis';
        return 'lost';
      }
      S.lastOk = true;
      S.inputIdx++;
      S.timeLeft = inputMax;
      if (S.inputIdx >= S.round) {
        if (S.round >= spec.len) {
          S.phase = 'won';
          return 'won';
        }
        S.round++;
        beginShow(NEXT_LEAD);
        return 'round';
      }
      return 'ok';
    },
    replay() {
      if (S.phase !== 'input' || !(S.replays > 0)) return false;
      if (S.replays !== Infinity) S.replays--;
      beginShow(REPLAY_LEAD);
      return true;
    },
    view() {
      const live = S.phase === 'show'
        ? 'Dizi gösteriliyor: ' + S.round + ' / ' + spec.len + '.'
        : S.phase === 'input' ? 'Sıra sende: ' + (S.inputIdx + 1) + '. sembol.' : S.phase === 'won' ? 'Rün dizisi çözüldü.' : 'Dizi bozuldu.';
      return {
        phase: S.phase,
        lit: lit(),
        round: S.round,
        len: spec.len,
        inputIdx: S.inputIdx,
        timeLeft: S.timeLeft,
        timeMax: inputMax,
        replays: S.replays === Infinity ? -1 : S.replays,
        symbols: SIMON_SYMBOLS,
        live,
        sequenceText: a11y ? sequenceTextOf(spec, S.round) : null,
        reason: S.reason,
        last: S.last,
        lastOk: S.lastOk,
      };
    },
    serialize() {
      return {
        v: 1,
        kind: 'simon',
        seed,
        tier,
        a11y,
        phase: S.phase,
        round: S.round,
        step: S.step,
        t: S.t || 0,
        inputIdx: S.inputIdx,
        replays: S.replays === Infinity ? -1 : S.replays,
        timeLeft: S.timeLeft || 0,
        reason: S.reason,
        last: S.last,
        lastOk: S.lastOk,
      };
    },
  };
  return m;
}

const PHASES = ['show', 'input', 'won', 'lost'];

export function restoreSimon(obj) {
  if (!obj || typeof obj !== 'object' || obj.kind !== 'simon' || obj.v !== 1) return null;
  const seed = seedOf(obj.seed);
  const tier = tierOf(obj.tier);
  const spec = simonSpec(seed, tier);
  const phase = PHASES.indexOf(obj.phase) >= 0 ? obj.phase : 'show';
  const round = Math.min(Math.max(Math.floor(Number(obj.round)) || 1, 1), spec.len);
  const finite = (v, lo, hi, def) => (Number.isFinite(Number(v)) ? Math.min(Math.max(Number(v), lo), hi) : def);
  const saved = {
    phase,
    round,
    step: Math.floor(finite(obj.step, 0, round * 2, 0)),
    t: finite(obj.t, -2, 10, 0),
    inputIdx: Math.floor(finite(obj.inputIdx, 0, round - 1, 0)),
    replays: Math.floor(finite(obj.replays, -1, 99, -1)),
    timeLeft: finite(obj.timeLeft, 0, 60, 0),
    reason: obj.reason === 'zaman' || obj.reason === 'yanlis' ? obj.reason : '',
    last: Math.floor(finite(obj.last, -1, 3, -1)),
    lastOk: obj.lastOk !== false,
  };
  return build(seed, tier, !!obj.a11y, saved);
}
