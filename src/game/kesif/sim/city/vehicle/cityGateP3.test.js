/*
 * qa_p3 — FAZ 3 KAPISI (sözleşme §19 "Faz kapısı G", §20, §22): araç / trafik / radyo için tam-plan denetimleri.
 *
 *  1) POI planı (200 tohum): park_slot / garage / rental var, her biri yol ve yaya ağına yakın; yaya ağı tek bileşen.
 *  2) Gerçek bloklarda (az tohum, her POI): sergi/park aracı için boş poz, iniş noktası katıda değil ve altı taşıyıcı, garaj terminali ≤ 2,6 m yakınında ayakta
 *     durulacak hücre; iniş noktaları + terminal hücreleri Kapı Meydanından yürüyerek ULAŞILABİLİR (hücre BFS, KESIF_GATE_P3_NAV tohum).
 *  3) Trafik değişmezleri (200 tohum): min boşluk > 0,5 m, kırmızı ihlali 0, çatışan hareket 0, bekçi 0, kavşak kilitlenmesi 0 (en uzun duruş < 90 sn).
 *  4) Kaydet/yükle: sürüş sırasında (kavşak içi dahil) kayıt temizleyicisinden geçen araç yeniden konur; trafik aynı tohumdan aynı özeti verir, geri yüklenen araca binmez.
 *  5) Marka/güvenlik: araç ad/açıklamaları, boya adları, plaka, radyo istasyon ve parça adları; kaynak dizgeleri (vehicle* sistemleri dahil).
 *
 * Ortam: KESIF_GATE_P3_SEEDS (varsayılan 200), KESIF_GATE_P3_WORLD (gerçek blok tohum sayısı, vars. 6), KESIF_GATE_P3_NAV (hücre BFS tohum sayısı, vars. 2),
 *        KESIF_GATE_P3_SECS (trafik sn/tohum, vars. 360), KESIF_GATE_SHARD=i/n.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { pois, roadNet, walkNet } from '../cityPlan.js';
import { citySeed } from '../cityPlanTestKit.js';
import { scanText } from '../citySafeData.js';
import { buildNav } from '../cityNavKit.js';
import { mulberry32 } from '../../rng.js';
import { createTraffic, TICK } from './trafficAI.js';
import { trafficNet } from './junctions.js';
import { createMonitor } from './trafficTestKit.js';
import {
  COSMETICS, VEHICLE_CLASSES, VEHICLE_DEFS, plateFor,
} from './vehicleData.js';
import {
  createVehicle, findFreePose, resetToRoad, restoreVehicle, serializeVehicle, stepVehicle,
} from './vehiclePhysics.js';
import { findExitSpot, playerBoxFree } from './vehicleExit.js';
import { sanitizeVehicleSave } from './vehicleSave.js';
import { roadSnapFor } from './vehicleRoad.js';
import { groundHeight } from './vehicleWorld.js';
import { cityWorld, pursuit } from './vehicleTestKit.js';
import {
  STATIONS, TRACK_BARS, barSeconds, tickerAt, trackAt,
} from '../../../audioRadio.js';

vi.setConfig({ testTimeout: 900000 });

const ENV = (globalThis.process && globalThis.process.env) || {};
const N_SEEDS = Number(ENV.KESIF_GATE_P3_SEEDS || 200);
const N_WORLD = Number(ENV.KESIF_GATE_P3_WORLD || 6);
const N_NAV = Number(ENV.KESIF_GATE_P3_NAV || 2);
const SECS = Number(ENV.KESIF_GATE_P3_SECS || 360);
const SHARD = String(ENV.KESIF_GATE_SHARD || '0/1').split('/').map(Number);
const SEEDS = [];
for (let s = 0; s < N_SEEDS; s++) if (s % SHARD[1] === SHARD[0]) SEEDS.push(s);

/* ------------------------------------------------------------------------------------------------
 * 1) POI planı
 * ---------------------------------------------------------------------------------------------- */
