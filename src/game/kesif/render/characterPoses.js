/*
 * KEŞİF karakter pozları (saf; three yok).
 *
 * Her poz bir "rig benzeri" nesneye yazar: { rest:{hipsY,thigh,shin,ankle}, <kemik>:{rotation:{x,y,z},
 * position:{x,y,z}} }. Gerçek THREE.Bone'lar da bu arayüze uyar. Poz fonksiyonları poseX(rig, t, p)
 * biçimindedir (t: saniye; p: parametreler). Önce hedefe (createPoseTarget) poz yazılır, sonra gerçek
 * rig hedefe üstel sönümle yaklaştırılır (blendPose) — runner/avatar/build3d.js örüntüsü.
 *
 * Eksen kuralları (yüz -z, +x karakterin sağı): uzuvlarda +rotation.x öne sallar (kol/uyluk),
 * dizde/dirsekte -x (diz) / +x (dirsek) büker; omurgada -x öne eğilir; baş +x yukarı bakar;
 * armR.z>0 sağ kolu dışa açar, armL.z<0 sol kolu dışa açar.
 *
 * "Tam" pozlar tüm kanalları sıfırlayıp yazar; "bindirme" (overlay) pozlar yalnızca üst gövde/kol
 * kanallarına dokunur (yürürken kazma gibi).
 */

export const POSE_BONES = [
  'hips', 'spine', 'chest', 'neck', 'head', 'hair1', 'hair2', 'hair3',
  'clavicleL', 'armL', 'foreArmL', 'handL', 'fingersL',
  'clavicleR', 'armR', 'foreArmR', 'handR', 'fingersR',
  'legL', 'shinL', 'footL', 'toesL', 'legR', 'shinR', 'footR', 'toesR',
];

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (x) => { const t = clamp(x, 0, 1); return 1 - (1 - t) * (1 - t); };
const easeIn = (x) => { const t = clamp(x, 0, 1); return t * t; };
const EMPTY = {};

/** Gerçek rig ile aynı anahtarlara sahip sade bir hedef (yalnızca sayılar). */
export function createPoseTarget(rest) {
  const t = { rest: { hipsY: 0.92, thigh: 0.41, shin: 0.425, ankle: 0.085, ...(rest || {}) } };
  for (let i = 0; i < POSE_BONES.length; i++) {
    t[POSE_BONES[i]] = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
  }
  return t;
}

/** Tüm kanalları nötre (dinlenme) çeker; kalça yüksekliği dinlenme değeri. */
export function resetPose(rig) {
  for (let i = 0; i < POSE_BONES.length; i++) {
    const n = rig[POSE_BONES[i]];
    if (!n) continue;
    n.rotation.x = 0; n.rotation.y = 0; n.rotation.z = 0;
  }
  rig.hips.position.x = 0;
  rig.hips.position.z = 0;
  rig.hips.position.y = rig.rest.hipsY;
  return rig.rest.hipsY;
}

export function copyPose(dst, src) {
  for (let i = 0; i < POSE_BONES.length; i++) {
    const k = POSE_BONES[i];
    if (!dst[k] || !src[k]) continue;
    dst[k].rotation.x = src[k].rotation.x; dst[k].rotation.y = src[k].rotation.y; dst[k].rotation.z = src[k].rotation.z;
  }
  dst.hips.position.x = src.hips.position.x;
  dst.hips.position.y = src.hips.position.y;
  dst.hips.position.z = src.hips.position.z;
}

/** rig'i hedefe k (0..1) oranında yaklaştırır. */
export function blendPose(rig, target, k) {
  for (let i = 0; i < POSE_BONES.length; i++) {
    const key = POSE_BONES[i];
    const a = rig[key];
    const b = target[key];
    if (!a || !b) continue;
    a.rotation.x += (b.rotation.x - a.rotation.x) * k;
    a.rotation.y += (b.rotation.y - a.rotation.y) * k;
    a.rotation.z += (b.rotation.z - a.rotation.z) * k;
  }
  rig.hips.position.x += (target.hips.position.x - rig.hips.position.x) * k;
  rig.hips.position.y += (target.hips.position.y - rig.hips.position.y) * k;
  rig.hips.position.z += (target.hips.position.z - rig.hips.position.z) * k;
}

/** Üstel sönüm katsayısı: dt saniyede 'rate' (1/sn) hızıyla. */
export function dampK(dt, rate) {
  return 1 - Math.exp(-rate * Math.max(0, dt));
}

/** Açı farkını (-π, π] aralığına sarar. */
export function wrapAngle(a) {
  let r = (a + Math.PI) % TAU;
  if (r < 0) r += TAU;
  return r - Math.PI;
}

/**
 * Ayağı yere basan bacak kinematiğine göre kalça yüksekliğini ayarlar (IK'siz zemin teması).
 * Her bacak için ayak bileği kalçanın h = thigh*cos(a) + shin*cos(a+k) altındadır; en alçak ayak yerde.
 */
