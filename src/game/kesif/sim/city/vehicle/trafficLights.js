/*
 * KEŞİF sim/city/vehicle — TRAFİK IŞIKLARI (Neon Meridyen Faz 3, paket traffic_ai). SAF: three/DOM/Math.random/Date.now yok, worker-güvenli, es2020.
 * Sözleşme KESIF_CITY_CONTRACT §9: 4 yön döngüsü 27 sn (yeşil 10, sarı 2, hepsi kırmızı 1,5 ×2), tohumlu ofset; çatışan gruplar asla birlikte yeşil değil.
 *
 * Bir kavşağın ışık planı, kavşağın (cityPlan.intersections) kolları ve lambaları ({dir}) ile kurulur; her şey ZAMANIN saf işlevidir:
 * aynı (plan, t) → aynı durum (kayıt/yükleme, boyut değişimi, test tekrarında yeniden eşitleme gerekmez).
 *
 *   makeSignalPlan(inter, armMask, seed?) → plan {id, mode, phase0, cycle, lit[4], group[4], main}
 *        mode 'fixed' : tüm kollar lambalı (arter×arter): grup A (K+G kolları 0,2) ve grup B (D+B kolları 1,3) sırayla
 *        mode 'main'  : yalnız ana yolun kolları lambalı (arter×sokak): ana yol yeşil 15 / sarı 2 / kırmızı 10; yan kollar ışıksız (YIELD, yol ver)
 *        mode 'free'  : lamba yok (sokak×sokak, dirsek): tüm kollar YIELD (sağdan gelene öncelik + FIFO rezervasyon)
 *   armSignal(plan, arm, t) → SIG.RED|GREEN|YELLOW|YIELD          (sayısal kodlar prop 'trafik_diregi' durumlarıyla aynı: 0 kırmızı, 1 yeşil, 2 sarı)
 *   armSignalLeft(plan, arm, t) → durumun değişmesine kalan sn    armSignalInfo(plan, arm, t, out) → {state, left}
 *   pedSignal(plan, arm, t) → PED.DONT|WALK|FLASH               yaya geçidi ışığı: arm kolundaki zebra (dik eksenin yeşili boyunca yürü, son 3 sn yanıp sön)
 *   pedSignalInfo(plan, arm, t, out) → {state, left, walkIn}    Faz 4 (crowd_ai): durum + değişime kalan sn + bir sonraki YÜRÜ'ye kalan sn
 *   lampInfo(state) → {name, text, pos, shape, glyph}           erişilebilirlik: renk + lamba konumu + şekil + metin (renk körü dostu)
 *   groupsConflictFree(plan, t) → bool                          değişmez: çatışan gruplar aynı anda yeşil/sarı değil
 *   phaseTable(plan) → [{from,to,A,B}]                          döngü tablosu (testler/belgeler)
 *   SIGNAL_CYCLE, GREEN_S, YELLOW_S, ALLRED_S, MAIN_GREEN_S
 */
import { subHash } from '../../dim/dimensions.js';

export const SIG = Object.freeze({
  RED: 0, GREEN: 1, YELLOW: 2, YIELD: 3,
});
export const PED = Object.freeze({ DONT: 0, WALK: 1, FLASH: 2 });

export const GREEN_S = 10;
export const YELLOW_S = 2;
export const ALLRED_S = 1.5;
export const SIGNAL_CYCLE = 27;
export const MAIN_GREEN_S = 15;
/** Grup B'nin döngü içindeki başlangıcı (A yeşil+sarı+hepsi kırmızı sonrası). */
const B_START = GREEN_S + YELLOW_S + ALLRED_S;
const TAG_PHASE = 0xc0a1;

/** Kol → grup: K(0)+G(2) = 0 (A), D(1)+B(3) = 1 (B). */
export const ARM_GROUP = Object.freeze([0, 1, 0, 1]);

const LAMPS = Object.freeze({
  [SIG.RED]: Object.freeze({
    name: 'kırmızı', text: 'DUR', pos: 'üst', shape: 'kare', glyph: '■',
  }),
  [SIG.YELLOW]: Object.freeze({
    name: 'sarı', text: 'HAZIRLAN', pos: 'orta', shape: 'üçgen', glyph: '▲',
  }),
  [SIG.GREEN]: Object.freeze({
    name: 'yeşil', text: 'GEÇ', pos: 'alt', shape: 'daire', glyph: '●',
  }),
  [SIG.YIELD]: Object.freeze({
    name: 'ışıksız', text: 'YOL VER', pos: '-', shape: 'elmas', glyph: '◆',
  }),
});

/** Erişilebilirlik betimi: renk adı + lamba konumu (üst/orta/alt) + şekil + metin. */
export function lampInfo(state) {
  return LAMPS[state] || LAMPS[SIG.YIELD];
}

