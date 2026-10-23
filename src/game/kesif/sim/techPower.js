/*
 * KEŞİF sim — TEKNOLOJİ: enerji ağı grafiği ve arz/talep dengeleme (saf; DOM/three yok, belirlenimci).
 *
 *   posKey(x,y,z) → "x,y,z"            parseKey(key) → [x,y,z] | null        compareKeys(a,b)  (sayısal x,y,z sırası)
 *   buildNetworks({getBlock, keys, machineAt, conducts, maxNodes}) → {networks, nodeNet, overflow}
 *   solveNetwork(parts, dt) → sonuç    (gen/talep/depo/yük dengesi; yazmaz — çağıran uygular)
 *
 * Ağ: yan yana (6 komşu) EN BÜYÜK 2000 düğüme kadar iletken blok kümesi (kablo, jeneratör, pil, tüketici, açık anahtar…).
 * BFS başlangıçları sıralı anahtar sırasıyla, komşu sırası sabit (+x,−x,+y,−y,+z,−z) → aynı dünya aynı ağları üretir.
 * Kablolar kayıtlı makine değildir: BFS dünyadaki blok kimliklerinden geçer. Üretilmemiş chunk (getBlock null) iletken değildir.
 * Sınırı aşan düğümler ağa katılmaz (`overflow` sayısı raporlanır) ve başka bir ağın tohumu olmaz.
 */

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export function posKey(x, y, z) {
  return x + ',' + y + ',' + z;
}

const KEY_RE = /^(-?\d{1,7}),(-?\d{1,7}),(-?\d{1,7})$/;
/** "x,y,z" → [x,y,z] (tam sayılar, ≤ 7 hane) | null. */
export function parseKey(key) {
  if (typeof key !== 'string') return null;
  const m = KEY_RE.exec(key);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
export function compareKeys(a, b) {
  const pa = parseKey(a);
  const pb = parseKey(b);
  if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0;
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
}

/**
 * Enerji ağlarını kurar.
 * opts: {
 *   getBlock(x,y,z) → id | null,
 *   keys: kayıtlı makine anahtarları (HERHANGİ sırada; burada sıralanır),
 *   machineAt(key) → makine durumu | null  (iletkenlik kararı için),
 *   conducts(id, machine|null, key) → bool  (kayıtsız makine bloğunu burada kaydedebilir),
 *   maxNodes (varsayılan 2000)
 * }
 * Döner: { networks:[{id, count, machines:[key…](sıralı), overflow}], nodeNet:Map(makineAnahtarı → ağ indeksi), overflow:sayı }
 */
export function buildNetworks(opts) {
  const maxNodes = opts.maxNodes > 0 ? opts.maxNodes | 0 : 2000;
  const keys = opts.keys.slice().sort(compareKeys);
  const visited = new Set();
  const nodeNet = new Map();
  const networks = [];
  let overflowTotal = 0;

  for (let s = 0; s < keys.length; s++) {
    const startKey = keys[s];
    if (visited.has(startKey)) continue;
    const p = parseKey(startKey);
    if (!p) continue;
    const id0 = opts.getBlock(p[0], p[1], p[2]);
    if (id0 === null || id0 === undefined) continue;
    if (!opts.conducts(id0, opts.machineAt(startKey), startKey)) continue;
    const net = { id: networks.length, count: 0, machines: [], overflow: 0 };
    const queue = [p];
    visited.add(startKey);
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      const ck = posKey(c[0], c[1], c[2]);
      if (net.count >= maxNodes) {
        net.overflow++;
        overflowTotal++;
        continue;
      }
      net.count++;
      if (opts.machineAt(ck)) {
        net.machines.push(ck);
        nodeNet.set(ck, net.id);
      }
      for (let d = 0; d < 6; d++) {
        const nx = c[0] + DIRS[d][0];
        const ny = c[1] + DIRS[d][1];
        const nz = c[2] + DIRS[d][2];
        const nk = posKey(nx, ny, nz);
        if (visited.has(nk)) continue;
        const id = opts.getBlock(nx, ny, nz);
        if (id === null || id === undefined) continue;
        if (!opts.conducts(id, opts.machineAt(nk), nk)) continue;
        visited.add(nk);
        queue.push([nx, ny, nz]);
      }
    }
    net.machines.sort(compareKeys);
    networks.push(net);
  }
  return { networks, nodeNet, overflow: overflowTotal };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}