export function groundHips(rig, bob = 0) {
  const r = rig.rest;
  const hL = r.thigh * Math.cos(rig.legL.rotation.x) * Math.cos(rig.legL.rotation.z) + r.shin * Math.cos(rig.legL.rotation.x + rig.shinL.rotation.x);
  const hR = r.thigh * Math.cos(rig.legR.rotation.x) * Math.cos(rig.legR.rotation.z) + r.shin * Math.cos(rig.legR.rotation.x + rig.shinR.rotation.x);
  rig.hips.position.y = Math.max(hL, hR) + r.ankle + bob;
}

/** Elde tutulan eşyaya göre sağ (ve yay için sol) kol duruşu. w: karışım ağırlığı. */
const HOLD = {
  tool: { arm: [0.42, 0.1], fore: 1.05, hand: -0.15, w: 0.8 },
  sword: { arm: [0.5, 0.12], fore: 1.15, hand: -0.2, w: 0.8 },
  block: { arm: [0.4, 0.1], fore: 1.0, hand: -0.1, w: 0.7 },
  torch: { arm: [0.55, 0.14], fore: 1.2, hand: -0.2, w: 0.8 },
  gun: { arm: [0.95, 0.06], fore: 0.8, hand: -0.1, w: 0.85 },
  food: { arm: [0.5, 0.12], fore: 1.2, hand: 0, w: 0.6 },
  shield: { left: true, arm: [1.0, -0.2], fore: 0.9, hand: 0, w: 0.85 },
  bow: { left: true, arm: [0.75, -0.1], fore: 0.35, hand: 0, w: 0.85 },
};
/** Poz kütüphanesinin bildiği tutuş türleri (itemPalette.spec.hold değerleri bunların alt kümesidir). */
export const HOLD_KINDS = Object.keys(HOLD);

function applyHold(rig, p) {
  const h = HOLD[p.hold];
  if (!h) return;
  const L = !!h.left;
  const arm = L ? rig.armL : rig.armR;
  const fore = L ? rig.foreArmL : rig.foreArmR;
  const hand = L ? rig.handL : rig.handR;
  const z = L ? h.arm[1] : h.arm[1];
  arm.rotation.x = lerp(arm.rotation.x, h.arm[0], h.w);
  arm.rotation.z = lerp(arm.rotation.z, L ? z : z, h.w);
  fore.rotation.x = lerp(fore.rotation.x, h.fore, h.w);
  hand.rotation.x = lerp(hand.rotation.x, h.hand, h.w);
  // parmaklar kavrar
  (L ? rig.fingersL : rig.fingersR).rotation.z = (L ? 1 : -1) * 1.15;
}

function relaxHands(rig, curl = 0.35) {
  rig.fingersL.rotation.z = curl; // sol el: parmak ucu +x (içe)
  rig.fingersR.rotation.z = -curl;
  rig.handL.rotation.z = 0.03;
  rig.handR.rotation.z = -0.03;
}

function hairSway(rig, a, b) {
  rig.hair1.rotation.x = a;
  rig.hair2.rotation.x = a * 0.7;
  rig.hair3.rotation.x = a * 0.5;
  rig.hair1.rotation.z = b;
  rig.hair2.rotation.z = b * 0.8;
  rig.hair3.rotation.z = b * 0.6;
}

/* ------------------------------------------------------------------------------------------------
 * TAM POZLAR
 * ---------------------------------------------------------------------------------------------- */
/** Bekleme: nefes, ağırlık aktarma, kollar gevşek. */
export function poseIdle(rig, t, p = EMPTY) {
  resetPose(rig);
  const br = Math.sin(t * 2.0);
  const sw = Math.sin(t * 0.55);
  rig.spine.rotation.x = -0.015 + br * 0.008;
  rig.spine.rotation.z = sw * 0.012;
  rig.chest.rotation.x = -0.01 + br * 0.012;
  rig.chest.rotation.y = Math.sin(t * 0.45) * 0.03;
  rig.clavicleL.rotation.z = br * 0.012;
  rig.clavicleR.rotation.z = -br * 0.012;
  rig.neck.rotation.x = 0.02;
  rig.head.rotation.x = 0.0 + Math.sin(t * 0.9) * 0.012;
  rig.head.rotation.y = Math.sin(t * 0.37) * 0.04;
  rig.head.rotation.z = Math.sin(t * 0.55) * 0.015;
  rig.armL.rotation.x = 0.06;
  rig.armR.rotation.x = 0.06;
  rig.armL.rotation.z = -0.1 - br * 0.008;
  rig.armR.rotation.z = 0.1 + br * 0.008;
  rig.foreArmL.rotation.x = 0.2;
  rig.foreArmR.rotation.x = 0.2;
  relaxHands(rig);
  rig.hips.rotation.y = Math.sin(t * 0.37) * 0.03;
  rig.hips.rotation.z = sw * 0.012;
  rig.hips.position.x = sw * 0.006;
  rig.legL.rotation.z = -0.02 - Math.max(0, sw) * 0.02;
  rig.legR.rotation.z = 0.02 + Math.max(0, -sw) * 0.02;
  rig.legL.rotation.x = 0.02;
  rig.legR.rotation.x = -0.02;
  rig.shinL.rotation.x = -0.03;
  rig.shinR.rotation.x = -0.03;
  rig.footL.rotation.x = 0.01;
  rig.footR.rotation.x = 0.04;
  hairSway(rig, 0.03 + br * 0.01, Math.sin(t * 1.1) * 0.03);
  applyHold(rig, p);
  groundHips(rig, br * 0.004);
}

