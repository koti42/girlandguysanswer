/*
 * KEŞİF render/city — ARAÇ MODEL VERİSİ (SAF; three yok, düğümde test edilir). Sınıf başına iki ayrıntı düzeyi:
 *   'hi' (sürülen / yakın araçlar, ≤1500 üçgen)  ·  'lo' (örnekli trafik, ≤600 üçgen)
 *
 *   MODEL_KINDS       ['taksi','spor','kamyonet','motor','hoverbike','suzulkay','hatch','sedan']  (hatch/sedan yalnız görsel; trafik için)
 *   TRAFFIC_KINDS     örnekli trafikte kullanılan türler
 *   kindDims(kind) → {length,width,height,wheelbase,wheelR,hover,wheels,track,eye:[x,y,z]}   (fizik tanımıyla uyumlu; hatch/sedan burada)
 *   buildModel(kind, lod) → { kind, lod, solid, glass, tris:{solid,glass,total}, anchors, bounds, shell }   (önbellekli; dondurulmuş dizi sahipliği çağıranda DEĞİL)
 *     solid/glass = {position, normal, aColor, aMat, aPivot, uv, tris} (Float32Array)
 *     anchors: {head:[[x,y,z]…], tail, wheels:[[x,y,z,r]…], exhaust:[[x,y,z]…], under:{hw,hl,y}, eye:[x,y,z], seat:[x,y,z], lamp:{…}, hover}
 *     bounds = tüm köşeler; shell = sürücü bayraklı köşeler HARİÇ (OBB karşılaştırması için)
 *   disposeModelCache()
 */
import { Geo, boundsOf, finalize, F_DRIVER } from './vehicleGeoKit.js';
import { buildCar } from './vehicleGeoCars.js';
import { CAR_SPECS } from './vehicleGeoSpecs.js';
import { buildBoard, buildHoverbike, buildMotor } from './vehicleGeoBikes.js';
import { VEHICLE_DEFS } from '../../sim/city/vehicle/vehicleData.js';

export const MODEL_KINDS = Object.freeze(['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike', 'suzulkay', 'hatch', 'sedan']);
export const TRAFFIC_KINDS = Object.freeze(['hatch', 'sedan', 'taksi', 'kamyonet', 'spor', 'motor']);
export const MODEL_LODS = Object.freeze(['hi', 'lo']);

const EXTRA_DIMS = Object.freeze({
  hatch: Object.freeze({
    length: 3.7, width: 1.75, height: 1.45, wheelbase: 2.4, wheelR: 0.32, hover: 0, track: 1.5, eye: [0, 1.1, -0.6],
  }),
  sedan: Object.freeze({
    length: 4.5, width: 1.85, height: 1.4, wheelbase: 2.75, wheelR: 0.33, hover: 0, track: 1.56, eye: [0, 1.1, -0.8],
  }),
});

export function kindDims(kind) {
  const d = VEHICLE_DEFS[kind];
  if (d) {
    return {
      length: d.length, width: d.width, height: d.height, wheelbase: d.wheelbase, wheelR: d.wheelR, hover: d.hover, track: d.track,
      wheels: d.kind === 'araba' ? 4 : d.kind === 'motor' ? 2 : 0, eye: [d.cam.hood[0], d.cam.hood[1], -d.cam.hood[2]],
    };
  }
  const e = EXTRA_DIMS[kind];
  if (e) return Object.assign({ wheels: 4 }, e);
  return null;
}

