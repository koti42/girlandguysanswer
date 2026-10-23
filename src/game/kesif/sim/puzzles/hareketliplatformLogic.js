/*
 * KEŞİF — hareketliplatform: saf mantık (yerleşim üretici + zamana bağlı konum işlevleri + denetim). DOM/three yok.
 *
 * Her şey ZAMANIN belirlenimli işlevidir: konum = f(state.t). Böylece kayıttan yükleme/sıfırlama tam geri kurulur.
 *
 *   platformLayout(difficulty, rng) → layout   (JSON; yerel çerçeve: lx sağ, ly yukarı, lz derinlik)
 *   slideFrac(p, t, tOn) / slideCell(p, f) / slideVel(p, t, tOn)   kayar platform
 *   stoneStage(st, stone, t)                                       yok olan taş: 0 yok · 1 sağlam · 2 uyarı (hâlâ katı)
 *   layoutReport(layout) → sorun metinleri[]   (adil/çözülebilir değişmezleri: hizalama, bekleme, örtüşme, düşme yüksekliği)
 *
 * layout: {
 *   w,d,h, x0,x1,
 *   isl:[{lz0,lz1,y,role:'start'|'cp'|'goal', plate:{lx,lz}|null}],     adalar (y = ayakta durulan seviye)
 *   segs:[{i,kind:'slide'|'stones', lz0,lz1 (boşluk satırları), y0,y1, ps (çukur zemin seviyesi), ramp,
 *          plat:{id,sx,sz,from:[lx,ly,lz],to:[lx,ly,lz],speed,dwell,travelT,P,lever,W,phase}|null,
 *          lever:{lx,ly,lz}|null,
 *          st:{on,warn,off,P,stagger,ss,hop}|null, stones:[{lx,lz,phase}]|null}],
 *   reset:{lx,ly,lz}, cps:[{lx,ly,lz}]   (cps[0] = giriş; cps[k] = k. ada plakası yanı), goal:{lx,ly,lz}
 * }
 */
import { localXRange } from './kitGeometry.js';
import { chamberSize } from './kitChamber.js';

export const PLAT_MAX_DEPTH = 41;
/** Kayar platform: kaç tur çalışan kol (tur sayısı). */
export const LEVER_LAPS = 3;

/* Zorluk tabloları. Slide: G boşluk uzunluğu, rise yükselti (0..2), speed hücre/sn, dwell uç bekleme sn.
 * Stones: n taş, hop aradaki boş hücre, ss taş kenarı, on/warn/off sn, stagger sn (ardışık taşların açılış farkı). */
const LEVELS = {
  1: {
    w: 7, islands: [3, 3],
    segs: [{
      k: 'slide', G: 6, rise: 0, speed: 1.0, dwell: 2.2, sx: 3, sz: 2,
    }],
  },
  2: {
    w: 7, islands: [3, 2, 3],
    segs: [
      {
        k: 'slide', G: 6, rise: 0, speed: 1.2, dwell: 1.8, sx: 3, sz: 2,
      },
      {
        k: 'slide', G: 7, rise: 0, speed: 1.3, dwell: 1.6, sx: 3, sz: 2, lever: true,
      },
    ],
  },
  3: {
    w: 9, islands: [3, 2, 3],
    segs: [
      {
        k: 'stones', n: 2, hop: 1, ss: 2, on: 3.2, warn: 0.9, off: 1.4, stagger: 1.6,
      },
      {
        k: 'slide', G: 7, rise: 2, speed: 1.4, dwell: 1.3, sx: 3, sz: 2,
      },
    ],
  },
  4: {
    w: 9, islands: [3, 2, 2, 3],
    segs: [
      {
        k: 'slide', G: 7, rise: 0, speed: 1.6, dwell: 1.0, sx: 3, sz: 2, lever: true,
      },
      {
        k: 'stones', n: 3, hop: 1, ss: 2, on: 2.6, warn: 0.8, off: 1.4, stagger: 1.3,
      },
      {
        k: 'slide', G: 8, rise: 2, speed: 1.8, dwell: 0.9, sx: 2, sz: 2,
      },
    ],
  },
  5: {
    w: 9, islands: [3, 2, 2, 3],
    segs: [
      {
        k: 'stones', n: 2, hop: 2, ss: 2, on: 2.2, warn: 0.7, off: 1.3, stagger: 1.1,
      },
      {
        k: 'slide', G: 7, rise: 0, speed: 2.0, dwell: 0.7, sx: 2, sz: 2,
      },
      {
        k: 'slide', G: 8, rise: 2, speed: 2.2, dwell: 0.6, sx: 2, sz: 2, lever: true,
      },
    ],
  },
};