/** Yürüme/koşu ortak döngüsü. phase: radyan; amp: bacak salınımı; run: 0..1. */
function gait(rig, phase, amp, run, p) {
  resetPose(rig);
  const sp = Math.sin(phase);
  const cp = Math.cos(phase);
  const sp2 = Math.sin(phase + Math.PI);
  const cp2 = Math.cos(phase + Math.PI);
  const kneeBase = 0.06 + run * 0.28;
  const flex = 0.55 + run * 0.95;
  rig.legL.rotation.x = sp * amp;
  rig.legR.rotation.x = sp2 * amp;
  rig.shinL.rotation.x = -(kneeBase + flex * Math.max(0, cp) * 1.0 + 0.1 * Math.max(0, -cp) * (1 - run));
  rig.shinR.rotation.x = -(kneeBase + flex * Math.max(0, cp2) * 1.0 + 0.1 * Math.max(0, -cp2) * (1 - run));
  const footFix = (leg, shin, c) => -(leg + shin) * 0.85 + (c > 0 ? 0.12 : 0);
  rig.footL.rotation.x = footFix(rig.legL.rotation.x, rig.shinL.rotation.x, cp);
  rig.footR.rotation.x = footFix(rig.legR.rotation.x, rig.shinR.rotation.x, cp2);
  rig.toesL.rotation.x = Math.max(0, -sp) * 0.55;
  rig.toesR.rotation.x = Math.max(0, -sp2) * 0.55;
  rig.legL.rotation.z = -0.02;
  rig.legR.rotation.z = 0.02;
  // gövde: öne eğim, ters dönüş
  const lean = 0.03 + run * 0.16;
  rig.spine.rotation.x = -lean * 0.5;
  rig.chest.rotation.x = -lean * 0.6;
  rig.chest.rotation.y = sp * (0.1 + run * 0.1);
  rig.spine.rotation.y = sp * 0.04;
  rig.hips.rotation.y = -sp * (0.07 + run * 0.06);
  rig.hips.rotation.z = cp * 0.025;
  rig.chest.rotation.z = -cp * 0.02;
  rig.neck.rotation.x = lean * 0.4;
  rig.head.rotation.x = lean * 0.5;
  rig.head.rotation.y = -sp * 0.05;
  // kollar: bacaklara zıt
  const armAmp = amp * (0.75 + run * 0.35);
  rig.armL.rotation.x = -sp * armAmp;
  rig.armR.rotation.x = sp * armAmp;
  rig.armL.rotation.z = -0.1 - run * 0.04;
  rig.armR.rotation.z = 0.1 + run * 0.04;
  rig.foreArmL.rotation.x = 0.25 + run * 1.1 + Math.max(0, -sp) * (0.25 + run * 0.35);
  rig.foreArmR.rotation.x = 0.25 + run * 1.1 + Math.max(0, sp) * (0.25 + run * 0.35);
  rig.clavicleL.rotation.z = sp * 0.02;
  rig.clavicleR.rotation.z = sp * 0.02;
  relaxHands(rig, 0.35 + run * 0.4);
  hairSway(rig, 0.1 + run * 0.35 + Math.sin(phase * 2) * 0.06, -sp * (0.1 + run * 0.12));
  applyHold(rig, p);
  const bob = (Math.cos(phase * 2) * 0.012 + 0.0) * (0.6 + run);
  groundHips(rig, bob - 0.004 - run * 0.012);
}

export function poseWalk(rig, t, p = EMPTY) {
  const s = clamp(p.speed01 === undefined ? 0.5 : p.speed01, 0, 1.2);
  const phase = p.phase === undefined ? t * 5.2 : p.phase;
  gait(rig, phase, 0.3 + 0.28 * s, 0, p);
}

export function poseRun(rig, t, p = EMPTY) {
  const s = clamp(p.speed01 === undefined ? 0.8 : p.speed01, 0, 1.3);
  const phase = p.phase === undefined ? t * 8.2 : p.phase;
  gait(rig, phase, 0.62 + 0.3 * s, 1, p);
}

