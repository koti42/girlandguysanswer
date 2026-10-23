/*
 * KEŞİF sim/city/interior — interiors_a (kapsül daire, loft, hacker odası, oyuncu odası, ramen barı, klinik) ORTAK YARDIMCILARI.
 * Saf, belirlenimci, worker-güvenli. Tür dosyaları (kinds/*.js) bunu içe aktarır; index.js'i içe aktarmaz. Yerel koordinat: frame.js (u sağa, v içeri, ly yön 0..3).
 *
 *  YERLEŞİM   put(b,key,uc,vc,ly,o) SÜREKLİ merkezde · against(b,key,room,side,along,o) duvara yaslı mobilya (ön yüz duvardan uzak) · wallAt(...) duvar propu ·
 *             seatAt · chairFor(b,masa,key) masanın önüne ona dönük oturak · againstTry/putTry/wallTry aday listeleri · fitAgainst/fitWall/fitFloor(b,rng,room,key)
 *             kapsamlı arama (kapı önü otomatik reddedilir) · scatter* · topUp(b,rng,odalar,anahtarlar,min,duvarAnahtarları) sayıyı tamamlar · ensure(b,rng,key,odalar) zorunlu mobilya
 *  BÜTÇE      capKeys(b,maxAnahtar,maxProp,çekirdek) yerleşim sırasında anahtar/sayı sınırı · trimProps(it,çekirdek,korunanSlotlar) son süzgeç (≤ 40 prop, ≤ 14 anahtar)
 *  ÇAPALAR    deferSignature/deferChip/deferPost: imza eşya (masa üstü), çip, sahip duruşu TÜM proplar yerleştikten sonra serbest hücrede seçilir (runDeferred)
 *  KİLİT      lockOf(lotId,n,tür,kademe,veri) → locks.makeLock · linkLocks(it): düzenek slotu (pad), ipucu notuna kod paketi (packCode), Interior.clues kaydı
 *  ÇIKTI      finishInterior(b,o): Interior + mood · ambient · layout · locks · clues · ownerPost · anchors[owner,vendor] · hidden · kindOwnerId; NO_LOCK (süs not data=0)
 *  YAYIM      paintWalls(kit,it,fn) bölme duvarı boyama · frameDoors(kit,it,pal,o) kapı/kemer söve+lento (autoDoors:false türler) · holoPanel(...)
 *  PLAN       mkPal(taban,o) · usableRect(frame) (kule çekirdeği farkında) · twoPass(ctx,rng,build) koruma kapalı hızlı plan, yetmezse koruma açık yeniden plan
 */
import { getCatalogDef } from '../../props/propCatalog.js';
import { OWNER_BY_INTERIOR } from '../ownerData.js';
import { stream } from '../cityPlanKit.js';
import { ID } from '../cityEmit.js';
import { planReachability } from './graph.js';
import { makeLock } from './locks.js';
import { GUARD_MIN } from './builder.js';
import { PALETTES } from './kit.js';

export function mkPal(base, o) {
  return Object.freeze(Object.assign({}, PALETTES.default, PALETTES[base] || {}, o || {}));
}

/** Engel farkında kullanılabilir yerel dikdörtgen (yarı açık). Kule çekirdeği arka duvardan taşarsa derinlik kırpılır (1 duvar hücresi bırakılır). */
export function usableRect(frame) {
  let v1 = frame.D;
  const ob = frame.obstacles;
  for (let i = 0; i < ob.length; i++) v1 = Math.min(v1, ob[i].v0 - 1);
  return [0, 0, frame.W, Math.max(0, v1)];
}

/** yerel (fu,fv) yönüne en yakın ly kodu: 0 içeri (+v) · 1 sağ (+u) · 2 kapı (-v) · 3 sol (-u). */
export function facing(fromU, fromV, toU, toV) {
  const du = toU - fromU;
  const dv = toV - fromV;
  if (Math.abs(du) > Math.abs(dv)) return du > 0 ? 1 : 3;
  return dv >= 0 ? 0 : 2;
}