function carAnchors(spec, dims) {
  const zN = spec.lower[0][0];
  const zT = spec.lower[spec.lower.length - 1][0];
  const hx = spec.headX;
  const tx = spec.tailX;
  const wz = spec.wb / 2;
  const wx = spec.track / 2 + (spec.wheelBulge || 0);
  const wheels = [[-wx, spec.wheelR, -wz, spec.wheelR], [wx, spec.wheelR, -wz, spec.wheelR], [-wx, spec.wheelR, wz, spec.wheelR], [wx, spec.wheelR, wz, spec.wheelR]];
  return {
    head: [[-hx, spec.headY, zN], [hx, spec.headY, zN]],
    tail: [[-tx, spec.tailY, zT], [tx, spec.tailY, zT]],
    wheels,
    exhaust: (spec.exhaust || []).map((x) => [x, 0.3, zT + 0.1]),
    under: { hw: spec.W * 0.5 - 0.1, hl: spec.L * 0.5 - 0.25, y: 0.12 },
    eye: dims.eye,
    seat: [spec.driver.x, spec.seatY + 0.16, spec.driver.z],
    hover: 0,
  };
}

const CACHE_HI = new Map();
const CACHE_LO = new Map();

/** lo modelde cam katmanı tek çizim çağrısı için opak katmana katılır (slot GLASS koyu yansıtıcı). */
function mergeGlass(fin) {
  const a = fin.solid;
  const b = fin.glass;
  if (b.tris === 0) return;
  ['position', 'normal', 'aColor', 'aMat', 'aPivot', 'uv'].forEach((k) => {
    const m = new Float32Array(a[k].length + b[k].length);
    m.set(a[k], 0);
    m.set(b[k], a[k].length);
    a[k] = m;
    b[k] = new Float32Array(0);
  });
  a.tris += b.tris;
  b.tris = 0;
}

function build(kind, lod) {
  const g = new Geo();
  const dims = kindDims(kind);
  let anchors;
  if (CAR_SPECS[kind]) {
    const spec = CAR_SPECS[kind];
    buildCar(g, spec, lod, null);
    anchors = carAnchors(spec, dims);
  } else if (kind === 'motor') {
    buildMotor(g, lod, null);
    anchors = {
      head: [[0, 0.88, -0.9]], tail: [[0, 0.7, 1.06]], wheels: [[0, 0.3, -0.72, 0.3], [0, 0.3, 0.7, 0.3]], exhaust: [[0.19, 0.35, 1.1]],
      under: { hw: 0.3, hl: 0.8, y: 0.1 }, eye: dims.eye, seat: [0, 0.84, 0.35], hover: 0,
    };
  } else if (kind === 'hoverbike') {
    buildHoverbike(g, lod, null);
    anchors = {
      head: [[0, 0.46, -1.3]], tail: [[-0.2, 0.52, 1.3], [0.2, 0.52, 1.3]], wheels: [], exhaust: [[-0.5, 0.42, 1.0], [0.5, 0.42, 1.0]],
      under: { hw: 0.5, hl: 1.1, y: 0.18 }, eye: dims.eye, seat: [0, 0.78, 0.35], hover: dims.hover,
    };
  } else if (kind === 'suzulkay') {
    buildBoard(g, lod, null);
    anchors = {
      head: [[0, 0.18, -0.7]], tail: [[0, 0.17, 0.72]], wheels: [], exhaust: [[0, 0.14, 0.75]],
      under: { hw: 0.28, hl: 0.6, y: 0.05 }, eye: dims.eye, seat: [0, 0.285, 0], hover: dims.hover,
    };
  } else {
    throw new Error('Bilinmeyen model türü: ' + kind);
  }
  const fin = finalize(g);
  if (lod === 'lo') mergeGlass(fin);
  const tris = { solid: fin.solid.tris, glass: fin.glass.tris, total: fin.solid.tris + fin.glass.tris };
  return {
    kind,
    lod,
    solid: fin.solid,
    glass: fin.glass,
    tris,
    anchors,
    dims,
    bounds: boundsOf(g),
    shell: boundsOf(g, F_DRIVER, false),
  };
}

export function buildModel(kind, lod) {
  const cache = lod === 'lo' ? CACHE_LO : CACHE_HI;
  let m = cache.get(kind);
  if (!m) {
    m = build(kind, lod === 'lo' ? 'lo' : 'hi');
    cache.set(kind, m);
  }
  return m;
}

export function disposeModelCache() {
  CACHE_HI.clear();
  CACHE_LO.clear();
}