export function clampPlatformDifficulty(d) {
  const n = Math.round(Number(d));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, n));
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/** Oda boyutu (footprint ile build aynı sayıları kullanır). */
export function platformSize(difficulty) {
  const cfg = LEVELS[clampPlatformDifficulty(difficulty)];
  let d = 0;
  let y = 0;
  let maxY = 0;
  d += cfg.islands[0];
  for (let i = 0; i < cfg.segs.length; i++) {
    const s = cfg.segs[i];
    d += s.k === 'stones' ? (s.n + 1) * s.hop + s.n * s.ss : s.G;
    y += s.rise || 0;
    if (y > maxY) maxY = y;
    d += cfg.islands[i + 1];
  }
  return chamberSize(cfg.w, d, Math.max(6, maxY + 5));
}

/** Yerleşimi üretir (belirlenimli: yalnızca difficulty + rng akışı). */
export function platformLayout(difficulty, rng) {
  const diff = clampPlatformDifficulty(difficulty);
  const cfg = LEVELS[diff];
  const size = platformSize(diff);
  const xr = localXRange(size.w);
  const segs = [];
  const isl = [];
  let lz = 0;
  let y = 0;
  isl.push({
    lz0: 0, lz1: cfg.islands[0] - 1, y: 0, role: 'start', plate: null,
  });
  lz += cfg.islands[0];
  for (let i = 0; i < cfg.segs.length; i++) {
    const s = cfg.segs[i];
    const G = s.k === 'stones' ? (s.n + 1) * s.hop + s.n * s.ss : s.G;
    const y0 = y;
    const y1 = y + (s.rise || 0);
    const seg = {
      i,
      kind: s.k,
      lz0: lz,
      lz1: lz + G - 1,
      y0,
      y1,
      ps: 0,
      ramp: false,
      plat: null,
      lever: null,
      st: null,
      stones: null,
    };
    seg.ps = y1 > y0 ? y1 - 3 : y0 - 2;
    seg.ramp = y0 - seg.ps >= 2;
    if (s.k === 'slide') {
      const lx = -((s.sx - 1) >> 1);
      const from = [lx, y0 - 1, seg.lz0];
      const to = [lx, y1 - 1, seg.lz1 - s.sz + 1];
      const travel = Math.max(to[2] - from[2], Math.abs(to[1] - from[1]));
      const travelT = round3(travel / s.speed);
      const P = round3(2 * (s.dwell + travelT));
      seg.plat = {
        id: 'p' + i,
        sx: s.sx,
        sz: s.sz,
        from,
        to,
        speed: s.speed,
        dwell: s.dwell,
        travelT,
        P,
        lever: !!s.lever,
        W: round3(LEVER_LAPS * P),
        phase: s.lever || diff === 1 ? 0 : round3(rng.next() * P),
      };
    } else {
      const P = round3(s.on + s.warn + s.off);
      seg.st = {
        on: s.on, warn: s.warn, off: s.off, P, stagger: s.stagger, ss: s.ss, hop: s.hop,
      };
      const flip = rng.next() < 0.5 ? 1 : -1;
      const offs = [0, flip, 0, -flip, 0];
      seg.stones = [];
      for (let k = 0; k < s.n; k++) {
        const lzS = seg.lz0 + s.hop + k * (s.ss + s.hop);
        const off = s.hop === 1 ? offs[k % offs.length] : 0;
        seg.stones.push({
          lx: -(s.ss >> 1) + off,
          lz: lzS,
          phase: round3(k * s.stagger),
        });
      }
    }
    segs.push(seg);
    lz += G;
    y = y1;
    const len = cfg.islands[i + 1];
    const last = i === cfg.segs.length - 1;
    isl.push({
      lz0: lz, lz1: lz + len - 1, y, role: last ? 'goal' : 'cp', plate: null,
    });
    lz += len;
  }
  // plakalar, kollar, kontrol noktaları
  const cps = [{ lx: 0, ly: 0, lz: 1 }];
  for (let k = 1; k < isl.length; k++) {
    const e = isl[k];
    const plz = e.lz0 + ((e.lz1 - e.lz0 + 1) >> 1);
    e.plate = { lx: 0, lz: plz };
    cps.push({ lx: 1, ly: e.y, lz: plz });
  }
  for (let i = 0; i < segs.length; i++) {
    const nearIsl = isl[i];
    const lzm = nearIsl.lz0 + ((nearIsl.lz1 - nearIsl.lz0 + 1) >> 1);
    if (segs[i].plat && segs[i].plat.lever) segs[i].lever = { lx: 2, ly: nearIsl.y, lz: lzm };
  }
  const last = isl[isl.length - 1];
  return {
    w: size.w,
    d: size.d,
    h: size.h,
    x0: xr.x0,
    x1: xr.x1,
    isl,
    segs,
    reset: { lx: -2, ly: 0, lz: 1 },
    cps,
    goal: { lx: 0, ly: last.y, lz: last.plate.lz },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Zamana bağlı işlevler
 * ---------------------------------------------------------------------------------------------- */
function modP(t, P) {
  return t - Math.floor(t / P) * P;
}

function ease(u) {
  return u * u * (3 - 2 * u);
}

/**
 * Kayar platformun yol oranı f ∈ [0,1] (0 = yakın uç/ada, 1 = uzak uç).
 * tOn: kollu platformlarda kolun çekildiği an (state.t), kapalıysa < 0. Kapalı/süresi dolmuş → 0 (yakın uçta park).
 */
export function slideFrac(p, t, tOn) {
  let tt;
  if (p.lever) {
    if (!(tOn >= 0) || t < tOn || t >= tOn + p.W) return 0;
    tt = t - tOn;
  } else {
    tt = t + p.phase;
  }
  tt = modP(tt, p.P);
  const d = p.dwell;
  const m = p.travelT;
  if (tt < d) return 0;
  if (tt < d + m) return ease((tt - d) / m);
  if (tt < 2 * d + m) return 1;
  return 1 - ease((tt - 2 * d - m) / m);
}

/** Yol oranı → platformun (yerel) en küçük köşe hücresi [lx,ly,lz] (yuvarlanmış). `out` verilirse yeni dizi üretmez. */
export function slideCell(p, f, out) {
  const o = out || [0, 0, 0];
  o[0] = p.from[0] + Math.round((p.to[0] - p.from[0]) * f);
  o[1] = p.from[1] + Math.round((p.to[1] - p.from[1]) * f);
  o[2] = p.from[2] + Math.round((p.to[2] - p.from[2]) * f);
  return o;
}

/** Sürekli hız (blok/sn, yerel eksenlerde [vlx,vly,vlz]); sayısal türev (belirlenimli). `out` verilirse yeni dizi üretmez. */
export function slideVel(p, t, tOn, out) {
  const e = 0.02;
  const a = slideFrac(p, t - e, tOn);
  const b = slideFrac(p, t + e, tOn);
  const k = (b - a) / (2 * e);
  const o = out || [0, 0, 0];
  o[0] = (p.to[0] - p.from[0]) * k;
  o[1] = (p.to[1] - p.from[1]) * k;
  o[2] = (p.to[2] - p.from[2]) * k;
  return o;
}

/** Yok olan taşın evresi: 1 sağlam, 2 uyarı (hâlâ katı, saydam görünür), 0 yok. */
export function stoneStage(st, stone, t) {
  const tau = modP(t - stone.phase, st.P);
  if (tau < st.on) return 1;
  if (tau < st.on + st.warn) return 2;
  return 0;
}

/* ------------------------------------------------------------------------------------------------
 * Denetim: adillik / çözülebilirlik değişmezleri (testler ve geliştirici için)
 * ---------------------------------------------------------------------------------------------- */
export function layoutReport(L) {
  const out = [];
  const bad = (m) => out.push(m);
  if (L.d > PLAT_MAX_DEPTH) bad('oda derinliği sınırı aşıyor: ' + L.d);
  let maxY = 0;
  for (let i = 0; i < L.isl.length; i++) if (L.isl[i].y > maxY) maxY = L.isl[i].y;
  if (L.h < maxY + 4) bad('baş boşluğu yetersiz: h=' + L.h + ' maxY=' + maxY);
  for (let i = 0; i < L.segs.length; i++) {
    const s = L.segs[i];
    const tag = 'seg' + i + ': ';
    const near = L.isl[i];
    const far = L.isl[i + 1];
    if (near.lz1 + 1 !== s.lz0 || s.lz1 + 1 !== far.lz0) bad(tag + 'ada/boşluk satırları bitişik değil');
    if (near.y !== s.y0 || far.y !== s.y1) bad(tag + 'ada yükseklikleri segmentle uyuşmuyor');
    const drop = Math.max(s.y0, s.y1) - s.ps;
    if (drop > 3) bad(tag + 'çukur düşme yüksekliği ' + drop + ' > 3 (hasar verir)');
    if (drop < 2) bad(tag + 'çukur çok sığ: atlanmadan yürünebilir');
    if (s.y1 - s.y0 > 2) bad(tag + 'yükselti 2\'den büyük');
    if (s.y0 - s.ps >= 2 && !s.ramp) bad(tag + 'derin çukurda çıkış rampası yok');
    if (s.plat) {
      const p = s.plat;
      const a = slideCell(p, 0);
      const b = slideCell(p, 1);
      if (a[2] !== s.lz0 || a[1] !== s.y0 - 1) bad(tag + 'yakın uç adaya bitişik/hizalı değil');
      if (b[2] + p.sz - 1 !== s.lz1 || b[1] !== s.y1 - 1) bad(tag + 'uzak uç adaya bitişik/hizalı değil');
      if (p.dwell < 0.5) bad(tag + 'uç bekleme süresi < 0,5 sn');
      if (p.speed > 2.4) bad(tag + 'hız çok yüksek');
      if (p.travelT < 1) bad(tag + 'yol süresi çok kısa');
      if (p.from[0] < L.x0 + 1 || p.from[0] + p.sx - 1 > L.x1 - 1) bad(tag + 'platform yan rampaya/duvara taşıyor');
    }
    if (s.st) {
      const st = s.st;
      if (st.hop > 2) bad(tag + 'taş aralığı > 2');
      if (st.on + st.warn < 1.5) bad(tag + 'taşın katı kalma süresi < 1,5 sn');
      const overlap = st.on + st.warn - st.stagger;
      if (overlap < 1.0) bad(tag + 'ardışık taşların örtüşmesi ' + overlap + ' < 1 sn');
      if (st.off < 0.5) bad(tag + 'kapalı süre çok kısa');
      for (let k = 0; k < s.stones.length; k++) {
        const t = s.stones[k];
        if (t.lz < s.lz0 || t.lz + st.ss - 1 > s.lz1) bad(tag + 'taş boşluk dışında');
        if (t.lx < L.x0 + 1 || t.lx + st.ss - 1 > L.x1 - 1) bad(tag + 'taş yan rampaya taşıyor');
        if (k > 0) {
          const pv = s.stones[k - 1];
          const gapZ = t.lz - (pv.lz + st.ss);
          if (gapZ > 2) bad(tag + 'ardışık taşlar arası ' + gapZ + ' > 2');
          if (Math.abs(t.lx - pv.lx) > 1) bad(tag + 'yanal kayma > 1');
        }
      }
      const first = s.stones[0];
      if (first.lz - s.lz0 > 2) bad(tag + 'ilk taş adadan uzak');
      const lastS = s.stones[s.stones.length - 1];
      if (s.lz1 - (lastS.lz + st.ss - 1) > 2) bad(tag + 'son taş adadan uzak');
      if (s.y0 !== s.y1) bad(tag + 'taş segmentinde yükselti olmamalı');
    }
  }
  return out;
}
