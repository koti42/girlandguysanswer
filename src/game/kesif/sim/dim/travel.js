/*
 * KEŞİF sim — boyutlar arası yolculuk KURALLARI (saf; DOM/three yok, worker-güvenli). Sözleşme §5, §15.
 *
 *   canOpenGate(state, ctx)  → {ok:true, reason:null, message:null, kind, dest, cost} | {ok:false, reason, message, wait?}
 *   gateCost(state?, opts?)  → {charges, core, calibrate, free}        (her açılış 12 şarj; ilk açılış Kuantum Çekirdeği tüketir)
 *   gateSpot(world, eye, yaw, opts?) → {x,y,z,yaw,axis,nx,nz,w,h,d,dist} | null        3×4×1 boş hacim, oyuncuya dönük
 *   arrivalPoint(dim, terminal?) → {x,y,z,yaw} | null                   varış noktası (neon: terminal önü; overworld: null → bağlantı/doğuş)
 *   respawnTerminal(ctx, pos) → {index,x,y,z,arrival,found}              ölümde en yakın BULUNMUŞ terminal (0 her zaman bulunmuştur)
 *   splitBoundItems(inv, opts?) → {keep, keepArmor, bound, boundSlots, boundArmor}   `dimBound` eşyaları ayırır (SAF; değiştirmez)
 *   takeBoundItems(inv, opts?) → {bound}            canlı Inventory'den boyuta bağlı eşyaları alır (yığına konmak üzere)
 *   returnStash(inv, stash) → {returned, rest}      yığını envantere geri verir; sığmayan `rest`te kalır (asla kaybolmaz)
 *   registerDimBound(dim, keys) / unregisterDimBound(dim?) / dimBoundOf(itemKey)
 *   markTerminalFound(terminals, i) / isTerminalFound(maskOrTerminals, i) / foundTerminalCount(mask)
 *   GATE_RULES, CORE_ITEM, CELL_ITEM, TRAVEL_MESSAGES
 *
 * Girdi sözleşmeleri
 *   state = {mode, dim:'overworld'|'neon', abilities:{portalGun}, dimMeta:{calibrated,lastHopAt}, hasCore:bool|sayı,
 *            charge:sayı (Portal Tabancası şarjı), cells:sayı (Enerji Hücresi; çantadan +12 şarj yükler)}
 *   ctx   = {time (G.time.seconds), lastGateAt?, transitioning?, inParkour?, inPuzzle?, inBoss?, inSealAltar?, underwater?,
 *            zoneUnlocked? (varsayılan true), spot? (gateSpot sonucu; undefined → değerlendirme dışı), kind? ('out'|'back'),
 *            terminalReturn? (Boyut Terminali'nden ücretsiz dönüş)}
 * Kapı sabitleri: açma bekleme 5 sn, atlama arası 20 sn (terminal dönüşü muaf), ömür 30 sn, başarısızlık maliyet almaz.
 */
import {
  B, BLOCKS, LIQUID_LUT, SOLID_LUT,
} from '../blocks.js';
import { itemByKey } from '../items.js';
import { ITEM_CELL } from '../techData.js';
import { getDim, TERMINAL_COUNT } from './dimensions.js';

export const CORE_ITEM = 'item:kuantum_çekirdeği';
export const CELL_ITEM = ITEM_CELL;
export const GATE_RULES = Object.freeze({
  cost: 12,
  ttl: 30,
  openCooldown: 5,
  hopCooldown: 20,
  calibrateSecs: 3,
  w: 3,
  h: 4,
  d: 1,
  aheadFirst: 4,
  aheadMax: 10,
});