describe('Faz 3 kapısı — araç POI planı (200 tohum)', () => {
  SEEDS.forEach((s) => {
    it('tohum ' + s + ': park_slot / garage / rental var, yola yakın, yaya ağı tek parça', () => {
      const seed = citySeed(s);
      const list = pois(seed);
      const rn = roadNet(seed);
      const wn = walkNet(seed);
      const bad = [];
      const count = { park_slot: 0, garage: 0, rental: 0 };
      list.forEach((p) => {
        if (!(p.type in count)) return;
        count[p.type]++;
        if (![p.x, p.y, p.z].every(Number.isFinite)) { bad.push(p.type + ' ' + p.id + ' sonsuz'); return; }
        if (p.y < 60 || p.y > 140) bad.push(p.type + ' ' + p.id + ' y=' + p.y);
        // araç ağı: en yakın yol çizgisi; park yeri/kiralama sokağa bakar (≤ 30 m), garaj kapısı bina önünde (≤ 60 m)
        const near = rn.nearest(p.x, p.z);
        const lim = p.type === 'park_slot' ? 30 : 60; // park yeri sokağa bakar; kiralama Kapı Meydanında, garaj kapısı bina önünde
        if (!near || !(near.dist <= lim)) bad.push(p.type + ' ' + p.id + ' yola uzak ' + (near ? near.dist.toFixed(1) : '-'));
        const wnode = wn.nodes[wn.nearest(p.x, p.z)];
        if (!wnode) bad.push(p.type + ' ' + p.id + ' yaya ağı yok');
        else if (Math.hypot(wnode.x - p.x, wnode.z - p.z) > 45) bad.push(p.type + ' ' + p.id + ' yaya düğümü uzak');
      });
      if (count.park_slot < 20) bad.push('park_slot ' + count.park_slot);
      if (count.garage < 8) bad.push('garage ' + count.garage);
      if (count.rental < 3) bad.push('rental ' + count.rental);
      if (wn.components() !== 1) bad.push('yaya ağı bileşen ' + wn.components());
      expect(bad).toEqual([]);
    });
  });
});

/* ------------------------------------------------------------------------------------------------
 * 2) Gerçek bloklarda binme/inme/erişim
 * ---------------------------------------------------------------------------------------------- */
function standCell(world, layer, x, z, y0, r) {
  // (x,z) çevresinde r içinde ayakta durulabilir hücre (oyuncu kutusu boş, altı taşıyıcı); en yakın olan
  let best = null;
  for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const px = Math.floor(x) + dx + 0.5;
      const pz = Math.floor(z) + dz + 0.5;
      const d = Math.hypot(px - x, pz - z);
      if (d > r || (best && d >= best.d)) continue;
      const g = groundHeight(world, px, pz, y0 + 1.5, 3, false);
      if (!(g > -Infinity) || g !== g) continue;
      if (g < y0 - 1.5 || g > y0 + 1.2) continue;
      if (playerBoxFree(world, px, g + 0.002, pz, layer.colliders)) best = { x: px, y: g + 0.002, z: pz, d };
    }
  }
  return best;
}