/** Havada: vy01 = dikey hız / zıplama hızı (+1 kalkış .. -1 düşüş). */
export function poseJump(rig, t, p = EMPTY) {
  resetPose(rig);
  const rise = clamp(p.vy01 === undefined ? 0.5 : p.vy01, -1, 1);
  const up = rise > 0 ? rise : 0;
  const dn = 1 - up;
  rig.spine.rotation.x = -0.08 + up * 0.06;
  rig.chest.rotation.x = -0.06 + up * 0.04;
  rig.head.rotation.x = 0.12;
  rig.legL.rotation.x = 0.9 * up + 0.35 * dn;
  rig.shinL.rotation.x = -0.9 * up - 0.7 * dn;
  rig.legR.rotation.x = -0.35 * up + 0.15 * dn;
  rig.shinR.rotation.x = -1.2 * up - 0.5 * dn;
  rig.footL.rotation.x = 0.2 + 0.3 * dn;
  rig.footR.rotation.x = 0.35;
  rig.armL.rotation.x = -0.6 * up + 1.1 * dn;
  rig.armR.rotation.x = 1.0 * up + 1.1 * dn;
  rig.armL.rotation.z = -0.3 - 0.45 * dn;
  rig.armR.rotation.z = 0.3 + 0.45 * dn;
  rig.foreArmL.rotation.x = 0.6;
  rig.foreArmR.rotation.x = 0.9;
  relaxHands(rig, 0.2);
  hairSway(rig, 0.25 - rise * 0.5, 0);
  rig.hips.position.y = rig.rest.hipsY - 0.02 * dn;
  applyHold(rig, p);
}

/** Uzun düşüş: kollar havada, bacaklar hafif açık. */
export function poseFall(rig, t, _p = EMPTY) {
  resetPose(rig);
  const fl = Math.sin(t * 9) * 0.06;
  rig.spine.rotation.x = 0.04;
  rig.head.rotation.x = -0.05;
  rig.armL.rotation.x = 2.2 + fl;
  rig.armR.rotation.x = 2.0 - fl;
  rig.armL.rotation.z = -0.7;
  rig.armR.rotation.z = 0.7;
  rig.foreArmL.rotation.x = 0.4;
  rig.foreArmR.rotation.x = 0.4;
  relaxHands(rig, 0.15);
  rig.legL.rotation.x = 0.45 + fl;
  rig.legR.rotation.x = -0.15 - fl;
  rig.legL.rotation.z = -0.12;
  rig.legR.rotation.z = 0.12;
  rig.shinL.rotation.x = -0.7;
  rig.shinR.rotation.x = -0.35;
  rig.footL.rotation.x = 0.35;
  rig.footR.rotation.x = 0.3;
  hairSway(rig, -0.5, fl);
  rig.hips.position.y = rig.rest.hipsY - 0.01;
}

/** Çömelme (yavaş yürüyüş döngüsüyle). */
export function poseCrouch(rig, t, p = EMPTY) {
  resetPose(rig);
  const moving = clamp(p.speed01 === undefined ? 0 : p.speed01, 0, 1);
  const phase = p.phase === undefined ? t * 4 : p.phase;
  const sp = Math.sin(phase) * moving;
  const cp = Math.cos(phase) * moving;
  rig.legL.rotation.x = 0.95 + sp * 0.28;
  rig.legR.rotation.x = 0.95 - sp * 0.28;
  rig.shinL.rotation.x = -1.7 - Math.max(0, cp) * 0.2;
  rig.shinR.rotation.x = -1.7 - Math.max(0, -cp) * 0.2;
  rig.footL.rotation.x = 0.75 - sp * 0.1;
  rig.footR.rotation.x = 0.75 + sp * 0.1;
  rig.legL.rotation.z = -0.07;
  rig.legR.rotation.z = 0.07;
  rig.spine.rotation.x = -0.32;
  rig.chest.rotation.x = -0.2;
  rig.neck.rotation.x = 0.2;
  rig.head.rotation.x = 0.22;
  rig.armL.rotation.x = 0.35 - sp * 0.3;
  rig.armR.rotation.x = 0.35 + sp * 0.3;
  rig.armL.rotation.z = -0.14;
  rig.armR.rotation.z = 0.14;
  rig.foreArmL.rotation.x = 0.85;
  rig.foreArmR.rotation.x = 0.85;
  relaxHands(rig, 0.5);
  hairSway(rig, 0.4, 0);
  applyHold(rig, p);
  groundHips(rig, 0);
}