export const TRAVEL_MESSAGES = Object.freeze({
  mod: 'Boyut kapısı yalnızca macera modunda açılır.',
  yetenek: 'Boyut kapısı için Portal Tabancası yeteneğini açmalısın.',
  gecis: 'Boyut geçişi sürüyor.',
  parkur: 'Parkur sırasında boyut kapısı kapalı: yarışma adil kalsın.',
  bulmaca: 'Bulmaca odalarında boyut kapısı açılamaz.',
  boss: 'Boss arenasında boyut kapısı açılamaz.',
  muhur: 'Mühür sunağının yanında boyut kapısı açılamaz.',
  sualti: 'Su altında boyut kapısı açılamaz.',
  bolge: 'Mühürlü bölgede boyut kapısı açılamaz.',
  kalibrasyon: 'Portal Tabancasını boyutlara kalibre etmek için bir Kuantum Çekirdeği gerekli.',
  sarj: 'Boyut kapısı için 12 portal şarjı gerekli (1 Enerji Hücresi 12 şarj yükler).',
  bekleme: 'Kapı hazırlanıyor: {n} sn bekle.',
  atlama: 'Boyutlar arası atlama için {n} sn daha bekle.',
  yer: 'Buraya kapı açılamaz: 3×4 blokluk boş bir alan gerekli.',
});

function fail(reason, extra) {
  const n = extra && extra.wait !== undefined ? Math.max(1, Math.ceil(extra.wait)) : 0;
  const out = { ok: false, reason, message: TRAVEL_MESSAGES[reason].replace('{n}', String(n)) };
  if (extra && extra.wait !== undefined) out.wait = extra.wait;
  return out;
}

/**
 * Maliyet. Varsayılan: 12 şarj; boyut kalibre değilse ayrıca 1 Kuantum Çekirdeği (ilk açılış = "Kalibrasyon", 3 sn).
 * opts.free: Boyut Terminali'nden ücretsiz `back` kapısı → hiçbir maliyet yok.
 */
export function gateCost(state, opts) {
  if (opts && opts.free === true) return { charges: 0, core: 0, calibrate: false, free: true };
  const calibrated = !!(state && state.dimMeta && state.dimMeta.calibrated === true);
  return {
    charges: GATE_RULES.cost, core: calibrated ? 0 : 1, calibrate: !calibrated, free: false,
  };
}

/** Geçen süre (sn); saat geri sarılmışsa (yeni oturum, kayıtlı eski zaman) bekleme bitmiş sayılır → Infinity. */
function elapsed(now, then) {
  if (!Number.isFinite(now) || !Number.isFinite(then)) return Infinity;
  const e = now - then;
  return e < 0 ? Infinity : e;
}

/**
 * Kapı açılabilir mi? Sıra (ilk başarısız kural döner): mod, yetenek, geçiş sürüyor, parkur, bulmaca, boss, mühür sunağı, su altı,
 * bölge kilidi, kalibrasyon (yalnız `out`), şarj, açma beklemesi, atlama beklemesi (terminal dönüşü muaf), boş hacim.
 * Terminal dönüşünde (ctx.terminalReturn) yetenek/şarj/çekirdek/atlama beklemesi aranmaz; mod, geçiş, açma beklemesi ve yer aranır.
 */