/** Sürekli yerel merkez (uc,vc) → b.prop(hücre + hücre içi kayma). */
export function put(b, key, uc, vc, ly, o) {
  const u = Math.floor(uc + 1e-9);
  const v = Math.floor(vc + 1e-9);
  const op = Object.assign({}, o);
  op.du = (op.du || 0) + (uc - u - 0.5);
  op.dv = (op.dv || 0) + (vc - v - 0.5);
  const r = b.prop(key, u, v, ly, op);
  if (r) Object.defineProperty(r, '_l', { value: { u: uc, v: vc, ly }, enumerable: false });
  return r;
}

function depthOf(key) {
  const d = getCatalogDef(key);
  return d ? d.size[2] : 1;
}

/** Duvara yaslı kat mobilyası: side = duvarın yönü (0 +v, 1 +u, 2 -v, 3 -u); along = duvar boyunca merkez (sürekli). */
export function against(b, key, room, side, along, o) {
  const op = o || {};
  const gap = op.gap || 0;
  const dep = depthOf(key) / 2 + gap;
  const ly = op.ly !== undefined ? op.ly : (side + 2) & 3;
  const s = side & 3;
  let uc;
  let vc;
  if (s === 0) { uc = along; vc = room.v1 - dep; }
  else if (s === 2) { uc = along; vc = room.v0 + dep; }
  else if (s === 1) { uc = room.u1 - dep; vc = along; }
  else { uc = room.u0 + dep; vc = along; }
  return put(b, key, uc, vc, ly, op);
}

/** Duvara monte prop. along: duvar boyunca sürekli konum. o.y satır yüksekliği (varsayılan 1). */
export function wallAt(b, key, room, side, along, o) {
  const s = side & 3;
  let u;
  let v;
  const op = Object.assign({}, o);
  if (s === 0 || s === 2) {
    u = Math.floor(along + 1e-9);
    v = s === 0 ? room.v1 - 1 : room.v0;
    op.du = (op.du || 0) + (along - u - 0.5);
  } else {
    v = Math.floor(along + 1e-9);
    u = s === 1 ? room.u1 - 1 : room.u0;
    op.dv = (op.dv || 0) + (along - v - 0.5);
  }
  return b.wallProp(key, u, v, s, op);
}

/** Oturak: (uc,vc) merkezinde, bakışı (tu,tv) noktasına. */
export function seatAt(b, key, uc, vc, tu, tv, o) {
  return put(b, key, uc, vc, facing(uc, vc, tu, tv), o);
}

/** Hücre (u,v) serbest mi (hiçbir çarpışma kutusu kesmiyor). */
export function cellFree(b, u, v, row) {
  const c = b.frame.cell(u, v);
  const bx = b._boxes;
  const y0 = b.base + (row || 0);
  for (let i = 0; i < bx.length; i++) {
    const q = bx[i].box;
    if (q[0] < c[0] + 1 && q[3] > c[0] && q[2] < c[1] + 1 && q[5] > c[1] && q[4] > y0 + 0.05 && q[1] < y0 + 1.8) return false;
  }
  return true;
}

/** Odada (tercihen pref [u,v] yakınında) serbest, kapı önü dışı bir hücre. */
export function freeCell(b, room, pref, o) {
  const loose = !!(o && o.loose);
  const f = b.frame;
  const dc = f.door;
  let best = null;
  let bd = 1e9;
  for (let v = room.v0; v < room.v1; v++) {
    for (let u = room.u0; u < room.u1; u++) {
      if (f.isObstacle(u, v)) continue;
      if (b._used && b._used.has((room.y0 || 0) + ':' + u + ',' + v)) continue;
      if (!loose && u >= dc.u - 2 && u <= dc.u + 2 && v <= 2) continue;
      if (!cellFree(b, u, v, room.y0)) continue;
      // iç kapı önleri
      let nearDoor = false;
      if (loose) { /* çip/imza gibi çarpışmasız noktalar kapı önünde de durabilir */ }
      const ds = b._doors;
      for (let i = 0; i < ds.length && !nearDoor && !loose; i++) {
        const d = ds[i];
        if (d.from || d.lu === undefined) continue;
        if (Math.abs(d.lu - u) <= 2 && Math.abs(d.lv - v) <= 2) nearDoor = true;
      }
      if (nearDoor) continue;
      const dist = pref ? Math.abs(pref[0] - u) + Math.abs(pref[1] - v) : v * 0.01 + u * 0.001;
      if (dist < bd) { bd = dist; best = [u, v]; }
    }
  }
  return best;
}

