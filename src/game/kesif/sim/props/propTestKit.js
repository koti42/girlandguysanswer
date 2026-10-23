/*
 * KEŞİF sim/props — test kiti (yalnız testler/ölçümler): sahte şehir blok planı (cityplan yerine) ve sabit tohum yardımcıları.
 *
 *   fakeBlockPlan(seed, bi, bj) → {props, streetFurniture, lamps}    gerçek getBlockPlan ile aynı PropSpec biçimi
 *   withFakePlan(fn)                                                  kaynak geçici olarak sahte plana alınır
 */
import { PROP_LIST } from './propDefs.js';
import { setPlanSource } from './propPlan.js';
import { hash32, hash3 } from '../rng.js';

const KEYS = PROP_LIST.map((d) => d.key);

function sharedLamp(bi, bj) {
  return {
    kind: 'lamba', x: bi * 80 + 0.5, y: 64, z: bj * 80 + 40.25, rot: 0, lotId: 900000 + (bj + 64) * 128 + (bi + 64), slot: 7,
  };
}

/** Blok başına ~90 spec: birçoğu sokak kenarlarında; bazıları blok sınırında (komşu planda da listelenir). */
const PLAN_CACHE = new Map();

export function fakeBlockPlan(seed, bi, bj) {
  const ck = (seed | 0) + ':' + bi + ':' + bj;
  const hit = PLAN_CACHE.get(ck);
  if (hit) return hit;
  const plan = buildFakePlan(seed, bi, bj);
  PLAN_CACHE.set(ck, plan);
  return plan;
}

function buildFakePlan(seed, bi, bj) {
  const x0 = bi * 80;
  const z0 = bj * 80;
  const lotId = ((bi + 64) * 128 + (bj + 64)) | 0;
  const props = [];
  const furniture = [];
  const lamps = [];
  for (let k = 0; k < 90; k++) {
    const h = hash3(bi, bj, k, seed | 0);
    const kind = KEYS[h % KEYS.length];
    const edge = (h >>> 8) & 3;
    // yol kenarı: blok sınırına yakın şeritler; bazen tam sınırda
    const along = ((h >>> 12) & 0xff) / 255 * 79.9;
    const off = ((h >>> 20) & 0xf) / 4;
    let x;
    let z;
    if (edge === 0) { x = x0 + off; z = z0 + along; }
    else if (edge === 1) { x = x0 + 79.9 - off; z = z0 + along; }
    else if (edge === 2) { x = x0 + along; z = z0 + off; }
    else { x = x0 + along; z = z0 + 79.9 - off; }
    if (k % 17 === 0) { x = x0 + 16 * ((h >>> 3) % 5); z = z0 + 16 * ((h >>> 6) % 5); } // chunk sınırı
    const spec = {
      kind, x, y: 64, z, rot: (h >>> 5) & 3, variant: (h >>> 9) & 7, lotId, slot: k, district: 'merkez',
    };
    if (k % 3 === 0) lamps.push(Object.assign({}, spec, { kind: undefined, slot: k }));
    else if (k % 3 === 1) furniture.push(spec);
    else props.push(spec);
  }
  // komşu blokla paylaşılan lamba: sağ sınırdaki lamba iki planda da (aynı kimlik, aynı konum) listelenir
  props.push(sharedLamp(bi, bj), sharedLamp(bi + 1, bj));
  return { props, streetFurniture: furniture, lamps };
}

export function withFakePlan(fn) {
  setPlanSource(fakeBlockPlan);
  try {
    return fn();
  } finally {
    setPlanSource(null);
  }
}

export function seedHash(n) {
  return hash32(n | 0);
}