/** Yüzme: gövde yataya yakın, kurbağalama/kraul kolları, çırpma bacakları. speed01: 0 yerinde .. 1 hızlı. */
export function poseSwim(rig, t, p = EMPTY) {
  resetPose(rig);
  const s = clamp(p.speed01 === undefined ? 0.4 : p.speed01, 0, 1);
  const phase = p.phase === undefined ? t * (3 + s * 3) : p.phase;
  const tread = 1 - s; // yerinde su çiğneme
  rig.hips.rotation.x = -(0.2 + 1.0 * s);
  rig.hips.position.y = rig.rest.hipsY * (0.82 - 0.25 * s);
  rig.hips.position.z = -0.0;
  rig.spine.rotation.x = 0.1 * s;
  rig.neck.rotation.x = 0.35 * s + 0.1;
  rig.head.rotation.x = 0.55 * s;
  const a = phase;
  rig.armL.rotation.x = Math.sin(a) * 1.9 * s + 0.3 * tread;
  rig.armR.rotation.x = Math.sin(a + Math.PI) * 1.9 * s + 0.3 * tread;
  rig.armL.rotation.z = -0.25 - 0.45 * tread * (0.5 + 0.5 * Math.sin(t * 3));
  rig.armR.rotation.z = 0.25 + 0.45 * tread * (0.5 + 0.5 * Math.sin(t * 3 + 1));
  rig.foreArmL.rotation.x = 0.3 + Math.max(0, Math.cos(a)) * 1.1 * s + 0.5 * tread;
  rig.foreArmR.rotation.x = 0.3 + Math.max(0, -Math.cos(a)) * 1.1 * s + 0.5 * tread;
  relaxHands(rig, 0.1);
  const kick = Math.sin(a * 2) * (0.3 + 0.25 * s);
  rig.legL.rotation.x = kick * s + 0.25 * tread * Math.sin(t * 2.6);
  rig.legR.rotation.x = -kick * s - 0.25 * tread * Math.sin(t * 2.6);
  rig.shinL.rotation.x = -0.25 - Math.max(0, -kick) * 0.8 - 0.5 * tread;
  rig.shinR.rotation.x = -0.25 - Math.max(0, kick) * 0.8 - 0.5 * tread;
  rig.footL.rotation.x = -0.5;
  rig.footR.rotation.x = -0.5;
  hairSway(rig, -0.2, Math.sin(a) * 0.2);
}

/** Ölüm: geriye yıkılıp yere uzanır. p.progress 0..1. */
export function poseDeath(rig, t, p = EMPTY) {
  resetPose(rig);
  const k = clamp(p.progress === undefined ? 1 : p.progress, 0, 1);
  const e = easeOut(k);
  const bounce = Math.sin(clamp(k * 1.25, 0, 1) * Math.PI) * 0.08;
  rig.hips.rotation.x = 1.5 * e;
  rig.hips.position.y = lerp(rig.rest.hipsY, 0.14, easeIn(k * 1.15)) + bounce * (1 - k);
  rig.hips.position.z = 0.45 * e;
  rig.spine.rotation.x = 0.15 * e;
  rig.head.rotation.x = 0.35 * e;
  rig.head.rotation.z = 0.25 * e;
  rig.armL.rotation.x = 0.7 * e;
  rig.armR.rotation.x = 0.4 * e;
  rig.armL.rotation.z = -0.9 * e;
  rig.armR.rotation.z = 1.1 * e;
  rig.foreArmL.rotation.x = 0.3 * e;
  rig.foreArmR.rotation.x = 0.5 * e;
  rig.legL.rotation.x = 0.4 * e;
  rig.legR.rotation.x = -0.1 * e;
  rig.legL.rotation.z = -0.2 * e;
  rig.legR.rotation.z = 0.3 * e;
  rig.shinL.rotation.x = -0.5 * e;
  rig.shinR.rotation.x = -0.15 * e;
  hairSway(rig, 0.5 * e, 0.2 * e);
}

/** Kutlama: kollar havada, zıplama. */
export function poseCheer(rig, t, _p = EMPTY) {
  resetPose(rig);
  const hop = Math.max(0, Math.sin(t * 7));
  const wave = Math.sin(t * 9);
  rig.spine.rotation.x = 0.04;
  rig.chest.rotation.x = 0.06;
  rig.chest.rotation.z = wave * 0.05;
  rig.head.rotation.x = 0.15;
  rig.head.rotation.z = wave * 0.1;
  rig.armL.rotation.x = 0.3;
  rig.armR.rotation.x = 0.3;
  rig.armL.rotation.z = -2.6 - wave * 0.2;
  rig.armR.rotation.z = 2.6 - wave * 0.2;
  rig.foreArmL.rotation.x = 0.35 + Math.max(0, wave) * 0.4;
  rig.foreArmR.rotation.x = 0.35 + Math.max(0, -wave) * 0.4;
  rig.fingersL.rotation.z = 0.1;
  rig.fingersR.rotation.z = -0.1;
  rig.legL.rotation.z = -0.07;
  rig.legR.rotation.z = 0.07;
  rig.shinL.rotation.x = -0.1 - hop * 0.45;
  rig.shinR.rotation.x = -0.1 - hop * 0.45;
  rig.legL.rotation.x = hop * 0.2;
  rig.legR.rotation.x = hop * 0.2;
  hairSway(rig, 0.2 + hop * 0.3, wave * 0.2);
  groundHips(rig, hop * 0.07);
}