/** Kilit kaydı: kimlik DIM_ID_RE uyumlu (l + 4 haneli lotId(36) + sıra). */
export function lockOf(lotId, n, kind, tier, data) {
  const s = (lotId >>> 0).toString(36);
  return makeLock('l' + ('0000' + s).slice(-4) + n, kind, tier, data || {});
}

export function ownerPost(b, u, v, ly, roomId) {
  const f = b.frame;
  const c = f.pt(Math.floor(u), Math.floor(v));
  return { x: c[0], y: b.base, z: c[1], yaw: f.yaw(ly), room: roomId };
}

/** Odalardaki ışık düzeni: spec [[odaId, tür, adet]…]. */
export function lightRooms(b, spec) {
  for (let i = 0; i < spec.length; i++) b.lightGrid(spec[i][0], spec[i][2], spec[i][1]);
}

/**
 * Interior'u bitirir: b.build() + variant moodu + ortam sesi + yerleşim verisi + kilit listesi + sahip konumu.
 * o: {layout, locks, ownerPost, mood:{hue,light}, hidden}
 */
export function finishInterior(b, o) {
  runDeferred(b);
  const it = b.build();
  trimProps(it, o.core || [], (o.locks || []).map((l) => (l.clue && l.clue.slot !== undefined ? l.clue.slot : -1)).concat([b._sigHost === undefined ? -1 : b._sigHost]));
  const ow = OWNER_BY_INTERIOR[b.kind];
  const base = ow ? ow.mood : { hue: 'beyaz', light: 10, ambient: 'vent' };
  const mo = o.mood || {};
  it.mood = { hue: mo.hue || base.hue, light: mo.light || base.light, ambient: base.ambient };
  it.ambient = base.ambient;
  it.layout = o.layout || null;
  it.locks = (o.locks || []).map((l) => Object.assign({}, l));
  linkLocks(it);
  it.ownerPost = o.ownerPost || null;
  // çapalar (interiors_b/c ile ortak şema): sahip duruşu + satış tezgâhları
  it.anchors = [];
  if (it.ownerPost) it.anchors.push(Object.assign({ type: 'owner' }, it.ownerPost));
  (o.vendorKeys || []).forEach((key) => {
    it.props.filter((p) => p.kind === key).forEach((p) => {
      const rm = it.rooms.find((r) => p.x >= r.x0 && p.x < r.x1 && p.z >= r.z0 && p.z < r.z1 && p.y >= r.y0 - 0.5 && p.y < r.y1);
      it.anchors.push({
        type: 'vendor', key, x: p.x, y: p.y, z: p.z, yaw: p.yaw, room: rm ? rm.id : null,
      });
    });
  });
  it.hidden = o.hidden || null;
  it.kindOwnerId = ow ? ow.id : null;
  return it;
}

/** Bölme-duvar hücrelerini boyar. fn(u,v,y,H) → blok | undefined(dokunma). Yalnız dikdörtgen içi, odaların DIŞI, çekirdek dışı hücreler. */
export function paintWalls(kit, interior, fn) {
  const L = interior.layout;
  const f = kit.f;
  const rs = L.rooms;
  const H = f.H;
  for (let v = 0; v < f.D; v++) {
    for (let u = 0; u < f.W; u++) {
      let inside = false;
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i];
        if (u >= r[0] && u < r[2] && v >= r[1] && v < r[3]) { inside = true; break; }
      }
      if (inside || (f.solids.length && f.isSolid(u, v))) continue;
      // yazılacak yükseklik: kat satırları 0..H-1 (zemin/tavan prepareVolume'un)
      for (let y = 0; y < H; y++) {
        const id = fn(u, v, y, H);
        if (id !== undefined && id !== null) kit.set(u, v, y, id);
      }
    }
  }
}

/** layout.rooms (yerel [u0,v0,u1,v1,y0,y1,id]) listesi için yardımcı: builder odalarından. */
export function roomRects(b) {
  return b.rooms.map((r) => [r.u0, r.v0, r.u1, r.v1, r.y0, r.y1, r.id]);
}