/** Sonlu ve pozitif değilse 0 (NaN/Infinity/negatif girdi güvenliği). */
function pos(v) {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Bir ağın arz/talep dengesi (EU/sn hızlarıyla; dt saniyelik adım için).
 * parts: {
 *   gens:   [{key, rate}]                              (anlık üretim hızı)
 *   stores: [{key, stored, cap, io}]                   (pil bankaları)
 *   loads:  [{key, demand, prio, partial?}]            (talep hızı; prio küçük = önce beslenir; partial: kısmi beslenebilir tampon)
 * }
 * Kurallar: önce üretim tüketicileri besler, açık kalan talebi piller (en dolu önce, azami `io`/sn) karşılar. Tüketici ya
 * tamamen beslenir ya hiç (kısmi yok; `partial` tampon yükler hariç: kalan arz kadar pay alır); yetmeyenler sıradaki en düşük
 * öncelikliden kesilir (prio, anahtar sırası → belirlenimci).
 * Artan üretim pilleri doldurur (en boş önce, azami `io` ve boş yer). Hiçbir şey yazılmaz.
 *
 * Döner: {
 *   gen, demand, supplied (beslenen toplam talep), powered: Map(key→bool), share: Map(key→0..1 pay), live (kaynak var mı),
 *   fromGen, fromStore, toStore, wasted, storeDelta: Map(key→EU değişimi dt boyunca)
 * }
 */
export function solveNetwork(parts, dt) {
  const step = dt > 0 ? dt : 1;
  let gen = 0;
  for (let i = 0; i < parts.gens.length; i++) gen += pos(parts.gens[i].rate);
  const stores = parts.stores.map((s) => ({
    key: s.key,
    stored: pos(s.stored),
    cap: pos(s.cap),
    io: pos(s.io),
  }));
  let dischargeCap = 0;
  stores.forEach((s) => {
    s.out = Math.min(s.io, s.stored / step);
    dischargeCap += s.out;
  });
  const loads = parts.loads.slice().sort((a, b) => a.prio - b.prio || compareKeys(a.key, b.key));
  const live = gen + dischargeCap > 1e-9;
  let remaining = gen + dischargeCap;
  let demand = 0;
  let used = 0;
  const powered = new Map();
  const share = new Map();
  for (let i = 0; i < loads.length; i++) {
    const l = loads[i];
    const d = pos(l.demand);
    demand += d;
    if (d <= 1e-9) {
      powered.set(l.key, live);
      share.set(l.key, live ? 1 : 0);
    } else if (l.partial) {
      const alloc = Math.min(d, remaining);
      if (alloc > 1e-9) {
        powered.set(l.key, true);
        share.set(l.key, alloc / d);
        remaining -= alloc;
        used += alloc;
      } else {
        powered.set(l.key, false);
        share.set(l.key, 0);
      }
    } else if (d <= remaining + 1e-9) {
      powered.set(l.key, true);
      share.set(l.key, 1);
      remaining -= d;
      used += d;
    } else {
      powered.set(l.key, false);
      share.set(l.key, 0);
    }
  }
  const fromGen = Math.min(gen, used);
  const fromStore = Math.max(0, used - fromGen);
  const surplus = Math.max(0, gen - fromGen);
  const storeDelta = new Map();
  stores.forEach((s) => storeDelta.set(s.key, 0));

  // deşarj: en dolu önce
  let needStore = fromStore;
  const byFull = stores.slice().sort((a, b) => b.stored - a.stored || compareKeys(a.key, b.key));
  for (let i = 0; i < byFull.length && needStore > 1e-9; i++) {
    const take = Math.min(byFull[i].out, needStore);
    storeDelta.set(byFull[i].key, -take * step);
    needStore -= take;
  }
  // şarj: en boş önce
  let left = surplus;
  let toStore = 0;
  const byEmpty = stores.filter((s) => storeDelta.get(s.key) === 0).sort((a, b) => a.stored / (a.cap || 1) - b.stored / (b.cap || 1) || compareKeys(a.key, b.key));
  for (let i = 0; i < byEmpty.length && left > 1e-9; i++) {
    const room = Math.max(0, (byEmpty[i].cap - byEmpty[i].stored) / step);
    const put = Math.min(byEmpty[i].io, room, left);
    if (put > 0) {
      storeDelta.set(byEmpty[i].key, put * step);
      left -= put;
      toStore += put;
    }
  }
  return {
    gen: round3(gen),
    demand: round3(demand),
    supplied: round3(used),
    powered,
    share,
    live,
    fromGen: round3(fromGen),
    fromStore: round3(fromStore - needStore),
    toStore: round3(toStore),
    wasted: round3(Math.max(0, left)),
    storeDelta,
  };
}

/**
 * Yakıt jeneratörü başlatma kararı: mevcut üretim talebi (+ pil dolum ihtiyacı) karşılamıyorsa, yanmayan ve yakıtı olan
 * jeneratörleri anahtar sırasıyla başlat. parts.gens: [{key, rate, burning, canStart}] (güneş canStart:false, burning:true sayılır).
 * Döner: başlatılacak anahtarlar.
 */
export function pickGeneratorsToStart(gens, demandRate, storeRoomRate) {
  let supply = 0;
  for (let i = 0; i < gens.length; i++) if (gens[i].burning) supply += gens[i].rate;
  let need = demandRate + storeRoomRate - supply;
  const starts = [];
  const idle = gens.filter((g) => !g.burning && g.canStart).sort((a, b) => compareKeys(a.key, b.key));
  for (let i = 0; i < idle.length && need > 1e-9; i++) {
    starts.push(idle[i].key);
    need -= idle[i].rate;
  }
  return starts;
}