/** Planör: kollar yukarıda planörü tutar, bacaklar geride, gövde hafif öne. */
export function poseGlide(rig, t, _p = EMPTY) {
  resetPose(rig);
  const sw = Math.sin(t * 1.6);
  rig.hips.rotation.x = -0.18;
  rig.spine.rotation.x = -0.1;
  rig.chest.rotation.x = -0.05;
  rig.chest.rotation.z = sw * 0.04;
  rig.head.rotation.x = 0.35;
  rig.armL.rotation.x = 2.95;
  rig.armR.rotation.x = 2.95;
  rig.armL.rotation.z = -0.28;
  rig.armR.rotation.z = 0.28;
  rig.foreArmL.rotation.x = 0.12;
  rig.foreArmR.rotation.x = 0.12;
  rig.clavicleL.rotation.z = -0.1;
  rig.clavicleR.rotation.z = 0.1;
  relaxHands(rig, 0.55);
  rig.legL.rotation.x = -0.3 + sw * 0.05;
  rig.legR.rotation.x = -0.42 - sw * 0.05;
  rig.shinL.rotation.x = -0.55;
  rig.shinR.rotation.x = -0.7;
  rig.footL.rotation.x = -0.4;
  rig.footR.rotation.x = -0.4;
  hairSway(rig, -0.55, sw * 0.12);
  rig.hips.position.y = rig.rest.hipsY * 0.96;
}

/** Kanca: sağ kol hedefe uzanır; pull 0..1 gerilince gövde geriye yaslanır. */
export function poseGrapple(rig, t, p = EMPTY) {
  resetPose(rig);
  const pull = clamp(p.pull === undefined ? 0.5 : p.pull, 0, 1);
  const sw = Math.sin(t * 5) * 0.03 * pull;
  rig.hips.rotation.x = 0.08 * pull;
  rig.spine.rotation.x = 0.1 * pull - 0.05;
  rig.chest.rotation.y = 0.25;
  rig.chest.rotation.x = 0.1 * pull;
  rig.head.rotation.x = 0.42;
  rig.head.rotation.y = -0.25;
  rig.armR.rotation.x = 2.05 + sw;
  rig.armR.rotation.z = 0.12;
  rig.foreArmR.rotation.x = 0.1 + 0.35 * pull;
  rig.handR.rotation.x = -0.2;
  rig.armL.rotation.x = 1.0 - 0.5 * pull;
  rig.armL.rotation.z = -0.65;
  rig.foreArmL.rotation.x = 0.7;
  relaxHands(rig, 0.6);
  rig.legL.rotation.x = 0.35 + 0.3 * pull;
  rig.legR.rotation.x = -0.15;
  rig.legL.rotation.z = -0.08;
  rig.legR.rotation.z = 0.08;
  rig.shinL.rotation.x = -0.6;
  rig.shinR.rotation.x = -0.5;
  rig.footL.rotation.x = 0.2;
  rig.footR.rotation.x = 0.1;
  hairSway(rig, -0.3, sw * 3);
  rig.hips.position.y = rig.rest.hipsY * 0.97;
}

/* ------------------------------------------------------------------------------------------------
 * BİNDİRME (overlay) POZLARI — taban poz zaten yazılmış olmalı
 * ---------------------------------------------------------------------------------------------- */
/** Kazma/vuruş: yukarıdan aşağı savurma. progress 0..1 (döngüsel çağrılabilir). */
export function poseMine(rig, t, p = EMPTY) {
  const k = clamp(p.progress === undefined ? (t * 2.4) % 1 : p.progress, 0, 1);
  let a;
  let f;
  let tw;
  if (k < 0.38) { const u = easeOut(k / 0.38); a = lerp(0.45, 2.45, u); f = lerp(1.0, 1.7, u); tw = lerp(0, -0.28, u); }
  else if (k < 0.58) { const u = easeIn((k - 0.38) / 0.2); a = lerp(2.45, 0.35, u); f = lerp(1.7, 0.3, u); tw = lerp(-0.28, 0.3, u); }
  else { const u = sm((k - 0.58) / 0.42); a = lerp(0.35, 0.45, u); f = lerp(0.3, 1.0, u); tw = lerp(0.3, 0, u); }
  const strike = k >= 0.38 && k < 0.7 ? 1 - Math.abs((k - 0.48) / 0.22) : 0;
  rig.armR.rotation.x = a;
  rig.armR.rotation.z = 0.1;
  rig.foreArmR.rotation.x = f;
  rig.handR.rotation.x = lerp(-0.1, -0.5, strike);
  rig.chest.rotation.y += tw * 0.7;
  rig.spine.rotation.y += tw * 0.3;
  rig.chest.rotation.x += -0.1 * strike;
  rig.spine.rotation.x += -0.12 * strike;
  rig.head.rotation.x += 0.1 * strike;
  rig.armL.rotation.x = lerp(rig.armL.rotation.x, 0.5 + 0.2 * strike, 0.5);
  rig.foreArmL.rotation.x = Math.max(rig.foreArmL.rotation.x, 0.7);
  rig.clavicleR.rotation.z = -0.08 * Math.max(0, a - 1) * 0.5;
}