/** Odanın tam 1 kalın çevre duvarında (iç yüz) ince bir desen: kit.set ile tek satır boyar (yalnız bölme duvarı hücreleri). */
export function inRoom(rects, u, v) {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (u >= r[0] && u < r[2] && v >= r[1] && v < r[3]) return r;
  }
  return null;
}

/** Rastgele bir duvar boyunca (cell-hizalı) `against` dener; yerleşirse spec döner. sides: izinli duvar yönleri (varsayılan hepsi). */
export function scatterAgainst(b, rng, room, key, o) {
  const op = o || {};
  const sides = op.sides || [0, 1, 2, 3];
  const tries = op.tries || 14;
  for (let t = 0; t < tries; t++) {
    const s = sides[rng.i(sides.length)];
    const horiz = s === 0 || s === 2;
    const lo = horiz ? room.u0 : room.v0;
    const hi = horiz ? room.u1 : room.v1;
    const half = (op.span || 1) / 2;
    const span = hi - lo - (op.span || 1);
    if (span < 0) continue;
    const along = lo + half + (op.snap === false ? rng.f() * span : Math.floor(rng.f() * (span + 1)));
    const r = against(b, key, room, s, along, op);
    if (r) return r;
  }
  return null;
}

/** Duvara monte prop'u rastgele duvara dener. */
export function scatterWall(b, rng, room, key, o) {
  const op = o || {};
  const sides = op.sides || [0, 1, 2, 3];
  const tries = op.tries || 14;
  for (let t = 0; t < tries; t++) {
    const s = sides[rng.i(sides.length)];
    const horiz = s === 0 || s === 2;
    const lo = horiz ? room.u0 : room.v0;
    const hi = horiz ? room.u1 : room.v1;
    const w = op.span || 1;
    const span = hi - lo - w;
    if (span < 0) continue;
    const along = lo + w / 2 + Math.floor(rng.f() * (span + 1));
    const r = wallAt(b, key, room, s, along, op);
    if (r) return r;
  }
  return null;
}

/** Odanın serbest hücrelerinden birine (rastgele) kat propu koyar (ly rastgele); dekor serpiştirme. */
export function scatterFloor(b, rng, room, key, o) {
  const op = o || {};
  const tries = op.tries || 16;
  for (let t = 0; t < tries; t++) {
    const u = room.u0 + rng.i(room.u1 - room.u0);
    const v = room.v0 + rng.i(room.v1 - room.v0);
    const r = b.prop(key, u, v, op.ly !== undefined ? op.ly : rng.i(4), op);
    if (r) return r;
  }
  return null;
}

/** Sayacı (keys listesinden) en az `min` yerleşime tamamlar: önce duvara yaslı, sonra serbest. Dönen: eklenen sayı. */
export function topUp(b, rng, rooms, keys, min, wallKeys) {
  let added = 0;
  let guard = 0;
  while (b._props.length < min && guard++ < 260) {
    const room = rooms[rng.i(rooms.length)];
    const wk = wallKeys && wallKeys.length && rng.chance(guard > 60 ? 0.8 : 0.4);
    const pool = wk ? wallKeys : keys;
    const key = pool[rng.i(pool.length)];
    const def = getCatalogDef(key);
    if (!def) continue;
    let r = null;
    if (def.mount === 'wall') r = scatterWall(b, rng, room, key, { y: def.size[1] > 1.6 ? 1 : 1 + rng.i(2) * 0.25 });
    else if (def.mount === 'ceiling') r = null;
    else if (def.mount === 'surface') r = null;
    else r = rng.chance(0.6) ? scatterAgainst(b, rng, room, key) : scatterFloor(b, rng, room, key);
    if (r) added++;
  }
  return added;
}

/** against, ama aday `along` listesinden ilk yerleşeni kullanır. */
export function againstTry(b, key, room, side, alongs, o) {
  for (let i = 0; i < alongs.length; i++) {
    const r = against(b, key, room, side, alongs[i], o);
    if (r) return r;
  }
  return null;
}