/** Bitiş maskesi biti → kol (N1 E2 S4 W8). */
const ARM_BIT = Object.freeze([1, 2, 4, 8]);

/**
 * inter: cityPlan.intersections öğesi {id, type, lights:[{dir}], phase0, cycle} | null (lamba yok / ara düğüm). armMask: mevcut kollar.
 * seed: phase0 yoksa türetmek için.
 */
export function makeSignalPlan(inter, armMask, seed) {
  const mask = armMask | 0;
  const lit = [false, false, false, false];
  let nLit = 0;
  if (inter && Array.isArray(inter.lights)) {
    for (let i = 0; i < inter.lights.length; i++) {
      const d = inter.lights[i].dir;
      if (d >= 0 && d < 4 && (mask & ARM_BIT[d]) !== 0 && !lit[d]) {
        lit[d] = true;
        nLit++;
      }
    }
  }
  let nArms = 0;
  for (let a = 0; a < 4; a++) if ((mask & ARM_BIT[a]) !== 0) nArms++;
  const id = inter ? inter.id | 0 : -1;
  const cyc = inter && inter.cycle > 0 ? inter.cycle : SIGNAL_CYCLE;
  let phase0 = inter && Number.isFinite(inter.phase0) ? inter.phase0 : (subHash(seed | 0, id, TAG_PHASE) >>> 0) % SIGNAL_CYCLE;
  phase0 = ((phase0 % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  let mode = 'free';
  let main = -1;
  if (nLit > 0 && nLit >= nArms) mode = 'fixed';
  else if (nLit > 0) {
    mode = 'main';
    // ana yol grubu: lambalı kolların grubu (karışıksa 0 numaralı kolun grubu; arter yolları aynı eksendedir)
    let c0 = 0;
    let c1 = 0;
    for (let a = 0; a < 4; a++) if (lit[a]) (ARM_GROUP[a] === 0 ? c0++ : c1++);
    main = c0 >= c1 ? 0 : 1;
    for (let a = 0; a < 4; a++) if (lit[a] && ARM_GROUP[a] !== main) lit[a] = false;
  }
  return {
    id, mode, phase0, cycle: cyc, lit, group: ARM_GROUP, main, nArms,
  };
}

/** Grup durumu: u ∈ [0,27) döngü konumu. */
function fixedState(g, u) {
  const v = g === 0 ? u : u - B_START < 0 ? u - B_START + SIGNAL_CYCLE : u - B_START;
  if (v < GREEN_S) return SIG.GREEN;
  if (v < GREEN_S + YELLOW_S) return SIG.YELLOW;
  return SIG.RED;
}

function mainState(u) {
  if (u < MAIN_GREEN_S) return SIG.GREEN;
  if (u < MAIN_GREEN_S + YELLOW_S) return SIG.YELLOW;
  return SIG.RED;
}

function phaseU(plan, t) {
  const x = (t + plan.phase0) % SIGNAL_CYCLE;
  return x < 0 ? x + SIGNAL_CYCLE : x;
}

export function armSignal(plan, arm, t) {
  if (plan.mode === 'free') return SIG.YIELD;
  const u = phaseU(plan, t);
  if (plan.mode === 'fixed') return fixedState(ARM_GROUP[arm], u);
  // main
  if (!plan.lit[arm]) return SIG.YIELD;
  return mainState(u);
}

/** Durumun değişmesine kalan süre (sn): bir sonraki sınıra kadar. YIELD için Infinity. */
export function armSignalLeft(plan, arm, t) {
  if (plan.mode === 'free') return Infinity;
  if (plan.mode === 'main' && !plan.lit[arm]) return Infinity;
  const u = phaseU(plan, t);
  if (plan.mode === 'main') {
    if (u < MAIN_GREEN_S) return MAIN_GREEN_S - u;
    if (u < MAIN_GREEN_S + YELLOW_S) return MAIN_GREEN_S + YELLOW_S - u;
    return SIGNAL_CYCLE - u;
  }
  const g = ARM_GROUP[arm];
  const v0 = g === 0 ? u : u - B_START < 0 ? u - B_START + SIGNAL_CYCLE : u - B_START;
  if (v0 < GREEN_S) return GREEN_S - v0;
  if (v0 < GREEN_S + YELLOW_S) return GREEN_S + YELLOW_S - v0;
  return SIGNAL_CYCLE - v0;
}

export function armSignalInfo(plan, arm, t, out) {
  const o = out || {};
  o.state = armSignal(plan, arm, t);
  o.left = armSignalLeft(plan, arm, t);
  return o;
}

/** Sarı kalan süre (sn) — kırmızı/yeşil için 0. */
export function yellowLeft(plan, arm, t) {
  if (armSignal(plan, arm, t) !== SIG.YELLOW) return 0;
  return armSignalLeft(plan, arm, t);
}

/** Yaya geçidi (arm kolunun zebrası) yer tutucusu: paralel yeşil sürerken yürü, son 3 sn yanıp sön. Işıksız kavşakta DONT (araçlar yol verir). */
export function pedSignal(plan, arm, t) {
  if (plan.mode === 'free') return PED.DONT;
  const u = phaseU(plan, t);
  if (plan.mode === 'fixed') {
    // arm kolunun zebrası, DİK eksendeki grubun yeşili boyunca yürünür (o sırada arm'ın kendi grubu kırmızıdır)
    const g = 1 - ARM_GROUP[arm];
    const v0 = g === 0 ? u : u - B_START < 0 ? u - B_START + SIGNAL_CYCLE : u - B_START;
    if (v0 < GREEN_S - 3) return PED.WALK;
    if (v0 < GREEN_S) return PED.FLASH;
    return PED.DONT;
  }
  // main: ana kolların zebrası ana yol kırmızıyken, yan kolların zebrası ana yol yeşilken
  const mainArm = plan.lit[arm];
  if (mainArm) {
    const v0 = u - (MAIN_GREEN_S + YELLOW_S);
    if (v0 >= 0 && v0 < SIGNAL_CYCLE - MAIN_GREEN_S - YELLOW_S - 3) return PED.WALK;
    if (v0 >= 0) return PED.FLASH;
    return PED.DONT;
  }
  if (u < MAIN_GREEN_S - 3) return PED.WALK;
  if (u < MAIN_GREEN_S) return PED.FLASH;
  return PED.DONT;
}

/**
 * Faz 4 (crowd_ai): yaya durumu + zaman bilgisi. out {state, left (durumun değişmesine kalan sn; ışıksızda Infinity), walkIn (bir sonraki YÜRÜ başlangıcına kalan sn; şimdi YÜRÜ ise 0; ışıksızda Infinity)}.
 * Döngü 27 sn: 0,1 sn adımla ileri taranır (≤ 270 çağrı; yaya geçidi başına en çok 5 Hz çağrılır).
 */
export function pedSignalInfo(plan, arm, t, out) {
  const o = out || {};
  const st = pedSignal(plan, arm, t);
  o.state = st;
  if (plan.mode === 'free') {
    o.left = Infinity;
    o.walkIn = Infinity;
    return o;
  }
  let left = Infinity;
  let walkIn = st === PED.WALK ? 0 : Infinity;
  for (let k = 1; k <= 270 && (left === Infinity || walkIn === Infinity); k++) {
    const s = pedSignal(plan, arm, t + k * 0.1);
    if (left === Infinity && s !== st) left = k * 0.1;
    if (walkIn === Infinity && s === PED.WALK) walkIn = k * 0.1;
  }
  o.left = left;
  o.walkIn = walkIn;
  return o;
}

/** Değişmez: aynı anda iki çatışan grup (A ve B) yeşil/sarı DEĞİL. 'main' kipinde yalnız ana yol lambalıdır (çatışma yok). */
export function groupsConflictFree(plan, t) {
  if (plan.mode !== 'fixed') return true;
  const u = phaseU(plan, t);
  const a = fixedState(0, u);
  const b = fixedState(1, u);
  const goA = a === SIG.GREEN || a === SIG.YELLOW;
  const goB = b === SIG.GREEN || b === SIG.YELLOW;
  return !(goA && goB);
}

/** Döngü tablosu: [{from, to, A, B}] (testler/belgeler). 'main' kipinde A/B ana/yan değil; arm grubuna göre. */
export function phaseTable(plan) {
  const rows = [];
  const cuts = [0];
  const push = (v) => {
    const x = ((v % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
    if (cuts.indexOf(x) < 0) cuts.push(x);
  };
  if (plan.mode === 'fixed') {
    push(GREEN_S); push(GREEN_S + YELLOW_S); push(B_START); push(B_START + GREEN_S); push(B_START + GREEN_S + YELLOW_S);
  } else if (plan.mode === 'main') {
    push(MAIN_GREEN_S); push(MAIN_GREEN_S + YELLOW_S);
  }
  cuts.sort((p, q) => p - q);
  cuts.push(SIGNAL_CYCLE);
  for (let i = 0; i < cuts.length - 1; i++) {
    const u = (cuts[i] + cuts[i + 1]) / 2;
    let A = SIG.YIELD;
    let B = SIG.YIELD;
    if (plan.mode === 'fixed') {
      A = fixedState(0, u);
      B = fixedState(1, u);
    } else if (plan.mode === 'main') {
      const s = mainState(u);
      A = plan.main === 0 ? s : SIG.YIELD;
      B = plan.main === 1 ? s : SIG.YIELD;
    }
    rows.push({
      from: cuts[i], to: cuts[i + 1], A, B,
    });
  }
  return rows;
}