/** Kılıç savurma: yandan yana. progress 0..1. */
export function poseAttack(rig, t, p = EMPTY) {
  const k = clamp(p.progress === undefined ? (t * 2) % 1 : p.progress, 0, 1);
  let z;
  let tw;
  let a;
  if (k < 0.28) { const u = easeOut(k / 0.28); z = lerp(0.12, 1.15, u); tw = lerp(0, -0.55, u); a = lerp(0.5, 1.45, u); }
  else if (k < 0.55) { const u = easeIn((k - 0.28) / 0.27); z = lerp(1.15, -0.85, u); tw = lerp(-0.55, 0.65, u); a = lerp(1.45, 1.35, u); }
  else { const u = sm((k - 0.55) / 0.45); z = lerp(-0.85, 0.12, u); tw = lerp(0.65, 0, u); a = lerp(1.35, 0.5, u); }
  const strike = k >= 0.28 && k < 0.6 ? 1 : 0;
  rig.armR.rotation.x = a;
  rig.armR.rotation.z = z;
  rig.foreArmR.rotation.x = lerp(1.15, 0.35, strike);
  rig.handR.rotation.x = -0.2;
  rig.chest.rotation.y += tw;
  rig.spine.rotation.y += tw * 0.4;
  rig.hips.rotation.y += tw * 0.25;
  rig.spine.rotation.x += -0.08 * strike;
  rig.head.rotation.y += -tw * 0.5;
  rig.armL.rotation.x = lerp(rig.armL.rotation.x, 0.3, 0.6);
  rig.armL.rotation.z = lerp(rig.armL.rotation.z, -0.55 + z * 0.1, 0.7);
}

/** Yay germe: sol kol yayı uzatır, sağ el kiriş/oku yanağa çeker. charge 0..1. */
export function poseBowDraw(rig, t, p = EMPTY) {
  const ch = clamp(p.charge === undefined ? 1 : p.charge, 0, 1);
  const e = easeOut(ch);
  const tremble = ch > 0.9 ? Math.sin(t * 38) * 0.006 : 0;
  rig.chest.rotation.y = lerp(0, 0.5, e);
  rig.spine.rotation.y = lerp(0, 0.18, e);
  rig.head.rotation.y = lerp(0, -0.55, e);
  rig.head.rotation.x += 0.05 * e;
  rig.armL.rotation.x = lerp(rig.armL.rotation.x, 1.52, e);
  rig.armL.rotation.z = lerp(rig.armL.rotation.z, -0.12, e);
  rig.foreArmL.rotation.x = lerp(rig.foreArmL.rotation.x, 0.06, e);
  rig.handL.rotation.x = lerp(rig.handL.rotation.x, -0.1, e);
  rig.armR.rotation.x = lerp(rig.armR.rotation.x, 1.42, e);
  rig.armR.rotation.z = lerp(rig.armR.rotation.z, 1.05, e) + tremble;
  rig.foreArmR.rotation.x = lerp(rig.foreArmR.rotation.x, 2.35, e);
  rig.handR.rotation.x = lerp(rig.handR.rotation.x, -0.2, e);
  rig.clavicleR.rotation.z = -0.1 * e;
}

/** Ateş/bırakma: tüfekte geri tepme, yayda bırakma. progress 0..1; p.kind: 'gun'|'bow'. */
export function poseFire(rig, t, p = EMPTY) {
  const k = clamp(p.progress === undefined ? 0 : p.progress, 0, 1);
  const kick = k < 0.15 ? easeOut(k / 0.15) : 1 - sm((k - 0.15) / 0.55);
  if (p.kind === 'bow') {
    poseBowDraw(rig, t, { charge: 1 - easeOut(k / 0.2) * 0.9 });
    rig.armR.rotation.z = lerp(1.05, 0.25, easeOut(k / 0.18));
    rig.foreArmR.rotation.x = lerp(2.35, 0.6, easeOut(k / 0.18));
    rig.armL.rotation.x += -0.1 * kick;
    return;
  }
  rig.armR.rotation.x = 1.5 - 0.35 * kick;
  rig.armR.rotation.z = 0.06;
  rig.foreArmR.rotation.x = 0.55 + 0.35 * kick;
  rig.handR.rotation.x = -0.15 + 0.35 * kick;
  rig.armL.rotation.x = 1.25 - 0.15 * kick;
  rig.armL.rotation.z = -0.38;
  rig.foreArmL.rotation.x = 0.85;
  rig.chest.rotation.x += 0.1 * kick;
  rig.spine.rotation.x += 0.06 * kick;
  rig.chest.rotation.y += 0.12;
  rig.head.rotation.x += 0.05 - 0.05 * kick;
}

