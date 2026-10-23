/*
 * KEŞİF sim/city/vehicle — TRAFİK ARAÇLARI (Neon Meridyen Faz 3, paket traffic_ai). SAF: three/DOM/Math.random/Date.now yok, worker-güvenli, es2020.
 * Trafik araçlarının sınıf tablosu (vehicleData sınıflarından), renk çeşitliliği, havuz ve bayrak sabitleri.
 *
 *   TCLASS[i] → {key, name, w (ağırlık), len, wid, halfLen, halfWid, aMax, bComf, T (zaman aralığı), s0 (durağan boşluk), v0f aralığı…}
 *   CAR_FLAG.{BRAKE, REVERSE, HEAD, HAZARD, BLINK_L, BLINK_R, TAXI}    render/ses bayrakları
 *   makeCarPool(n) → car[]            tahsissiz sıcak yol için önceden ayrılmış araç nesneleri
 *   resetCar(c)                        havuz nesnesini sıfırlar
 *   rollCarAttrs(c, seed, n)           belirlenimci özellikler: sınıf, renk, istenen hız çarpanı, tohum
 *   bodyColorFor(cls, h) → 0..15       renk çeşitliliği (taksi: sarı ağırlıklı)
 */
import { subHash } from '../../dim/dimensions.js';
import { VEHICLE_DEFS } from './vehicleData.js';

export const CAR_FLAG = Object.freeze({
  BRAKE: 1, REVERSE: 2, HEAD: 4, HAZARD: 8, BLINK_L: 16, BLINK_R: 32, TAXI: 64,
});

const TAG_ATTR = 0xc0b1;
const TAG_COLOR = 0xc0b2;
const TAG_SPEED = 0xc0b3;
const TAG_CLASS = 0xc0b4;

const TRAFFIC_KEYS = Object.freeze(['taksi', 'spor', 'kamyonet', 'motor']);
const WEIGHTS = Object.freeze([0.4, 0.17, 0.2, 0.23]);
const ACC = Object.freeze({ taksi: 2.5, spor: 3.3, kamyonet: 1.8, motor: 3.5 });
const HEADWAY = Object.freeze({ taksi: 1.15, spor: 1.05, kamyonet: 1.45, motor: 1.0 });
const GAP0 = Object.freeze({ taksi: 2.0, spor: 2.0, kamyonet: 2.4, motor: 1.5 });

export const TCLASS = Object.freeze(TRAFFIC_KEYS.map((key, i) => {
  const d = VEHICLE_DEFS[key];
  return Object.freeze({
    idx: i,
    key,
    name: d.name,
    w: WEIGHTS[i],
    len: d.length,
    wid: d.width,
    halfLen: d.length * 0.5,
    halfWid: d.width * 0.5,
    aMax: ACC[key],
    bComf: 3.5,
    T: HEADWAY[key],
    s0: GAP0[key],
    height: d.height,
  });
}));

/** Gövde renk dizini 0..15 (vehicleData.COSMETICS.body). Taksi sınıfının %55'i sarı (taksi levhalı), diğerleri tüm palet. */
export function bodyColorFor(clsIdx, h) {
  const u = (h >>> 0) % 1000;
  if (clsIdx === 0) {
    if (u < 550) return 2; // Limon Sarısı — Meridyen Taksi
    return (h >>> 10) % 16;
  }
  // gri/siyah/beyaz tonları ağırlıklı (gerçekçi trafik): Antrasit 9, Kar Beyazı 10, Kum 8
  if (u < 120) return 9;
  if (u < 220) return 10;
  if (u < 280) return 8;
  return (h >>> 10) % 16;
}

export function makeCarPool(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = {
      idx: i,
      alive: false,
      id: 0,
      seed: 0,
    };
    resetCar(c);
    out.push(c);
  }
  return out;
}

export function resetCar(c) {
  c.alive = false;
  c.state = 0; // 0 yok · 1 aktif · 2 solma (despawn)
  c.cls = 0;
  c.len = 4.2;
  c.halfLen = 2.1;
  c.halfWid = 0.95;
  c.aMax = 2.5;
  c.bComf = 3.5;
  c.T = 1.1;
  c.s0 = 2;
  c.color = 0;
  c.accent = 1;
  c.v0f = 1;
  c.flags = 0;
  c.mode = 0; // 1 şerit · 2 kavşak içi
  c.de = -1;
  c.lane = 0;
  c.s = 0;
  c.J = -1;
  c.mv = null;
  c.p = 0;
  c.v = 0;
  c.acc = 0;
  c.clear = false;
  c.holdJ = -1;
  c.grantMv = null;
  c.relS = 0;
  c.ticket = 0;
  c.ticketJ = -1;
  c.ticketActive = false;
  c.passN = 0;
  c.hold = 0;
  c.fade = 0;
  c.stuckT = 0;
  c.sigWait = false;
  c.obsWait = 0;
  c.yieldT = 0;
  c.honkCd = 0;
  c.lat = 0;
  c.laneFrom = 0;
  c.lcP = 1;
  c.lcCool = 0;
  c.age = 0;
  c.x = 0; c.y = 0; c.z = 0; c.yaw = 0; c.pitch = 0;
  c.px = 0; c.py = 0; c.pz = 0; c.pyaw = 0; c.ppitch = 0;
  c.ticketT = 0;
  c.denyWhy = '';
  c.lastDe = -1;
  c.lastFront = 1e9;
  c.pitchT = 0;
  c.nextArm = -1;
  return c;
}

/** Belirlenimci özellikler: (seed, n) → sınıf, renk, istenen hız çarpanı (0,92..1,04). c.seed = alt akış tohumu. */
export function rollCarAttrs(c, seed, n) {
  const h = subHash(seed | 0, n | 0, TAG_ATTR) >>> 0;
  const u = (subHash(seed | 0, n | 0, TAG_CLASS) >>> 0) / 4294967296;
  let acc = 0;
  let idx = TCLASS.length - 1;
  for (let i = 0; i < TCLASS.length; i++) {
    acc += TCLASS[i].w;
    if (u < acc) {
      idx = i;
      break;
    }
  }
  const k = TCLASS[idx];
  c.seed = h;
  c.cls = idx;
  c.len = k.len;
  c.halfLen = k.halfLen;
  c.halfWid = k.halfWid;
  c.aMax = k.aMax;
  c.bComf = k.bComf;
  c.T = k.T;
  c.s0 = k.s0;
  const hc = subHash(seed | 0, n | 0, TAG_COLOR) >>> 0;
  c.color = bodyColorFor(idx, hc);
  c.accent = (hc >>> 20) % 16;
  c.v0f = 0.92 + ((subHash(seed | 0, n | 0, TAG_SPEED) >>> 0) / 4294967296) * 0.12;
  c.flags = c.color === 2 && idx === 0 ? CAR_FLAG.TAXI : 0;
  return c;
}