export function canOpenGate(state, ctx) {
  const s = state || {};
  const c = ctx || {};
  const dim = s.dim === 'neon' ? 'neon' : 'overworld';
  const kind = c.kind === 'out' || c.kind === 'back' ? c.kind : dim === 'neon' ? 'back' : 'out';
  const free = c.terminalReturn === true;
  const meta = s.dimMeta || {};
  if (s.mode !== 'macera') return fail('mod');
  if (!free && !(s.abilities && s.abilities.portalGun)) return fail('yetenek');
  if (c.transitioning) return fail('gecis');
  if (c.inParkour) return fail('parkur');
  if (c.inPuzzle) return fail('bulmaca');
  if (c.inBoss) return fail('boss');
  if (c.inSealAltar) return fail('muhur');
  if (c.underwater) return fail('sualti');
  if (c.zoneUnlocked === false) return fail('bolge');
  if (!free) {
    if (kind === 'out' && meta.calibrated !== true) {
      const core = typeof s.hasCore === 'number' ? s.hasCore > 0 : s.hasCore === true;
      if (!core) return fail('kalibrasyon');
    }
    const charge = Number.isFinite(s.charge) ? s.charge : 0;
    const cells = Number.isFinite(s.cells) ? s.cells : 0;
    if (!(charge >= GATE_RULES.cost || cells >= 1)) return fail('sarj');
  }
  if (c.lastGateAt !== undefined && c.lastGateAt !== null) {
    const e = elapsed(c.time, c.lastGateAt);
    if (e < GATE_RULES.openCooldown) return fail('bekleme', { wait: GATE_RULES.openCooldown - e });
  }
  if (!free && meta.lastHopAt > 0) {
    const e = elapsed(c.time, meta.lastHopAt);
    if (e < GATE_RULES.hopCooldown) return fail('atlama', { wait: GATE_RULES.hopCooldown - e });
  }
  if (c.spot === null) return fail('yer');
  return {
    ok: true,
    reason: null,
    message: null,
    kind,
    dest: kind === 'out' ? 'neon' : 'overworld',
    cost: gateCost(s, { free }),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Kapı konumu
 * ---------------------------------------------------------------------------------------------- */
const SEAL = B.SEAL_BARRIER;
const PORTAL_BLUE = B.PORTAL_BLUE;
const PORTAL_ORANGE = B.PORTAL_ORANGE;

function passable(id) {
  if (id === null || id === undefined) return false; // yüklenmemiş
  if (id === 0) return true;
  return SOLID_LUT[id] === 0 && LIQUID_LUT[id] === 0 && id !== SEAL && id !== PORTAL_BLUE && id !== PORTAL_ORANGE;
}

function supports(id) {
  if (id === null || id === undefined || id === 0) return false;
  if (SOLID_LUT[id] !== 1 || LIQUID_LUT[id] === 1 || id === SEAL) return false;
  const b = BLOCKS[id];
  return !!b && !(b.damage > 0);
}

function pt(v) {
  if (Array.isArray(v)) return { x: Number(v[0]), y: Number(v[1]), z: Number(v[2]) };
  return { x: Number(v && v.x), y: Number(v && v.y), z: Number(v && v.z) };
}

/** (cx,cz) merkez sütunlu, nx/nz normalli kapı hacmi y0'da boş ve zeminli mi? */
function volumeFits(world, cx, y0, cz, nx, nz, yMin, yMax) {
  if (y0 - 1 < yMin || y0 + GATE_RULES.h - 1 > yMax) return false;
  // genişlik ekseni normale dik: normal x ise genişlik z boyunca, değilse x boyunca
  const wx = nx !== 0 ? 0 : 1;
  const wz = nx !== 0 ? 1 : 0;
  for (let k = -1; k <= 1; k++) {
    const x = cx + wx * k;
    const z = cz + wz * k;
    if (!supports(world.getBlock(x, y0 - 1, z))) return false;
    for (let dy = 0; dy < GATE_RULES.h; dy++) if (!passable(world.getBlock(x, y0 + dy, z))) return false;
  }
  // oyuncu tarafındaki ön hücre (yürüyerek girilebilsin): ayak + baş seviyesi boş
  const fx = cx + nx;
  const fz = cz + nz;
  return passable(world.getBlock(fx, y0, fz)) && passable(world.getBlock(fx, y0 + 1, fz));
}

/**
 * Boyut kapısı konumu: oyuncunun 4 blok önü (olmazsa 10 bloğa kadar yer arar), zemine oturur, oyuncuya dönüktür. Kapı 3 geniş ×4 yüksek ×1 derin;
 * hacim boş (katı/sıvı/mühür/portal yok), altı üç sütunda da katı ve zararsız olmalıdır. Yüklenmemiş hücre dolu sayılır.
 * opts.accept(spot) → bool: aday kapı konumunu çağıran kurallarla (bulmaca/mühür/boss/bölge hücreleri) süzer; false → sıradaki aday.
 * eye: {x,y,z} | [x,y,z] (göz konumu). yaw: oyuncu bakışı (0 = -Z, + sola). Döner {x,y,z,yaw,axis,nx,nz,w,h,d,dist} | null.
 *   x,z = orta sütun merkezi (blok + 0.5), y = ayak seviyesi (ilk boş hücre), yaw = kapının baktığı yön (oyuncuya doğru; 90° nicemli),
 *   axis = kapı normalinin ekseni ('x'|'z'), (nx,nz) = oyuncuya bakan birim normal.
 */
export function gateSpot(world, eye, yaw, opts) {
  if (!world || typeof world.getBlock !== 'function') return null;
  const e = pt(eye);
  if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.z)) return null;
  const yw = Number.isFinite(yaw) ? yaw : 0;
  const fx = -Math.sin(yw);
  const fz = -Math.cos(yw);
  const alongX = Math.abs(fx) >= Math.abs(fz);
  // kapı oyuncuya bakar: normal = ileri yönün tersi (baskın eksende)
  const nx = alongX ? (fx >= 0 ? -1 : 1) : 0;
  const nz = alongX ? 0 : (fz >= 0 ? -1 : 1);
  const yMin = world.yMin !== undefined ? world.yMin : 0;
  const yMax = world.yMax !== undefined ? world.yMax : 127;
  const o = opts || {};
  const accept = typeof o.accept === 'function' ? o.accept : null;
  const first = o.ahead > 0 ? o.ahead : GATE_RULES.aheadFirst;
  const order = [first];
  for (let d = 3; d <= GATE_RULES.aheadMax; d++) if (d !== first) order.push(d);
  // zemin en çok oyuncunun ayak seviyesinin 1 üstü (basamak) olabilir; en çok 8 blok aşağıya oturur
  const topY = Math.floor(e.y - 1.5) + 1;
  for (let i = 0; i < order.length; i++) {
    const d = order[i];
    const cx = Math.floor(e.x + fx * d);
    const cz = Math.floor(e.z + fz * d);
    for (let y0 = topY; y0 >= topY - 8; y0--) {
      if (!volumeFits(world, cx, y0, cz, nx, nz, yMin, yMax)) continue;
      const spot = {
        x: cx + 0.5,
        y: y0,
        z: cz + 0.5,
        yaw: Math.atan2(0 - nx, 0 - nz),
        axis: alongX ? 'x' : 'z',
        nx,
        nz,
        w: GATE_RULES.w,
        h: GATE_RULES.h,
        d: GATE_RULES.d,
        dist: d,
      };
      if (accept && !accept(spot)) continue; // örn. bulmaca odası / mühürlü bölge / boss arenası hücresi
      return spot;
    }
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Varış / terminaller
 * ---------------------------------------------------------------------------------------------- */
/** Terminal 0 = Kapı Meydanı merkezi (sokak seviyesi y=64). */
const DEFAULT_TERMINAL = Object.freeze({ x: 0, y: 64, z: 0 });

/**
 * Boyut varış noktası (ayak konumu + bakış). 'neon': terminalin 2 blok önü, meydan merkezine bakar (terminal verilmezse terminal 0 =
 * (0,64,0) → (0.5, 64, 2.5), yaw 0 = terminale/merkeze bakar). 'overworld': null (varış = `dimMeta.link.from` ya da dünya doğuşu).
 * terminal: {x,y,z} | [x,y,z] (bulunmuş terminal). Merkezden uzak terminalde önü = merkeze doğru yön.
 */
export function arrivalPoint(dim, terminal) {
  const d = getDim(dim);
  if (d === null || d.id !== 'neon') return null;
  const t = terminal ? pt(terminal) : DEFAULT_TERMINAL;
  const tx = Number.isFinite(t.x) ? t.x : 0;
  const ty = Number.isFinite(t.y) ? t.y : 64;
  const tz = Number.isFinite(t.z) ? t.z : 0;
  // (dx,dz): terminalden meydan merkezine birim yön (önü); merkezdeyse güneye (+z)
  let dx = -tx;
  let dz = -tz;
  const l = Math.sqrt(dx * dx + dz * dz);
  let lx;
  let lz;
  if (l < 0.5) {
    dx = 0;
    dz = 1;
    lx = 0; // terminal merkezde: 2 blok güneyde durur, terminale/merkeze (−z) bakar → yaw 0
    lz = -1;
  } else {
    dx /= l;
    dz /= l;
    lx = dx; // uzak terminal: terminal ile merkez arasında durur, merkeze bakar
    lz = dz;
  }
  return {
    x: Math.floor(tx) + 0.5 + Math.round(dx * 2),
    y: ty,
    z: Math.floor(tz) + 0.5 + Math.round(dz * 2),
    yaw: Math.atan2(0 - lx, 0 - lz),
  };
}

export function isTerminalFound(maskOrTerminals, i) {
  const mask = maskOrTerminals && typeof maskOrTerminals === 'object' ? maskOrTerminals.found : maskOrTerminals;
  if (!Number.isInteger(i) || i < 0 || i >= TERMINAL_COUNT) return false;
  if (i === 0) return true; // Kapı Meydanı terminali her zaman bulunmuştur
  return (((Number(mask) | 0) >>> i) & 1) === 1;
}

/** Terminali bulunmuş işaretler (terminals.found yerinde güncellenir). Yeni bulunduysa true. */
export function markTerminalFound(terminals, i) {
  if (!terminals || !Number.isInteger(i) || i < 0 || i >= TERMINAL_COUNT) return false;
  const mask = (Number(terminals.found) | 0) & 0xffff;
  const bit = 1 << i;
  if ((mask & bit) !== 0) return false;
  terminals.found = (mask | bit) & 0xffff;
  return true;
}

export function foundTerminalCount(mask) {
  let n = 0;
  for (let i = 0; i < TERMINAL_COUNT; i++) if (isTerminalFound(mask, i)) n++;
  return n;
}

/**
 * Şehir ölümünde yeniden doğma terminali: ctx = {terminals:{found,list}} | {found,list}; list[i] = {x,y,z} | [x,y,z] (16 terminal).
 * Yalnız bulunmuş terminaller (0 her zaman); en yakın (3B uzaklık), eşitlikte küçük indeks. Liste yoksa terminal 0.
 * Döner {index,x,y,z,arrival,found}.
 */
export function respawnTerminal(ctx, pos) {
  const tm = ctx && ctx.terminals && typeof ctx.terminals === 'object' ? ctx.terminals : ctx || {};
  const list = Array.isArray(tm.list) ? tm.list : null;
  const p = pos ? pt(pos) : DEFAULT_TERMINAL;
  const px = Number.isFinite(p.x) ? p.x : 0;
  const py = Number.isFinite(p.y) ? p.y : 64;
  const pz = Number.isFinite(p.z) ? p.z : 0;
  let best = 0;
  let bestD = Infinity;
  const n = list ? Math.min(list.length, TERMINAL_COUNT) : 1;
  for (let i = 0; i < n; i++) {
    if (!isTerminalFound(tm.found, i)) continue;
    const t = list && list[i] ? pt(list[i]) : DEFAULT_TERMINAL;
    if (!Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z)) continue;
    const d = (t.x - px) * (t.x - px) + (t.y - py) * (t.y - py) + (t.z - pz) * (t.z - pz);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const t = list && list[best] ? pt(list[best]) : DEFAULT_TERMINAL;
  const tx = Number.isFinite(t.x) ? t.x : 0;
  const ty = Number.isFinite(t.y) ? t.y : 64;
  const tz = Number.isFinite(t.z) ? t.z : 0;
  return {
    index: best, x: tx, y: ty, z: tz, arrival: arrivalPoint('neon', { x: tx, y: ty, z: tz }), found: isTerminalFound(tm.found, best),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Boyuta bağlı eşyalar (§15)
 * ---------------------------------------------------------------------------------------------- */
const BOUND = new Map(); // dim → Set(itemKey)

/** Boyuta bağlı eşya anahtarlarını kaydeder (items.js `dimBound` alanının yanı sıra). */
export function registerDimBound(dim, keys) {
  if (typeof dim !== 'string' || !Array.isArray(keys)) return;
  let set = BOUND.get(dim);
  if (!set) {
    set = new Set();
    BOUND.set(dim, set);
  }
  for (let i = 0; i < keys.length; i++) if (typeof keys[i] === 'string') set.add(keys[i]);
}

/** Kaydı siler (test/araç); dim verilmezse tümü. */
export function unregisterDimBound(dim) {
  if (dim === undefined) BOUND.clear();
  else BOUND.delete(dim);
}

/** Eşyanın bağlı olduğu boyut ('neon') | null. */
export function dimBoundOf(itemKey) {
  const it = itemByKey(itemKey);
  if (it && typeof it.dimBound === 'string') return it.dimBound;
  const key = it ? it.key : itemKey;
  let found = null;
  BOUND.forEach((set, dim) => {
    if (found === null && set.has(key)) found = dim;
  });
  return found;
}

function slotOf(s) {
  if (!s) return null;
  if (Array.isArray(s)) {
    if (typeof s[0] !== 'string') return null;
    const o = { item: s[0], count: Number(s[1]) };
    if (s[2] !== undefined && s[2] !== 0) o.dur = s[2];
    if (s[3]) o.ench = s[3];
    if (s[4] !== undefined) o.charge = s[4];
    return o;
  }
  if (typeof s === 'object' && typeof s.item === 'string') return s;
  return null;
}

function entryOf(s) {
  const e = { item: s.item, count: Number.isFinite(s.count) && s.count >= 1 ? Math.floor(s.count) : 1 };
  if (s.dur !== undefined) e.dur = s.dur;
  if (s.ench) e.ench = s.ench;
  if (s.charge !== undefined) e.charge = s.charge;
  return e;
}

/**
 * Envanteri (Inventory | toJSON nesnesi | slot dizisi) boyuta bağlı ve kalan olarak ayırır; girdiyi DEĞİŞTİRMEZ.
 * opts.dim (varsayılan 'neon'); opts.resolve(itemKey) → boyut | null (varsayılan dimBoundOf).
 * Döner: keep (slot dizisi; bağlı yuvalar null), keepArmor, bound ([{item,count,dur?,ench?,charge?}]), boundSlots (indeksler), boundArmor.
 */
export function splitBoundItems(inv, opts) {
  const o = opts || {};
  const dim = typeof o.dim === 'string' ? o.dim : 'neon';
  const resolve = typeof o.resolve === 'function' ? o.resolve : dimBoundOf;
  const slots = Array.isArray(inv) ? inv : inv && Array.isArray(inv.slots) ? inv.slots : [];
  const armor = !Array.isArray(inv) && inv && Array.isArray(inv.armor) ? inv.armor : [];
  const out = {
    keep: [], keepArmor: [], bound: [], boundSlots: [], boundArmor: [],
  };
  const run = (arr, keep, idxList) => {
    for (let i = 0; i < arr.length; i++) {
      const s = slotOf(arr[i]);
      if (s !== null && resolve(s.item) === dim) {
        out.bound.push(entryOf(s));
        idxList.push(i);
        keep.push(null);
      } else {
        keep.push(arr[i]);
      }
    }
  };
  run(slots, out.keep, out.boundSlots);
  run(armor, out.keepArmor, out.boundArmor);
  return out;
}

/**
 * Canlı Inventory'den boyuta bağlı eşyaları alır (yuvaları boşaltır, değişikliği bildirir). Döner {bound:[...]}: çağıran bunu
 * `ctx.stash`e ekler. Bağlı eşya yoksa envanter hiç değişmez.
 */
export function takeBoundItems(inv, opts) {
  const sp = splitBoundItems(inv, opts);
  if (sp.bound.length === 0 || !inv || !Array.isArray(inv.slots)) return { bound: [] };
  for (let i = 0; i < sp.boundSlots.length; i++) inv.slots[sp.boundSlots[i]] = null;
  if (Array.isArray(inv.armor)) for (let i = 0; i < sp.boundArmor.length; i++) inv.armor[sp.boundArmor[i]] = null;
  if (typeof inv._emit === 'function') inv._emit();
  return { bound: sp.bound };
}

/**
 * Yığındaki eşyaları envantere geri verir. Sığmayan kısım `rest`te kalır (kaybolmaz; bir sonraki girişte yine denenir).
 * Döner {returned:[{item,count}], rest:[...]}.
 */
export function returnStash(inv, stash) {
  const returned = [];
  const rest = [];
  const list = Array.isArray(stash) ? stash : [];
  for (let i = 0; i < list.length; i++) {
    const e = slotOf(list[i]);
    if (e === null || !inv || typeof inv.addStack !== 'function') {
      if (e !== null) rest.push(entryOf(e));
      continue;
    }
    const n = Number.isFinite(e.count) && e.count >= 1 ? Math.floor(e.count) : 1;
    const left = inv.addStack(e.item, n, e.dur, e.ench, e.charge);
    if (n - left > 0) returned.push({ item: e.item, count: n - left });
    if (left > 0) {
      const r = entryOf(e);
      r.count = left;
      rest.push(r);
    }
  }
  return { returned, rest };
}