function worldChecks(wseed, nav) {
  const { world, layer, seed } = cityWorld(wseed, [0, 0], [0, 0]);
  const ensure = (x, z) => {
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) world.ensureChunk(cx + dx, cz + dz);
  };
  const bad = [];
  const spots = [];
  const info = { park: 0, garage: 0, rental: 0, exits: 0 };
  pois(seed).forEach((p) => {
    if (p.type !== 'park_slot' && p.type !== 'garage' && p.type !== 'rental') return;
    ensure(p.x, p.z);
    ensure(p.x + Math.cos(p.yaw || 0) * 5, p.z - Math.sin(p.yaw || 0) * 5);
    if (p.type === 'park_slot') {
      info.park++;
      VEHICLE_CLASSES.forEach((cls) => {
        const d = VEHICLE_DEFS[cls];
        const f = findFreePose(world, d, p.x, p.y, p.z, p.yaw || 0, { maxR: 9 });
        if (!f) { bad.push('park_slot ' + p.id + ' ' + cls + ' boş poz yok'); return; }
        const v = createVehicle(cls, { x: f.x, y: f.y, z: f.z, yaw: f.yaw });
        const ex = findExitSpot(world, v, { colliders: layer.colliders });
        if (!ex) { bad.push('park_slot ' + p.id + ' ' + cls + ' iniş yok'); return; }
        info.exits++;
        if (!playerBoxFree(world, ex.x, ex.y, ex.z, layer.colliders)) bad.push('park_slot ' + p.id + ' ' + cls + ' iniş katıda');
        if (cls === 'taksi') spots.push({ what: 'park_slot ' + p.id, x: ex.x, y: ex.y, z: ex.z });
      });
    } else if (p.type === 'rental') {
      info.rental++;
      const sy = Math.sin(p.yaw || 0);
      const cy = Math.cos(p.yaw || 0);
      [[0, 'taksi', 4.5], [1, 'suzulkay', -3.2]].forEach((q) => {
        const d = VEHICLE_DEFS[q[1]];
        const f = findFreePose(world, d, p.x + cy * q[2], p.y, p.z - sy * q[2], p.yaw || 0, { maxR: 7 });
        if (!f) { bad.push('rental ' + p.id + ' sergi ' + q[1] + ' poz yok'); return; }
        const v = createVehicle(q[1], { x: f.x, y: f.y, z: f.z, yaw: f.yaw });
        const ex = findExitSpot(world, v, { colliders: layer.colliders });
        if (!ex) { bad.push('rental ' + p.id + ' ' + q[1] + ' iniş yok'); return; }
        info.exits++;
        spots.push({ what: 'rental ' + p.id + ' ' + q[1], x: ex.x, y: ex.y, z: ex.z });
        // aracın yanında ≤ 2,8 m'de ayakta durulabilir bir hücre (binme menzili)
        const st = standCell(world, layer, f.x, f.z, f.y, 2.7);
        if (!st) bad.push('rental ' + p.id + ' ' + q[1] + ' binme menzilinde hücre yok');
      });
    } else {
      info.garage++;
      const sy = Math.sin(p.yaw || 0);
      const cy = Math.cos(p.yaw || 0);
      const tx = p.x + cy * 2.2;
      const tz = p.z - sy * 2.2;
      const st = standCell(world, layer, tx, tz, p.y, 2.6);
      if (!st) bad.push('garage ' + p.id + ' terminal yakınında hücre yok');
      else spots.push({ what: 'garage ' + p.id, x: st.x, y: st.y, z: st.z });
    }
  });
  let unreached = [];
  if (nav) {
    const seen = nav.reach(0, 64, 2);
    unreached = spots.filter((q) => !nav.isReached(seen, Math.floor(q.x), Math.floor(q.z), Math.round(q.y)));
    unreached = unreached.map((q) => q.what + ' (' + q.x.toFixed(1) + ',' + q.y.toFixed(1) + ',' + q.z.toFixed(1) + ')');
  }
  return { bad, info, spots: spots.length, unreached, seed };
}

describe('Faz 3 kapısı — gerçek bloklarda park/sergi/garaj: boş poz, iniş, erişim', () => {
  SEEDS.slice(0, N_WORLD).forEach((s, k) => {
    it('dünya tohumu ' + (900 + s) + (k < N_NAV ? ' (+ hücre BFS erişimi)' : ''), () => {
      // nav aynı şehir tohumuyla kurulur (cityWorld → dimSeed)
      const probe = cityWorld(900 + s, [0, 0], [0, 0]);
      const nav = k < N_NAV ? buildNav(probe.seed) : null;
      const r = worldChecks(900 + s, nav);
      expect(r.bad).toEqual([]);
      expect(r.info.park).toBeGreaterThan(20);
      expect(r.info.rental).toBeGreaterThan(2);
      expect(r.info.garage).toBeGreaterThan(5);
      expect(r.info.exits).toBeGreaterThan(100);
      if (nav) {
        expect(r.spots, 'erişim denetlenen nokta').toBeGreaterThan(60);
        expect(r.unreached).toEqual([]);
      }
    }, 1200000);
  });
});

/* ------------------------------------------------------------------------------------------------
 * 3) Trafik değişmezleri
 * ---------------------------------------------------------------------------------------------- */