/** put, ama aday merkez listesi [[uc,vc],…] içinden ilk yerleşeni kullanır. */
export function putTry(b, key, cands, ly, o) {
  for (let i = 0; i < cands.length; i++) {
    const r = put(b, key, cands[i][0], cands[i][1], ly, o);
    if (r) return r;
  }
  return null;
}

/** wallAt, ama aday konum listesi. */
export function wallTry(b, key, room, side, alongs, o) {
  for (let i = 0; i < alongs.length; i++) {
    const r = wallAt(b, key, room, side, alongs[i], o);
    if (r) return r;
  }
  return null;
}

const LDIR = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/** Bir mobilyanın (put/against ile yerleşmiş) ÖN tarafına, ona dönük bir oturak koyar. dist: mobilya kenarından uzaklık (varsayılan 0.55). */
export function chairFor(b, tableSpec, key, o) {
  const op = o || {};
  const l = tableSpec && tableSpec._l;
  if (!l) return null;
  const tdef = getCatalogDef(tableSpec.kind);
  const dep = (tdef ? tdef.size[2] : 1) / 2;
  const cdef = getCatalogDef(key);
  const cd = cdef ? cdef.size[2] / 2 : 0.3;
  const dist = (op.dist === undefined ? 0.1 : op.dist) + cd;
  const d = LDIR[l.ly & 3];
  const off = op.side || 0;
  const pd = LDIR[(l.ly + 1) & 3];
  const u = l.u + d[0] * (dep + dist) + pd[0] * off;
  const v = l.v + d[1] * (dep + dist) + pd[1] * off;
  return put(b, key, u, v, (l.ly + 2) & 3, op);
}