/** Blok yerleştirme: öne itme. progress 0..1. */
export function posePlace(rig, t, p = EMPTY) {
  const k = clamp(p.progress === undefined ? (t * 3) % 1 : p.progress, 0, 1);
  const thrust = k < 0.35 ? easeOut(k / 0.35) : 1 - sm((k - 0.35) / 0.65);
  rig.armR.rotation.x = lerp(rig.armR.rotation.x, 0.65 + 0.85 * thrust, 0.9);
  rig.armR.rotation.z = 0.1;
  rig.foreArmR.rotation.x = lerp(1.1, 0.4, thrust);
  rig.handR.rotation.x = -0.2 * thrust;
  rig.chest.rotation.x += -0.07 * thrust;
  rig.chest.rotation.y += 0.12 * thrust;
  rig.spine.rotation.x += -0.05 * thrust;
}

/** Hasar: geriye sarsılma (toplamsal). progress 0..1. */
export function poseHurt(rig, t, p = EMPTY) {
  const k = clamp(p.progress === undefined ? 0 : p.progress, 0, 1);
  const f = (1 - k) * (1 - k);
  const shake = Math.sin(k * 28) * f;
  rig.spine.rotation.x += 0.3 * f;
  rig.chest.rotation.x += 0.2 * f;
  rig.chest.rotation.z += shake * 0.12;
  rig.head.rotation.x += 0.4 * f;
  rig.head.rotation.z += shake * 0.18;
  rig.armL.rotation.z += -0.35 * f;
  rig.armR.rotation.z += 0.35 * f;
  rig.armL.rotation.x += -0.3 * f;
  rig.armR.rotation.x += -0.3 * f;
  rig.hips.rotation.x += 0.07 * f;
  rig.hips.position.y -= 0.025 * f;
}

/* ------------------------------------------------------------------------------------------------
 * Kayıt defteri ve hareketten poz seçimi
 * ---------------------------------------------------------------------------------------------- */
export const POSES = {
  idle: { fn: poseIdle, overlay: false },
  walk: { fn: poseWalk, overlay: false },
  run: { fn: poseRun, overlay: false },
  jump: { fn: poseJump, overlay: false },
  fall: { fn: poseFall, overlay: false },
  crouch: { fn: poseCrouch, overlay: false },
  swim: { fn: poseSwim, overlay: false },
  death: { fn: poseDeath, overlay: false },
  cheer: { fn: poseCheer, overlay: false },
  glide: { fn: poseGlide, overlay: false },
  grapple: { fn: poseGrapple, overlay: false },
  mine: { fn: poseMine, overlay: true },
  attack: { fn: poseAttack, overlay: true },
  'bow-draw': { fn: poseBowDraw, overlay: true },
  fire: { fn: poseFire, overlay: true },
  build: { fn: posePlace, overlay: true },
  place: { fn: posePlace, overlay: true },
  hurt: { fn: poseHurt, overlay: true },
};
export const POSE_NAMES = Object.keys(POSES);

/** Adı verilen pozu uygular. Tam poz sıfırlar; bindirme mevcut hedefin üstüne yazar. */
export function applyNamedPose(rig, name, t, p) {
  const e = POSES[name] || POSES.idle;
  e.fn(rig, t, p || EMPTY);
  return e.overlay;
}

/**
 * Hareket durumundan taban pozunu seçer (saf). m: {speed, vy, onGround, crouch, swim, glide, grapple, dead}.
 * out: {name, speed01, vy01} — yeniden kullanılır.
 */
export function chooseLocomotion(m, out = {}) {
  const speed = Math.max(0, m.speed || 0);
  out.speed01 = 0;
  out.vy01 = 0;
  if (m.dead) { out.name = 'death'; return out; }
  if (m.swim) { out.name = 'swim'; out.speed01 = clamp(speed / 2.4, 0, 1); return out; }
  if (m.glide) { out.name = 'glide'; return out; }
  if (m.grapple) { out.name = 'grapple'; out.speed01 = 1; return out; }
  const grounded = m.onGround !== false;
  if (!grounded) {
    const vy = m.vy || 0;
    if (vy < -7.5) { out.name = 'fall'; return out; }
    out.name = 'jump';
    out.vy01 = clamp(vy / 7.5, -1, 1);
    return out;
  }
  if (m.crouch) { out.name = 'crouch'; out.speed01 = clamp(speed / 1.8, 0, 1); return out; }
  if (speed < 0.15) { out.name = 'idle'; return out; }
  if (speed > 4.9) { out.name = 'run'; out.speed01 = clamp((speed - 4.9) / 1.4 + 0.6, 0, 1.3); return out; }
  out.name = 'walk';
  out.speed01 = clamp(speed / 4.3, 0, 1.2);
  return out;
}

/** Yürüme/koşu adım hızı: radyan/sn (tam döngü = iki adım). */
export function gaitRate(speed) {
  const cycleLen = 1.2 + 0.36 * speed;
  return (TAU * speed) / cycleLen;
}