describe('Faz 3 kapısı — trafik değişmezleri (gerçek şehir ağı, 200 tohum)', () => {
  SEEDS.forEach((s) => {
    it('tohum ' + s + ': min boşluk > 0,5 m · kırmızı 0 · çatışma 0 · bekçi 0 · kilitlenme 0', () => {
      const seed = 31000 + s * 77;
      const rng = mulberry32(seed);
      const tn = trafficNet(seed);
      const tr = createTraffic(tn, { seed, cap: s % 5 === 0 ? 18 : 30 });
      tr.setTime(rng() * 1e5);
      tr.setPlayer(Math.round((rng() - 0.5) * 900), 64, Math.round((rng() - 0.5) * 900), rng() * 6);
      tr.setEnv({ phase: rng(), rain: rng() < 0.3, night: rng() < 0.4 });
      tr.populate();
      const mon = createMonitor(tn);
      let maxAlive = 0;
      const n = Math.round(SECS / TICK);
      for (let i = 0; i < n; i++) {
        tr.step(TICK);
        mon.step(tr, TICK, 2);
        if (tr.alive() > maxAlive) maxAlive = tr.alive();
      }
      const m = mon.result();
      expect(m.minGap, 'boşluk').toBeGreaterThan(0.5);
      expect(m.redViolations, 'kırmızı').toBe(0);
      expect(m.conflictViolations, 'çatışma').toBe(0);
      expect(tr.stats.redRuns).toBe(0);
      expect(tr.stats.watchdog, 'bekçi').toBe(0);
      expect(tr.stats.wallClamps).toBe(0);
      expect(tr.stats.gapClamps).toBe(0);
      expect(m.maxStill, 'kilitlenme').toBeLessThan(90);
      expect(tr.stats.maxTicketAge, 'kavşak açlığı').toBeLessThan(60);
      expect(maxAlive).toBeLessThanOrEqual(30);
      tr.cars.forEach((c) => { if (c.alive) expect(Number.isFinite(c.x + c.y + c.z + c.yaw + c.v)).toBe(true); });
    });
  });
});

/* ------------------------------------------------------------------------------------------------
 * 4) Kaydet/yükle: sürüş ortasında ve kavşak ortasında
 * ---------------------------------------------------------------------------------------------- */