function shuffled(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.i(i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** Mobilyayı odanın herhangi bir duvarına yaslar (rng karıştırmalı kapsamlı arama; kapı önleri otomatik reddedilir). o.sides, o.step (0.5 | 1). */
export function fitAgainst(b, rng, room, key, o) {
  const op = o || {};
  const sides = op.sides || [0, 1, 2, 3];
  const step = op.step || 1;
  const def = getCatalogDef(key);
  const wd = def ? def.size[0] : 1;
  const cands = [];
  for (let si = 0; si < sides.length; si++) {
    const s = sides[si];
    const horiz = s === 0 || s === 2;
    const lo = (horiz ? room.u0 : room.v0) + wd / 2;
    const hi = (horiz ? room.u1 : room.v1) - wd / 2;
    for (let a = lo; a <= hi + 1e-9; a += step) cands.push([s, a]);
  }
  const list = shuffled(rng, cands);
  for (let i = 0; i < list.length; i++) {
    const r = against(b, key, room, list[i][0], list[i][1], op);
    if (r) return r;
  }
  return null;
}

/** Duvara monte prop'u odanın herhangi bir duvarına dener. */
export function fitWall(b, rng, room, key, o) {
  const op = o || {};
  const sides = op.sides || [0, 1, 2, 3];
  const def = getCatalogDef(key);
  const wd = def ? def.size[0] : 1;
  const cands = [];
  for (let si = 0; si < sides.length; si++) {
    const s = sides[si];
    const horiz = s === 0 || s === 2;
    const lo = (horiz ? room.u0 : room.v0) + wd / 2;
    const hi = (horiz ? room.u1 : room.v1) - wd / 2;
    for (let a = lo; a <= hi + 1e-9; a += 1) cands.push([s, a]);
  }
  const list = shuffled(rng, cands);
  for (let i = 0; i < list.length; i++) {
    const r = wallAt(b, key, room, list[i][0], list[i][1], op);
    if (r) return r;
  }
  return null;
}

/** Kat propunu odanın herhangi bir hücre merkezine dener (ly verilmezse rastgele). */
export function fitFloor(b, rng, room, key, o) {
  const op = o || {};
  const cands = [];
  for (let v = room.v0; v < room.v1; v++) for (let u = room.u0; u < room.u1; u++) cands.push([u + 0.5, v + 0.5]);
  const list = shuffled(rng, cands);
  for (let i = 0; i < list.length; i++) {
    const r = put(b, key, list[i][0], list[i][1], op.ly !== undefined ? op.ly : rng.i(4), op);
    if (r) return r;
  }
  return null;
}

export const MAX_PROPS = 40;
export const MAX_KEYS = 14;

/**
 * Prop bütçesi: en çok MAX_PROPS yerleşim, en çok MAX_KEYS farklı anahtar. Çekirdek (core) anahtarlar, kapı/kilit/ipucu propları ve
 * imza istasyonları asla atılmaz; önce en seyrek süs anahtarı bütünüyle, sonra en bol süs anahtarının son örnekleri atılır.
 */
export function trimProps(it, core, protectSlots) {
  const keep = new Set(core);
  const isHardProp = (p) => {
    const d = getCatalogDef(p.kind);
    if (!d) return true;
    if (d.tags.indexOf('door') >= 0 || d.tags.indexOf('lockpad') >= 0) return true;
    return protectSlots.indexOf(p.slot) >= 0;
  };
  const isHard = (p) => keep.has(p.kind) || isHardProp(p);
  const count = () => {
    const m = {};
    it.props.forEach((p) => { m[p.kind] = (m[p.kind] || 0) + 1; });
    return m;
  };
  let m = count();
  while (Object.keys(m).length > MAX_KEYS) {
    let worst = null;
    Object.keys(m).forEach((k) => {
      const ps = it.props.filter((p) => p.kind === k);
      if (ps.some(isHard)) return;
      if (worst === null || m[k] < m[worst] || (m[k] === m[worst] && k > worst)) worst = k;
    });
    if (worst === null) break;
    it.props = it.props.filter((p) => p.kind !== worst);
    m = count();
  }
  while (it.props.length > MAX_PROPS) {
    m = count();
    let pick = null;
    for (let i = it.props.length - 1; i >= 0; i--) {
      const p = it.props[i];
      if (isHardProp(p) || m[p.kind] <= 1) continue;
      if (pick === null || m[p.kind] > m[it.props[pick].kind]) pick = i;
    }
    if (pick === null) break;
    it.props.splice(pick, 1);
  }
}

/**
 * Yerleşim sırasında prop bütçesi: yeni (kapı/kilit dışı) bir anahtar `maxKeys`'i aşıyorsa ya da toplam yerleşim `maxProps`'a ulaşmışsa
 * b.prop / b.wallProp null döner (topUp/fit* sıradaki anahtara geçer). Kapı ve kilit düzenekleri hep serbesttir.
 */
export function capKeys(b, maxKeys, maxProps, core) {
  const coreSet = new Set(core || []);
  const keys = new Set();
  const origProp = b.prop.bind(b);
  const origWall = b.wallProp.bind(b);
  let regular = 0;
  const gate = (key) => {
    const d = getCatalogDef(key);
    if (!d) return false;
    if (d.tags.indexOf('door') >= 0 || d.tags.indexOf('lockpad') >= 0) return true;
    if (coreSet.has(key)) return true; // çekirdek anahtarlar bütçeye takılmaz (trimProps son sınırı uygular)
    if (!keys.has(key) && keys.size >= maxKeys && !coreSet.has(key) && key !== 'cerceve') return false;
    if (regular >= maxProps) return false;
    return true;
  };
  const note = (key, r) => {
    if (!r) return r;
    const d = getCatalogDef(key);
    if (d && d.tags.indexOf('door') < 0 && d.tags.indexOf('lockpad') < 0) {
      keys.add(key);
      regular++;
    }
    return r;
  };
  b.prop = (key, u, v, ly, o) => (gate(key) ? note(key, origProp(key, u, v, ly, o)) : null);
  b.wallProp = (key, u, v, side, o) => (gate(key) ? note(key, origWall(key, u, v, side, o)) : null);
}

/** Tercih odasında (gevşek) serbest hücre; yoksa diğer odalarda. Dönen [u,v,oda] | null. Çip/imza gibi çarpışmasız noktalar için. */
export function anyCell(b, room, pref, claim) {
  const first = freeCell(b, room, pref, { loose: true });
  let out = first ? [first[0], first[1], room] : null;
  for (let i = 0; i < b.rooms.length && !out; i++) {
    const r = b.rooms[i];
    if (r === room || r.y0 !== 0) continue;
    const c = freeCell(b, r, null, { loose: true });
    if (c) out = [c[0], c[1], r];
  }
  if (out && claim) {
    if (!b._used) b._used = new Set();
    b._used.add((out[2].y0 || 0) + ':' + out[0] + ',' + out[1]);
  }
  return out;
}

const TAG_PLAN = 0xc01;

/**
 * İki geçişli planlama: önce koruma KAPALI (hızlı; builder her yerleşimde BFS çalıştırmaz), sonuç GUARD_MIN'i sağlıyorsa onu kullan;
 * sağlamıyorsa aynı tohumla koruma AÇIK yeniden planla. build(rng, guard) -> Interior. Belirlenimci (rng taze akışla yeniden kurulur).
 */
export function twoPass(ctx, rng, build) {
  const it = build(rng, false);
  const rep = planReachability(it);
  if (!rep.startBlocked && !rep.unreachableRooms.length && rep.fraction >= GUARD_MIN) return it;
  return build(stream(ctx.seed, ctx.bp.id, TAG_PLAN), true);
}

const LOCK_NEON = { kod: ID.NEON_AMBER, kart: ID.NEON_CYAN, mini_hack: ID.NEON_LIME };

/**
 * İç kapı/kemer açıklıklarını kazar (impl.autoDoors=false ile kullanılır): lento ve söve; kilitli kapının lentosu kilit türü renginde neon
 * (kod kehribar · kart camgöbeği · çözme limon) — yalnız o.lockCue=true iken (neon boyası büyük duvarları renklendirir; varsayılan KAPALI). o: {frame, archFrame, lintel, archLintel, lockCue}
 */
export function frameDoors(kit, interior, pal, o) {
  const op = o || {};
  for (let i = 0; i < interior.doors.length; i++) {
    const d = interior.doors[i];
    if (d.kind !== 'door' && d.kind !== 'arch') continue;
    const arch = d.kind === 'arch';
    const neon = op.lockCue ? d.lock && LOCK_NEON[d.lock.kind] : null;
    const lintel = neon || (arch ? (op.archLintel === undefined ? pal.trim : op.archLintel) : (op.lintel === undefined ? pal.trim : op.lintel));
    const frame = arch ? op.archFrame : (d.w === 1 ? op.frame : undefined);
    kit.doorway(d, { lintel, frame });
  }
}

/** Duvara gömülü holo paneli (HOLO 238; emisyon 8): yerel [u0,v0,u1,v1) x satır aralığı [y0,y1). Yalnız bölme duvarı hücrelerine anlamlı. */
export function holoPanel(kit, u0, v0, u1, v1, y0, y1) {
  kit.box(u0, v0, u1, v1, y0, y1, ID.HOLO);
}

/**
 * İmza eşyayı bir masa/tezgâhın ÜSTÜNE (ev sahibi prop; yüzey yüksekliği ≤ 1.3) koyar; yoksa tercih odasında serbest zemin hücresine.
 * hosts: tercih sırasıyla prop anahtarları. Dönen: imza kaydı | null.
 */
export function placeSignature(b, hosts, room, pref) {
  for (let i = 0; i < hosts.length; i++) {
    const sp = b._props.find((p) => p.kind === hosts[i] && p._l);
    const def = getCatalogDef(hosts[i]);
    if (!sp || !def || def.size[1] > 1.3) continue;
    b._sigHost = sp.slot;
    return b.signature(Math.floor(sp._l.u), Math.floor(sp._l.v), def.size[1]);
  }
  const c = anyCell(b, room, pref);
  return c ? b.signature(c[0], c[1], 0) : null;
}

/** Süs (kilitsiz) kod_notu propunun data değeri: rakam paketi yok (propIndoor: 0 = ipucu değil). */
export const NO_LOCK = 0;
const PAD_KEY = { kod: 'kod_paneli', kart: 'kart_okuyucu', mini_hack: 'hack_terminali' };

/** Kod notu data paketi (propIndoor/locks.js şeması): basamak başına 3 bit (1..6), uzunluk << 12. */
export function packCode(code) {
  let d = (code.length & 7) << 12;
  for (let i = 0; i < code.length && i < 4; i++) d |= (code[i] & 7) << (3 * i);
  return d;
}

/**
 * Kilit bağları: kilit kaydına düzenek slotu (pad), kod notuna kod paketi (data), iç mekâna clues kaydı (locks.assignClues/propIndoor.clueDigitsOf okur).
 * Kilitle ilgisiz süs kod notlarının data değeri 0 kalır (ipucu değil).
 */
export function linkLocks(it) {
  const clues = [];
  it.locks.forEach((l) => {
    const d = it.doors.find((x) => x.id === l.door);
    if (!d) return;
    const key = PAD_KEY[l.kind];
    let best = null;
    let bd = 1e9;
    if (key) {
      it.props.forEach((p) => {
        if (p.kind !== key) return;
        const dd = Math.hypot(p.x - (d.x + 0.5), p.z - (d.z + 0.5));
        if (dd < bd) { bd = dd; best = p; }
      });
    }
    if (best && bd <= 4) l.pad = best.slot;
    if (l.clue && l.clue.slot >= 0) {
      const c = it.props.find((p) => p.slot === l.clue.slot);
      if (c) {
        if (l.kind === 'kod' && l.data && Array.isArray(l.data.code)) c.data = packCode(l.data.code);
        clues.push({
          lockId: l.id, slot: c.slot, room: l.clue.room, x: c.x, y: c.y, z: c.z,
        });
      }
    }
  });
  it.clues = clues;
  it.props.forEach((p) => {
    if (p.kind === 'kod_notu' && p.data === undefined) p.data = NO_LOCK;
  });
}

/* ------------------------------------------------------------------------------------------------
 * ERTELENMİŞ ÇAPALAR: çip, imza eşya ve sahip konumu tüm proplar (topUp dahil) yerleştikten SONRA seçilir (sonradan gelen bir prop çapayı örtmesin).
 * Tür dosyaları deferChip/deferSignature/deferPost çağırır; finishInterior runDeferred ile sırayla gerçekleştirir (imza → çip → sahip).
 * ---------------------------------------------------------------------------------------------- */
function pushDefer(b, stage, fn) {
  if (!b._defer) b._defer = [];
  b._defer.push({ stage, fn });
}

export function deferSignature(b, hosts, room, pref) {
  pushDefer(b, 0, () => placeSignature(b, hosts, room, pref));
}

export function deferChip(b, room, pref, y) {
  pushDefer(b, 1, () => {
    const c = anyCell(b, room, pref, true);
    if (c) b.chip(c[2].id, c[0], c[1], y || 0);
  });
}

/** Sahip konumu: yer tutucu nesne hemen döner (Interior.ownerPost); çapa sonradan aynı nesne üzerinde güncellenir. */
export function deferPost(b, room, pref, ly) {
  const post = ownerPost(b, Math.floor(pref[0]), Math.floor(pref[1]), ly, room.id);
  pushDefer(b, 2, () => {
    const c = anyCell(b, room, pref, true);
    if (c) Object.assign(post, ownerPost(b, c[0], c[1], ly, c[2].id));
  });
  return post;
}

export function runDeferred(b) {
  const list = (b._defer || []).slice().sort((x, y) => x.stage - y.stage);
  b._defer = [];
  list.forEach((d) => d.fn());
}

/**
 * Zorunlu mobilya: `key` henüz yerleşmediyse verilen odalarda sırayla (duvara yaslı, olmazsa serbest hücre; duvar propu için duvar) dener.
 * Yüksekte (asma) odalarda yükseklik oda tabanına ayarlanır. Dönen: yerleşen spec | null (zaten varsa null değil: mevcut).
 */
export function ensure(b, rng, key, rooms, o) {
  const have = b._props.find((p) => p.kind === key);
  if (have) return have;
  const def = getCatalogDef(key);
  if (!def) return null;
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (!room) continue;
    const op = Object.assign({}, o);
    if (room.y0 > 0 && op.y === undefined) op.y = room.y0 + (def.mount === 'wall' ? 1 : 0);
    const r = def.mount === 'wall' ? fitWall(b, rng, room, key, op) : (fitAgainst(b, rng, room, key, op) || fitFloor(b, rng, room, key, op));
    if (r) return r;
  }
  return null;
}