describe('Faz 3 kapısı — sürüş ortasında / kavşak ortasında kaydet-yükle', () => {
  it('rota boyunca 24 kayıt noktası: temizleyiciden geçen poz katıda değil; geri yüklenen araç sürülür; trafik aynı tohumdan aynı özet', () => {
    const { world, layer, seed } = cityWorld(7771, [10, 20], [-14, 14]);
    const snap = roadSnapFor(seed);
    const route = [];
    // x=240 arteri (kavşaklar z=−160,−80,0,80,160): güneyden kuzeye, sağ şerit
    for (let z = 190; z >= -190; z -= 12) route.push([241.7, z]);
    const v = createVehicle('spor', { x: 241.7, y: 64, z: 195, yaw: 0 });
    const st = { i: 0, done: false };
    let saved = 0;
    let junctionSaves = 0;
    const cc = { roadSnap: snap };
    for (let step = 0; step < 60 * 26 && !st.done; step++) {
      stepVehicle(v, pursuit(v, route, st, 24, 10), world, 1 / 60, cc);
      if (step > 120 && step % 54 === 0) {
        const inJ = [-160, -80, 0, 80, 160].some((jz) => Math.abs(v.z - jz) < 12);
        const raw = JSON.parse(JSON.stringify({
          garage: { owned: [{ cls: v.cls, cos: v.cosmetics }], active: 0 },
          summoned: {
            idx: 0, x: v.x, y: v.y, z: v.z, yaw: v.yaw, dmg: v.dmg,
          },
          rental: null,
          vstats: { km: v.km, enters: 3 },
        }));
        const clean = sanitizeVehicleSave(raw);
        expect(clean.summoned, 'kayıt temizleyici aracı korur').not.toBe(null);
        const s = clean.summoned;
        const free = findFreePose(world, VEHICLE_DEFS.spor, s.x, s.y, s.z, s.yaw, { maxR: 8 });
        expect(free, 'kayıt noktası ' + step).not.toBe(null);
        const v2 = createVehicle('spor', { x: free.x, y: free.y, z: free.z, yaw: free.yaw, cosmetics: clean.garage.owned[0].cos });
        const ex = findExitSpot(world, v2, { colliders: layer.colliders });
        expect(ex, 'iniş ' + step).not.toBe(null);
        // yeniden yüklenen araç sürülebilir: 4 sn sürüş sonlu ve ilerler
        const st2 = { i: Math.max(0, st.i - 1), done: false };
        for (let k = 0; k < 240; k++) stepVehicle(v2, pursuit(v2, route, st2, 20, 10), world, 1 / 60, cc);
        expect(Number.isFinite(v2.x + v2.y + v2.z + v2.yaw + v2.vx + v2.vz)).toBe(true);
        expect(Math.hypot(v2.x - free.x, v2.z - free.z)).toBeGreaterThan(5);
        saved++;
        if (inJ) junctionSaves++;
      }
    }
    expect(saved).toBeGreaterThanOrEqual(15);
    expect(junctionSaves).toBeGreaterThanOrEqual(3);
  }, 600000);

  it('serileştirme gidiş-dönüş: serializeVehicle → JSON → restoreVehicle aynı poz/sınıf/km/hasar; yüklenen araç durur durumda başlar ve sürülür', () => {
    const { world } = cityWorld(7771, [-4, 4], [-4, 4]);
    const a = createVehicle('taksi', { x: 3.5, y: 64, z: 60, yaw: 0 });
    for (let i = 0; i < 180; i++) stepVehicle(a, { throttle: 1, steer: i > 90 ? 0.2 : 0 }, world, 1 / 60, {});
    const blob = JSON.parse(JSON.stringify(serializeVehicle(a)));
    const b = restoreVehicle(blob);
    expect(b).not.toBe(null);
    expect(b.cls).toBe('taksi');
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.01);
    expect(Math.abs(a.z - b.z)).toBeLessThan(0.01);
    expect(Math.abs(a.y - b.y)).toBeLessThan(0.01);
    expect(Math.abs(Math.atan2(Math.sin(a.yaw - b.yaw), Math.cos(a.yaw - b.yaw)))).toBeLessThan(0.002);
    expect(Math.hypot(b.vx, b.vz)).toBeLessThan(0.01);
    for (let i = 0; i < 180; i++) stepVehicle(b, { throttle: 0.6, steer: -0.1 }, world, 1 / 60, {});
    expect(Number.isFinite(b.x + b.y + b.z + b.yaw)).toBe(true);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(1);
    expect(restoreVehicle({ cls: 'ucak', x: 0, y: 64, z: 0 })).toBe(null);
    expect(restoreVehicle({ cls: 'taksi', x: NaN, y: 64, z: 0 })).toBe(null);
  });

  it('trafik: aynı tohum/zaman/oyuncu → aynı özet (yeniden yükleme sonrası trafik hash eşit); oyuncu kavşak ortasındayken araç dibine doğmaz', () => {
    const seed = 5150;
    const tn = trafficNet(seed);
    const mk = () => {
      const tr = createTraffic(tn, { seed, cap: 30 });
      tr.setTime(777);
      tr.setPlayer(240, 64, 80, 0);
      tr.setEnv({ phase: 0.8 });
      tr.populate();
      for (let i = 0; i < 400; i++) tr.step(TICK);
      return tr;
    };
    const a = mk();
    const b = mk();
    expect(a.digest()).toBe(b.digest());
    let near = 0;
    a.cars.forEach((c) => { if (c.alive && c.state === 1 && Math.hypot(c.x - 240, c.z - 80) < 20 && c.age < 1) near++; });
    expect(near).toBe(0);
  });

  it('kaydet-yükle sonrası su/yol yedeği: yüklenmemiş bölgede resetToRoad güvenle başarısız, yüklüde yola konar', () => {
    const { world, seed } = cityWorld(7771, [-3, 3], [-3, 3]);
    const snap = roadSnapFor(seed);
    const v = createVehicle('taksi', { x: 3.5, y: 64, z: 10, yaw: 0 });
    expect(resetToRoad(v, world, { roadSnap: snap })).toBe(true);
    const far = createVehicle('taksi', { x: 700, y: 64, z: 700, yaw: 0 });
    expect(resetToRoad(far, world, { roadSnap: snap })).toBe(false);
    expect(Number.isFinite(far.x)).toBe(true);
  });
});

/* ------------------------------------------------------------------------------------------------
 * 5) Marka / güvenlik
 * ---------------------------------------------------------------------------------------------- */
function strings(v, out, depth) {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object' && depth < 6) Object.keys(v).forEach((k) => strings(v[k], out, depth + 1));
  return out;
}

describe('Faz 3 kapısı — araç / radyo metinleri (citySafe + marka)', () => {
  it('araç adları, açıklamaları, boya/neon/tekerlek adları, plakalar temiz ve ÖZGÜN', () => {
    const texts = [];
    VEHICLE_CLASSES.forEach((c) => {
      texts.push(VEHICLE_DEFS[c].name, VEHICLE_DEFS[c].desc);
    });
    strings(COSMETICS, texts, 0);
    for (let i = 0; i < 400; i++) texts.push(plateFor(i * 7919, i % 3));
    const bad = texts.filter((t) => scanText(t).length > 0);
    expect(bad).toEqual([]);
    expect(texts.length).toBeGreaterThan(100);
  });

  it('radyo istasyon adları, üretilmiş parça adı/sanatçı (5 istasyon × 300 parça) ve yazı bandı (5 × 600 satır) temiz', () => {
    const names = [];
    STATIONS.forEach((st) => names.push(st.name, st.id));
    STATIONS.forEach((st) => {
      if (st.silent) return;
      const len = barSeconds(st) * TRACK_BARS;
      for (let i = 0; i < 300; i++) {
        const tr = trackAt(st, i * len + 1);
        names.push(tr.title, tr.artist);
      }
      for (let k = 0; k < 600; k++) names.push(tickerAt(st, k * 24 + 3, k % 7).text);
    });
    const bad = names.filter((t) => scanText(t).length > 0);
    expect(bad).toEqual([]);
    expect(STATIONS.length).toBe(6);
    expect(names.length).toBeGreaterThan(3000);
  });
});

const ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));
const rel = (p) => relative(ROOT, p).split(sep).join('/');

function listFiles(dir, re, out) {
  if (!existsSync(dir)) return out;
  readdirSync(dir).forEach((n) => {
    if (n === 'node_modules' || n === 'dist' || n === '.git') return;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) listFiles(p, re, out);
    else if (re.test(n)) out.push(p);
  });
  return out;
}

describe('Faz 3 kapısı — kaynak denetimleri (araç/trafik/radyo/sürüş arayüzü)', () => {
  const P3 = [
    'src/game/kesif/sim/city/vehicle', 'src/game/kesif/render/city', 'src/components/game/kesif/city',
  ];
  const P3_FILES = [
    'src/game/kesif/audioVehicle.js', 'src/game/kesif/audioRadio.js', 'src/game/kesif/audioRadioData.js', 'src/game/kesif/inputVehicle.js',
    'src/game/kesif/systems/vehicles.js', 'src/game/kesif/systems/vehiclesCam.js', 'src/game/kesif/systems/vehiclesCommands.js', 'src/game/kesif/systems/vehiclesInput.js',
    'src/game/kesif/systems/vehicleAudio.js', 'src/game/kesif/systems/vehicleUi.js', 'src/game/kesif/systems/vehicleVisual.js',
    'src/game/kesif/systems/traffic.js', 'src/game/kesif/systems/trafficLamps.js',
  ];
  const files = () => {
    const out = [];
    P3.forEach((d) => listFiles(join(ROOT, d), /\.(js|jsx|css)$/, out));
    P3_FILES.forEach((f) => { if (existsSync(join(ROOT, f))) out.push(join(ROOT, f)); });
    return Array.from(new Set(out));
  };

  it('P3 kaynaklarında TODO / FIXME / "not implemented" / sahte (stub) işaretleri 0', () => {
    const hits = [];
    const list = files().filter((f) => !/\.test\.jsx?$/.test(f));
    list.forEach((f) => {
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (/\b(TODO|FIXME)\b|not implemented|NotImplemented|\bstubs?\b/i.test(l)) hits.push(rel(f) + ':' + (i + 1) + ' ' + l.trim().slice(0, 80));
      });
    });
    expect(list.length).toBeGreaterThan(60);
    expect(hits).toEqual([]);
  });

  it('P3 kaynaklarındaki TÜM dizge ve JSX metinleri (kodda tırnaklı) yasak sözcük / gerçek marka / oyun adı içermez', () => {
    const list = files().filter((f) => !/\.test\.jsx?$/.test(f) && /\.(js|jsx)$/.test(f));
    const found = [];
    list.forEach((f) => {
      const text = readFileSync(f, 'utf8');
      // tırnaklı dizgeler (tek satır) + JSX metin düğümleri
      const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
      let m = re.exec(text);
      while (m) {
        const t = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
        if (t && t.length > 2 && /[\p{L}]/u.test(t) && !/^[\w./:#@%+-]+$/.test(t)) {
          const hits = scanText(t, { loose: true });
          hits.forEach((h) => found.push(rel(f) + ' "' + t.slice(0, 50) + '" -> ' + h.term + ' (' + h.cat + ')'));
        }
        m = re.exec(text);
      }
      const jsx = /(^|[^=])>([^<>{}]*[\p{L}][^<>{}]*)</gu;
      let j = /\.jsx$/.test(f) ? jsx.exec(text) : null;
      while (j) {
        scanText(j[2], { loose: true }).forEach((h) => found.push(rel(f) + ' JSX "' + j[2].trim().slice(0, 50) + '" -> ' + h.term));
        j = jsx.exec(text);
      }
    });
    expect(found).toEqual([]);
  });
});
