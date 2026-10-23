/*
 * KEŞİF sim/city/interior — KİLİT MODELİ ve ÇÖZÜLEBİLİRLİK ANALİZİ (sözleşme §8, §21 risk #10/#14). SAF: three/DOM/Math.random/Date.now yok,
 * belirlenimci (kod/mini oyun tohumu yalnız subHash türevi), worker-güvenli, es2020.
 *
 *   Lock = {id, kind:'serbest'|'kod'|'mini_hack'|'kart', tier:0..3, data}                   (interior/graph.js ile aynı biçim; kapıya `door.lock` olarak bağlanır)
 *     serbest   kilit yok sayılır (kapı yalnız kapalı durur, yaklaşınca açılır)
 *     kod       3-4 hane, her hane 1..6 (kademe 0-1: 3, 2-3: 4). Kod notu (`kod_notu` prop'u) ya da sahibin ipucu satırı koda götürür; not yoksa
 *               yanlış denemenin geri bildirimi (doğru yerde / yanlış yerde) çıkarım yoluyla çözdürür → her kod kilidi çözülebilir
 *     mini_hack Rün Dizisi / Renk Kolları / Zar Mantığı (hack/*); oyun tohumdan, zorluk kademeden gelir
 *     kart      kimlik kartı: seviye = clamp(data.card | tier, 1..3); üst seviye kart alt seviye kilidi de açar. KARTLAR: item:kart_gri|turuncu|mor
 *   data (isteğe bağlı, hepsi doğrulanır): kod {code:int[]|'1234', digits:3|4, clue:'prop'|'owner'}  mini_hack {game:'simon'|'levers'|'dice'}  kart {card:1..3}
 *   herhangi {gives:0..3} çözülünce verilen kart seviyesi (0 = verme). Varsayılan ödül: serbest/kart dışı kilit, kademe t<3 → Kart-(t+1); t=3 → yok.
 *   DAG: kart k kilidi (kademe ≥ k) kart k'yı ancak kademesi < k olan kilitlerden (ya da dış kaynaktan) alabilir → sağlayıcı kademesi hep düşüktür.
 *
 *   yanlış deneme → 20 sn soğuma (COOLDOWN_SEC); KALICI KİLİT YOK; çözülen kilit kalıcı açıktır (locks[anahtar] = 1); içeriden (derin taraftan) çıkış HER ZAMAN serbest.
 *
 * API:
 *   LOCK_KINDS · COOLDOWN_SEC · CARD_KEYS · CARD_NAMES · CARD_COLORS · cardKey(level) · cardLevelOf(itemKey)
 *   makeLock(id, kind, tier, data?) → Lock (donuk, doğrulanmış)       normalizeLock(raw) → Lock | null
 *   lockStateKey(lotId, lockId) → ^[0-9a-z]{1,10}$   kayıt anahtarı (kaydın locks haritası; ~hash, çakışma ihmal edilebilir)
 *   lockSeed(citySeed, lotId, lockId) → uint32        lockSpec(lock, seed) → {kind, tier, code, digits, game, hackTier, card, gives, clue}
 *   clueRefOf(lockId) → 0..65535        assignClues(interior) → Map<lockId, {prop, source:'prop'}>    clueCodeText(code)
 *   doorSides(interior) → Map<doorId, {entry, deep, sign, axis}>   canPass(side) · lockPrompt(lock) · lockTitle(lock)
 *   class LockBook({store, seed})  → çalışma zamanı kilit durumu (soğuma, deneme, çözüm); store = DimCtx.locks (paylaşılan nesne)
 *   solveReachability(interior, opts?) → analiz (aşağıda)       solveCity(interiors, opts?) → şehir çapı kart kapanımı
 */
import { hash32 } from '../../rng.js';
import { sh } from '../cityPlanKit.js';
import { HACK_GAMES } from '../hack/index.js';

export const LOCK_KINDS = Object.freeze(['serbest', 'kod', 'mini_hack', 'kart']);
export const COOLDOWN_SEC = 20;
export const CARD_KEYS = Object.freeze(['item:kart_gri', 'item:kart_turuncu', 'item:kart_mor']);
export const CARD_NAMES = Object.freeze(['Kimlik Kartı 1 (Gri)', 'Kimlik Kartı 2 (Turuncu)', 'Kimlik Kartı 3 (Mor)']);
export const CARD_COLORS = Object.freeze(['#9aa3b2', '#ff9a3c', '#b07cff']);
export const CODE_MIN_DIGITS = 3;
export const CODE_MAX_DIGITS = 4;

const TAG_LOCK = 0xd41;
const TAG_CODE = 0xd42;
const TAG_GAME = 0xd43;
const TAG_HACK = 0xd44;
const ID_RE = /^[0-9a-zA-Z_.-]{1,32}$/;
const KEY_RE = /^[0-9a-z]{1,10}$/;

export function cardKey(level) {
  const l = Math.floor(Number(level));
  return l >= 1 && l <= 3 ? CARD_KEYS[l - 1] : null;
}

export function cardLevelOf(itemKey) {
  const i = CARD_KEYS.indexOf(itemKey);
  return i < 0 ? 0 : i + 1;
}

function hashStr(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return hash32(h | 0) >>> 0;
}

/* ------------------------------------------------------------------------------------------------
 * Lock
 * ---------------------------------------------------------------------------------------------- */
function cleanData(kind, data) {
  const d = {};
  if (!data || typeof data !== 'object') return d;
  if (kind === 'kod') {
    let code = data.code;
    if (typeof code === 'string' && /^[1-6]{3,4}$/.test(code)) code = code.split('').map(Number);
    if (Array.isArray(code) && code.length >= CODE_MIN_DIGITS && code.length <= CODE_MAX_DIGITS && code.every((v) => Number.isInteger(v) && v >= 1 && v <= 6)) d.code = code.slice();
    const dg = data.digits !== undefined ? data.digits : data.len;
    if (dg === 3 || dg === 4) d.digits = dg;
    if (data.clue === 'prop' || data.clue === 'owner') d.clue = data.clue;
  } else if (kind === 'mini_hack') {
    if (HACK_GAMES.indexOf(data.game) >= 0) d.game = data.game;
    if (Number.isInteger(data.seed) && data.seed >= 0 && data.seed <= 0xffff) d.seed = data.seed;
  } else if (kind === 'kart') {
    if (Number.isInteger(data.card) && data.card >= 1 && data.card <= 3) d.card = data.card;
  } else if (kind === 'serbest') {
    if (data.hidden === true) d.hidden = true;
  }
  if (Number.isInteger(data.gives) && data.gives >= 0 && data.gives <= 3) d.gives = data.gives;
  return d;
}

export function makeLock(id, kind, tier, data) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('makeLock: geçersiz kilit kimliği ' + String(id));
  if (LOCK_KINDS.indexOf(kind) < 0) throw new Error('makeLock: geçersiz tür ' + String(kind));
  if (!Number.isInteger(tier) || tier < 0 || tier > 3) throw new Error('makeLock: kademe 0..3 olmalı');
  return Object.freeze({
    id, kind, tier, data: Object.freeze(cleanData(kind, data)),
  });
}

export function normalizeLock(raw) {
  if (!raw || typeof raw !== 'object') return null;
  try {
    return makeLock(raw.id, raw.kind, raw.tier === undefined ? 0 : raw.tier, raw.data);
  } catch {
    return null;
  }
}

/**
 * Kayıt anahtarı (dims.neon.locks haritası; dimSanitize.validId = ^[0-9a-z]{1,10}$). İç mekân üreticilerinin kilit kimlikleri zaten parsel kimliğini
 * içerir ('l'+parsel+harf, 'k'+parsel+etiket) ve bu kurala uyar → kimlik AYNEN anahtardır (bağlı `isLockOpen(kimlik)` köprüsü doğrudan çalışır).
 * Uymayan kimlikler (büyük harf, tire, uzun) 'x' + hash(parsel, kimlik) olur.
 */
export function lockStateKey(lotId, lockId) {
  if (typeof lockId === 'string' && KEY_RE.test(lockId)) return lockId;
  const h = (hashStr(lockId) ^ Math.imul((lotId | 0) + 1, 0x9e3779b1)) >>> 0;
  return 'x' + hash32(h).toString(36);
}

export function lockSeed(citySeed, lotId, lockId) {
  return sh(citySeed | 0, (lotId | 0) ^ (hashStr(lockId) & 0x7fffffff), TAG_LOCK);
}

/** Kilidin çözülmüş (deterministik) tanımı: kod, mini oyun, kart seviyesi, ödül. `seed` = lockSeed(...). */
export function lockSpec(lockIn, seed) {
  const lock = lockIn && Object.isFrozen(lockIn) && lockIn.data ? lockIn : normalizeLock(lockIn);
  if (!lock) return null;
  const sd = seed | 0;
  const out = {
    kind: lock.kind, tier: lock.tier, code: null, digits: 0, game: null, hackTier: lock.tier, card: 0, gives: 0, clue: 'prop',
  };
  if (lock.kind === 'kod') {
    const digits = lock.data.code ? lock.data.code.length : (lock.data.digits || (lock.tier >= 2 ? 4 : 3));
    const code = [];
    for (let i = 0; i < digits; i++) code.push(lock.data.code ? lock.data.code[i] : 1 + (sh(sd, i + 1, TAG_CODE) % 6));
    out.digits = digits;
    out.code = code;
    out.clue = lock.data.clue || 'prop';
  } else if (lock.kind === 'mini_hack') {
    out.game = lock.data.game || HACK_GAMES[sh(sd, 1, TAG_GAME) % HACK_GAMES.length];
  } else if (lock.kind === 'kart') {
    out.card = lock.data.card || Math.min(3, Math.max(1, lock.tier));
  }
  if (lock.data.gives !== undefined) out.gives = lock.data.gives;
  else if (lock.kind !== 'serbest' && lock.kind !== 'kart' && lock.tier < 3) out.gives = lock.tier + 1;
  return out;
}

export function clueCodeText(code) {
  return Array.isArray(code) ? code.join(' - ') : '';
}

/** Mini oyun tohumu: aynı kilit için her deneme (attempt) yeni bir bulmaca (aynı diziyi ezberleyip tekrarlamak yok). */
export function hackSeedFor(seed, attempt) {
  return sh(seed | 0, (attempt | 0) + 1, TAG_HACK);
}

export function lockTitle(lock) {
  switch (lock && lock.kind) {
    case 'kod': return 'Kod Kilidi';
    case 'kart': return 'Kart Okuyucu';
    case 'mini_hack': return 'Çözme Terminali';
    default: return 'Kapı';
  }
}

export function lockPrompt(lock) {
  switch (lock && lock.kind) {
    case 'kod': return 'Kodu gir';
    case 'kart': return 'Kartı okut';
    case 'mini_hack': return 'Kilidi çöz';
    default: return 'Kapıyı aç';
  }
}

/* ------------------------------------------------------------------------------------------------
 * Kod ipuçları (kod_notu): kilit ↔ not eşlemesi
 * ---------------------------------------------------------------------------------------------- */
export function clueRefOf(lockId) {
  return (hashStr(lockId) & 0xffff) || 1;
}

function isClueProp(p) {
  return !!p && (p.kind === 'kod_notu' || p.key === 'kod_notu');
}

/** Not `data` alanından olası rakam dizileri: bit paketleme (basamak başına 3 bit, uzunluk << 12) ve 6 tabanı (kindKitB/cKit ve propIndoor şemaları). */
function noteDigitSets(data) {
  const out = [];
  if (!Number.isInteger(data) || data <= 0) return out;
  const nb = (data >> 12) & 7;
  const bits = [];
  for (let i = 0; i < nb && i < 4; i++) bits.push((data >> (3 * i)) & 7);
  out.push(bits);
  const n6 = (data >> 12) & 3;
  let v = data & 0xfff;
  const b6 = [];
  for (let i = 0; i < n6; i++) {
    b6.unshift(1 + (v % 6));
    v = Math.floor(v / 6);
  }
  out.push(b6);
  return out;
}

function sameDigits(a, b) {
  return a.length === b.length && a.length > 0 && a.every((v, i) => v === b[i]);
}

/**
 * Kod notlarını kod kilitlerine eşler. Öncelik: (1) interior.clues kaydı {lockId, slot|x,y,z}  (2) interior.locks[].clue.slot  (3) not.lock === kimlik ya da
 * not.data === clueRefOf(kimlik)  (4) not.data kilidin kodunu paketler  (5) kalan kilitler kimlik sırasıyla kalan notlarla (slot sırası).
 * → Map<lockId, {prop, source:'prop'}>; notu bulunamayan (ya da owner ipucu veren) kilit haritada yoktur.
 */
export function assignClues(interior) {
  const out = new Map();
  if (!interior || !Array.isArray(interior.doors)) return out;
  const props = Array.isArray(interior.props) ? interior.props : [];
  const locks = interior.doors.filter((d) => d && d.lock && d.lock.kind === 'kod').map((d) => d.lock).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const notes = props.filter(isClueProp).slice().sort((a, b) => (a.slot | 0) - (b.slot | 0));
  const used = new Set();
  const take = (L, k) => {
    out.set(L.id, { prop: notes[k], source: 'prop' });
    used.add(k);
  };
  const bySlot = (slot) => {
    // önce kod notları (sıralı liste), sonra herhangi bir ipucu taşıyıcısı (bilgi terminali, ilan panosu…) — slot kimliğiyle
    const k = notes.findIndex((n, q) => !used.has(q) && n.slot === slot);
    if (k >= 0) return { k, prop: notes[k] };
    const p = props.find((q) => q && q.slot === slot);
    return p ? { k: -2, prop: p } : null;
  };
  const recs = Array.isArray(interior.clues) ? interior.clues : [];
  const lrecs = Array.isArray(interior.locks) ? interior.locks : [];
  for (let i = 0; i < locks.length; i++) {
    const L = locks[i];
    let hit = null;
    const rec = recs.find((r) => r && r.lockId === L.id);
    if (rec && Number.isInteger(rec.slot)) hit = bySlot(rec.slot);
    if (!hit) {
      const lr = lrecs.find((r) => r && r.id === L.id);
      if (lr && lr.clue && Number.isInteger(lr.clue.slot)) hit = bySlot(lr.clue.slot);
    }
    if (hit) {
      if (hit.k >= 0) take(L, hit.k);
      else out.set(L.id, { prop: hit.prop, source: 'prop' });
    }
  }
  for (let i = 0; i < locks.length; i++) {
    const L = locks[i];
    if (out.has(L.id)) continue;
    const ref = clueRefOf(L.id);
    const code = L.data && Array.isArray(L.data.code) ? L.data.code : null;
    let k = notes.findIndex((n, q) => !used.has(q) && (n.lock === L.id || (Number.isInteger(n.data) && n.data === ref)));
    if (k < 0 && code) k = notes.findIndex((n, q) => !used.has(q) && noteDigitSets(n.data).some((d) => sameDigits(d, code)));
    if (k >= 0) take(L, k);
  }
  for (let i = 0; i < locks.length; i++) {
    const L = locks[i];
    if (out.has(L.id) || (L.data && L.data.clue === 'owner')) continue;
    const k = notes.findIndex((n, q) => !used.has(q) && !(typeof n.lock === 'string' && n.lock !== L.id));
    if (k >= 0) take(L, k);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Kapı tarafları (içeriden çıkış her zaman serbest)
 * ---------------------------------------------------------------------------------------------- */
function roomMap(it) {
  const m = new Map();
  (it.rooms || []).forEach((r) => m.set(r.id, r));
  return m;
}

/** Giriş odasından odalara BFS derinliği (kilitler yok sayılır: kapı yapısı). */
function depths(it) {
  const adj = new Map();
  (it.rooms || []).forEach((r) => adj.set(r.id, []));
  (it.graph || []).forEach((e) => {
    if (adj.has(e[0]) && adj.has(e[1])) {
      adj.get(e[0]).push(e[1]);
      adj.get(e[1]).push(e[0]);
    }
  });
  const dep = new Map();
  const start = it.entry && adj.has(it.entry.room) ? it.entry.room : ((it.rooms && it.rooms[0] && it.rooms[0].id) || null);
  if (start === null) return dep;
  dep.set(start, 0);
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const ns = adj.get(c) || [];
    for (let i = 0; i < ns.length; i++) {
      if (!dep.has(ns[i])) {
        dep.set(ns[i], dep.get(c) + 1);
        q.push(ns[i]);
      }
    }
  }
  return dep;
}

/**
 * Her iç kapı için: entry = girişe yakın (açık) oda, deep = uzak oda, axis = geçiş ekseni ('x'|'z'), sign = kapı merkezinden GİRİŞ tarafına yön (+1|−1).
 * Oyuncu giriş tarafındaysa kilit uygulanır; DERİN tarafta serbest geçer (hapis yok).
 */
export function doorSides(it) {
  const res = new Map();
  if (!it || !Array.isArray(it.graph)) return res;
  const rooms = roomMap(it);
  const dep = depths(it);
  const doors = new Map();
  (it.doors || []).forEach((d) => doors.set(d.id, d));
  it.graph.forEach((e) => {
    const [a, b, did] = e;
    const d = doors.get(did);
    const ra = rooms.get(a);
    const rb = rooms.get(b);
    if (!d || !ra || !rb) return;
    const da = dep.has(a) ? dep.get(a) : 1e9;
    const db = dep.has(b) ? dep.get(b) : 1e9;
    const entryA = da <= db;
    const entry = entryA ? a : b;
    const deep = entryA ? b : a;
    const er = entryA ? ra : rb;
    const vertical = d.kind === 'stair' || d.kind === 'ladder' || d.kind === 'hatch';
    // geçiş ekseni: 'x' ekseninde uzanan kapı (axis 'x') z yönünde geçilir
    const pass = d.axis === 'x' ? 'z' : 'x';
    const c = pass === 'z' ? (d.z + 0.5) : (d.x + 0.5);
    const ec = pass === 'z' ? (er.z0 + er.z1) / 2 : (er.x0 + er.x1) / 2;
    res.set(did, {
      entry, deep, axis: pass, sign: ec >= c ? 1 : -1, vertical, door: d,
    });
  });
  return res;
}

/** Oyuncu (px,pz) kapının giriş (kilitli) tarafında mı? Derin tarafta false → kapı serbestçe açılır. */
export function onEntrySide(side, px, pz) {
  const p = side.axis === 'z' ? pz : px;
  const door = side.door;
  const c = side.axis === 'z' ? door.z + 0.5 : door.x + 0.5;
  return (p - c) * side.sign >= 0;
}

/* ------------------------------------------------------------------------------------------------
 * LockBook — çalışma zamanı durumu
 * ---------------------------------------------------------------------------------------------- */
/**
 * @param {{store?:object, seed?:number}} opts   store: dims.neon.locks (paylaşılan düz nesne; yalnız çözülmüş kilitler: anahtar → 1)
 */
export class LockBook {
  constructor(opts) {
    const o = opts || {};
    this.store = o.store && typeof o.store === 'object' ? o.store : {};
    this.seed = (o.seed | 0);
    this.now = 0;
    this._cool = new Map();
    this._attempts = new Map();
    this._lot = new Map();
    this.solvedCount = 0;
  }

  /** Oyun saatini ilerletir (saniye). */
  tick(dt) {
    if (dt > 0 && Number.isFinite(dt)) this.now += dt;
  }

  setStore(store) {
    this.store = store && typeof store === 'object' ? store : {};
  }

  keyOf(lotId, lock) {
    if (this._lot.get(lock.id) !== lotId) this._lot.set(lock.id, lotId);
    return lockStateKey(lotId, lock.id);
  }

  isSolved(lotId, lock) {
    return this.store[this.keyOf(lotId, lock)] === 1;
  }

  /** Köprü (props_content isLockOpen): yalnız kimlikle. Uyumlu kimlikler store'da doğrudan; uyumsuzlar için kimliğin son görüldüğü parsel anımsanır. */
  isOpenById(lockId) {
    if (this.store[lockId] === 1) return true;
    const lot = this._lot.get(lockId);
    return lot !== undefined && this.store[lockStateKey(lot, lockId)] === 1;
  }

  /** Kapı açılabilir mi (kilit yok / serbest / çözülmüş). */
  isOpen(lotId, lock) {
    return !lock || lock.kind === 'serbest' || this.isSolved(lotId, lock);
  }

  cooldownLeft(lotId, lock) {
    const u = this._cool.get(this.keyOf(lotId, lock));
    if (u === undefined) return 0;
    const left = u - this.now;
    if (left <= 0) {
      this._cool.delete(this.keyOf(lotId, lock));
      return 0;
    }
    return left;
  }

  attempts(lotId, lock) {
    return this._attempts.get(this.keyOf(lotId, lock)) || 0;
  }

  _fail(lotId, lock) {
    const k = this.keyOf(lotId, lock);
    this._cool.set(k, this.now + COOLDOWN_SEC);
    this._attempts.set(k, (this._attempts.get(k) || 0) + 1);
    return COOLDOWN_SEC;
  }

  solve(lotId, lock) {
    const k = this.keyOf(lotId, lock);
    if (this.store[k] === 1) return false;
    this.store[k] = 1;
    this._cool.delete(k);
    this.solvedCount++;
    return true;
  }

  specOf(lotId, lock) {
    return lockSpec(lock, lockSeed(this.seed, lotId, lock.id));
  }

  /** Mini oyun parametreleri: {game, seed, tier}. */
  hackParams(lotId, lock) {
    const sp = this.specOf(lotId, lock);
    if (!sp || sp.kind !== 'mini_hack') return null;
    const base = lockSeed(this.seed, lotId, lock.id) ^ (lock.data && lock.data.seed ? lock.data.seed << 8 : 0);
    return { game: sp.game, seed: hackSeedFor(base, this.attempts(lotId, lock)), tier: sp.hackTier };
  }

  /**
   * Kod denemesi. digits: int[] (1..6). Sonuç: {result:'solved'|'wrong'|'cooldown'|'already'|'open'|'invalid', cooldown, exact, present}
   *   exact = doğru yerde doğru hane sayısı; present = doğru hane ama yanlış yerde (çıkarım geri bildirimi → not olmadan da çözülür)
   */
  attemptCode(lotId, lock, digits) {
    if (!lock || lock.kind !== 'kod') return { result: 'invalid', cooldown: 0, exact: 0, present: 0 };
    if (this.isOpen(lotId, lock)) return { result: this.isSolved(lotId, lock) ? 'already' : 'open', cooldown: 0, exact: 0, present: 0 };
    const cd = this.cooldownLeft(lotId, lock);
    if (cd > 0) return { result: 'cooldown', cooldown: cd, exact: 0, present: 0 };
    const sp = this.specOf(lotId, lock);
    if (!Array.isArray(digits) || digits.length !== sp.digits || !digits.every((v) => Number.isInteger(v) && v >= 1 && v <= 6)) {
      return { result: 'invalid', cooldown: 0, exact: 0, present: 0 };
    }
    let exact = 0;
    const cnt = [0, 0, 0, 0, 0, 0, 0];
    const gc = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < sp.digits; i++) {
      if (digits[i] === sp.code[i]) exact++;
      else {
        cnt[sp.code[i]]++;
        gc[digits[i]]++;
      }
    }
    let present = 0;
    for (let v = 1; v <= 6; v++) present += Math.min(cnt[v], gc[v]);
    if (exact === sp.digits) {
      this.solve(lotId, lock);
      return { result: 'solved', cooldown: 0, exact, present: 0 };
    }
    return { result: 'wrong', cooldown: this._fail(lotId, lock), exact, present };
  }

  /** Kart denemesi. have(itemKey) → bool. Kart eksikse ceza yok (yanlış kod gibi bir hata değildir). */
  attemptCard(lotId, lock, have) {
    if (!lock || lock.kind !== 'kart') return { result: 'invalid', need: 0 };
    const sp = this.specOf(lotId, lock);
    if (this.isOpen(lotId, lock)) return { result: this.isSolved(lotId, lock) ? 'already' : 'open', need: sp.card };
    for (let lv = sp.card; lv <= 3; lv++) {
      if (typeof have === 'function' && have(CARD_KEYS[lv - 1])) {
        this.solve(lotId, lock);
        return { result: 'solved', need: sp.card, used: lv };
      }
    }
    return { result: 'missing', need: sp.card };
  }

  /** Mini oyun sonucu: 'won' → çözüldü; 'lost' → 20 sn soğuma. */
  attemptHack(lotId, lock, outcome) {
    if (!lock || lock.kind !== 'mini_hack') return { result: 'invalid', cooldown: 0 };
    if (this.isOpen(lotId, lock)) return { result: this.isSolved(lotId, lock) ? 'already' : 'open', cooldown: 0 };
    const cd = this.cooldownLeft(lotId, lock);
    if (cd > 0) return { result: 'cooldown', cooldown: cd };
    if (outcome === 'won') {
      this.solve(lotId, lock);
      return { result: 'solved', cooldown: 0 };
    }
    return { result: 'wrong', cooldown: this._fail(lotId, lock) };
  }

  /** Soğuma/deneme sayaçlarını sıfırlar (boyut değişimi); çözülmüş kilitler store'da kalır. */
  resetTransient() {
    this._cool.clear();
    this._attempts.clear();
  }
}

/* ------------------------------------------------------------------------------------------------
 * Çözülebilirlik analizi (sabit nokta)
 * ---------------------------------------------------------------------------------------------- */
function lockEntries(it) {
  const sides = doorSides(it);
  const out = [];
  (it.doors || []).forEach((d) => {
    if (!d || !d.lock) return;
    const L = normalizeLock(d.lock);
    if (!L) return;
    const s = sides.get(d.id) || null;
    out.push({ lock: L, door: d, side: s });
  });
  out.sort((a, b) => (a.lock.id < b.lock.id ? -1 : a.lock.id > b.lock.id ? 1 : 0));
  return out;
}

function roomOfPoint(rooms, x, y, z) {
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1 && y >= r.y0 - 0.5 && y < r.y1 + 0.5) return r.id;
  }
  return null;
}

function reachableRooms(it, blockedDoors) {
  const adj = new Map();
  (it.rooms || []).forEach((r) => adj.set(r.id, []));
  (it.graph || []).forEach((e) => {
    if (blockedDoors.has(e[2])) return;
    if (adj.has(e[0]) && adj.has(e[1])) {
      adj.get(e[0]).push(e[1]);
      adj.get(e[1]).push(e[0]);
    }
  });
  const seen = new Set();
  const start = it.entry && adj.has(it.entry.room) ? it.entry.room : null;
  if (start === null) return seen;
  seen.add(start);
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const ns = adj.get(q[h]) || [];
    for (let i = 0; i < ns.length; i++) if (!seen.has(ns[i])) { seen.add(ns[i]); q.push(ns[i]); }
  }
  return seen;
}

/**
 * Bir iç mekân için kilit çözülebilirliği (sabit nokta yinelemesi). interior: planInterior çıktısı (rooms/graph/doors/props/entry).
 * opts: {seed, externalCards:int[] (bina dışından alınabilen kart seviyeleri; vars. []), requireClues:bool (kod için gerçek ipucu iste; vars. false:
 *        çıkarım geri bildirimi yeterli), lotId}
 * Dönüş: {ok, locks, order:[lockId…], unsolved:[{id, reason}], unreachableRooms:[id], clues:{lockId: 'prop'|'owner'|'cikarim'|'yok'},
 *        gives:{lockId: level}, cardsGranted:int[], dag:{edges:[[tüketici, sağlayıcı]], violations:[string]}, warnings:[string], rounds}
 */
export function solveReachability(interior, opts) {
  const o = opts || {};
  const res = {
    ok: true, locks: 0, order: [], unsolved: [], unreachableRooms: [], clues: {}, gives: {}, cardsGranted: [], dag: { edges: [], violations: [] }, warnings: [], rounds: 0,
  };
  const it = interior && Array.isArray(interior.rooms) ? interior : null;
  if (!it) return res;
  const entries = lockEntries(it);
  res.locks = entries.length;
  const have = new Set((o.externalCards || []).filter((v) => v >= 1 && v <= 3));
  const clues = assignClues(it);
  const solved = new Set();
  const doorOfLock = new Map();
  entries.forEach((e) => doorOfLock.set(e.lock.id, e));
  const rooms = it.rooms;
  const specs = new Map();
  const seed = o.seed === undefined ? 0 : o.seed;
  const lotId = o.lotId === undefined ? 0 : o.lotId;
  entries.forEach((e) => {
    const sp = lockSpec(e.lock, lockSeed(seed, lotId, e.lock.id));
    specs.set(e.lock.id, sp);
    res.gives[e.lock.id] = sp.gives;
    if (e.door.kind !== 'door') res.warnings.push('kilit zorlanmayan kapı türünde: ' + e.door.id + ' (' + e.door.kind + ')');
    if (!e.side) res.warnings.push('kilitli kapı grafta yok: ' + e.door.id);
  });
  const grantersOf = (level) => entries.filter((e) => specs.get(e.lock.id).gives === level).map((e) => e.lock);

  const blocked = () => {
    const b = new Set();
    entries.forEach((e) => {
      if (e.lock.kind !== 'serbest' && e.door.kind === 'door' && !solved.has(e.lock.id)) b.add(e.door.id);
    });
    return b;
  };

  const reasons = new Map();
  let changed = true;
  while (changed && res.rounds < 64) {
    changed = false;
    res.rounds++;
    const access = reachableRooms(it, blocked());
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const L = e.lock;
      if (solved.has(L.id)) continue;
      const sp = specs.get(L.id);
      const blockedNow = L.kind !== 'serbest' && e.door.kind === 'door';
      // kilit çözümü kilidin ARKASINDA olamaz: giriş tarafındaki oda açık olmalı
      if (blockedNow && e.side && !access.has(e.side.entry)) continue;
      let ok = true;
      let reason = '';
      if (L.kind === 'kod') {
        const c = clues.get(L.id);
        if (c) {
          const room = roomOfPoint(rooms, c.prop.x, c.prop.y, c.prop.z);
          if (room !== null && !access.has(room)) {
            ok = o.requireClues ? false : true;
            res.clues[L.id] = o.requireClues ? 'yok' : 'cikarim';
            reason = 'ipucu notu erişilemez odada';
          } else res.clues[L.id] = 'prop';
        } else if (sp.clue === 'owner') res.clues[L.id] = 'owner';
        else {
          res.clues[L.id] = o.requireClues ? 'yok' : 'cikarim';
          if (o.requireClues) {
            ok = false;
            reason = 'kod notu yok';
          }
        }
      } else if (L.kind === 'kart') {
        let has = false;
        for (let lv = sp.card; lv <= 3; lv++) if (have.has(lv)) has = true;
        if (!has) {
          ok = false;
          reason = 'Kart-' + sp.card + ' sağlayıcısı yok';
        }
      }
      if (ok) {
        solved.add(L.id);
        res.order.push(L.id);
        changed = true;
        if (sp.gives > 0) {
          if (L.kind !== 'kart' && !have.has(sp.gives)) {
            have.add(sp.gives);
            res.cardsGranted.push(sp.gives);
          }
        }
        if (L.kind === 'kart') {
          const g = grantersOf(sp.card);
          g.forEach((P) => res.dag.edges.push([L.id, P.id]));
        }
      } else if (reason) reasons.set(L.id, reason);
    }
  }
  // sağlayıcı kademesi < tüketici kademesi (DAG katı sıra) — ihlaller uyarıdır; asıl kıstas çözülebilirlik
  res.dag.edges = res.dag.edges.filter((e, i, a) => a.findIndex((x) => x[0] === e[0] && x[1] === e[1]) === i);
  res.dag.edges.forEach(([c, p]) => {
    const tc = doorOfLock.get(c).lock.tier;
    const tp = doorOfLock.get(p).lock.tier;
    if (tp >= specs.get(c).card) res.dag.violations.push(c + ' (kademe ' + tc + ', Kart-' + specs.get(c).card + ') ← ' + p + ' (kademe ' + tp + ')');
  });
  entries.forEach((e) => {
    if (!solved.has(e.lock.id)) res.unsolved.push({ id: e.lock.id, reason: reasons.get(e.lock.id) || 'kilidin giriş tarafı erişilemez (kilit arkasında)' });
  });
  const finalAccess = reachableRooms(it, blocked());
  rooms.forEach((r) => { if (!finalAccess.has(r.id)) res.unreachableRooms.push(r.id); });
  res.ok = res.unsolved.length === 0 && res.unreachableRooms.length === 0;
  return res;
}

/**
 * Şehir çapı kart kapanımı: interiors = [{lotId, interior}]; kart havuzu boş başlar, her bina elindeki kartlarla çözülür, verdiği kartlar havuza eklenir,
 * kararlı olana dek tekrarlanır. → {ok, pool:int[], unsolved:[{lotId, id, reason}], rounds}
 */
export function solveCity(list, opts) {
  const o = opts || {};
  const pool = new Set((o.externalCards || []).filter((v) => v >= 1 && v <= 3));
  let rounds = 0;
  let last = null;
  for (; rounds < 8; rounds++) {
    let grew = false;
    last = [];
    for (let i = 0; i < list.length; i++) {
      const r = solveReachability(list[i].interior, {
        seed: o.seed, lotId: list[i].lotId, externalCards: Array.from(pool), requireClues: o.requireClues,
      });
      r.cardsGranted.forEach((lv) => { if (!pool.has(lv)) { pool.add(lv); grew = true; } });
      r.unsolved.forEach((u) => last.push({ lotId: list[i].lotId, id: u.id, reason: u.reason }));
    }
    if (!grew) break;
  }
  return {
    ok: last !== null && last.length === 0, pool: Array.from(pool).sort(), unsolved: last || [], rounds: rounds + 1,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Kilit yerleştirme yardımcısı (iç mekân üreticileri için; DAG'ı yapıdan garanti eder)
 * ---------------------------------------------------------------------------------------------- */
const TAG_PLAN_LOCKS = 0xd45;

/**
 * İç mekânın kapılarından en çok `max` tanesine (yalnız 'door' türü, sokak kapısı değil) kilit önerir. Dış (girişe yakın) kapılardan içe doğru ilerler:
 * kod / mini_hack her zaman olabilir, kart kilidi ancak daha dışta onun kartını veren (kademe = kart−1) bir kilit varsa seçilir → sağlayıcı kademesi
 * daima düşük (DAG) ve hepsi sabit nokta ile çözülür. Dönüş: [{doorId, lock}] (girdiyi değiştirmez). Belirlenimci: yalnız subHash.
 * opts: {max=2, lotId=0, density=0.6 (aday kapıların kilit alma olasılığı)}
 */
export function planLocks(it, seed, opts) {
  const o = opts || {};
  const max = o.max === undefined ? 2 : o.max;
  const lotId = o.lotId | 0;
  const density = o.density === undefined ? 0.6 : o.density;
  const out = [];
  if (!it || !Array.isArray(it.graph) || max <= 0) return out;
  const dep = depths(it);
  const doors = new Map();
  (it.doors || []).forEach((d) => doors.set(d.id, d));
  const cand = [];
  it.graph.forEach((e) => {
    const d = doors.get(e[2]);
    if (!d || d.kind !== 'door') return;
    const deepD = Math.max(dep.has(e[0]) ? dep.get(e[0]) : 0, dep.has(e[1]) ? dep.get(e[1]) : 0);
    cand.push({ id: d.id, depth: deepD, h: sh(seed | 0, hashStr(d.id) ^ lotId, TAG_PLAN_LOCKS) });
  });
  cand.sort((a, b) => a.depth - b.depth || a.h - b.h || (a.id < b.id ? -1 : 1));
  const granted = new Set();
  let n = 0;
  for (let i = 0; i < cand.length && n < max; i++) {
    const c = cand[i];
    if ((c.h % 1000) / 1000 >= density) continue;
    const r = sh(seed | 0, hashStr(c.id) ^ lotId, TAG_PLAN_LOCKS + 1);
    const tierRoll = r % 100;
    const tier = Math.min(2, Math.floor((tierRoll < 45 ? 0 : tierRoll < 80 ? 1 : 2) + (c.depth >= 3 ? 1 : 0)));
    const kindRoll = (r >>> 8) % 100;
    let kind = kindRoll < 45 ? 'kod' : 'mini_hack';
    let t = tier;
    // kart kilidi: yalnız daha dışta onun kartını veren bir kilit varsa (kademe t ≥ 1 ve Kart-t verilmiş)
    if (kindRoll >= 80 && granted.size > 0) {
      const lv = Array.from(granted).sort()[(r >>> 16) % granted.size];
      kind = 'kart';
      t = lv;
    }
    const id = 'k' + (i + 1) + c.id.replace(/[^0-9a-zA-Z]/g, '').slice(0, 8);
    const lock = makeLock(id, kind, t, null);
    if (kind !== 'kart' && t < 3) granted.add(t + 1);
    out.push({ doorId: c.id, lock });
    n++;
  }
  return out;
}

/** planLocks sonucunu iç mekân kopyasına uygular (kapılar kopyalanır, kilit alanı eklenir); özgün iç mekâna dokunmaz. */
export function applyLocks(it, plan) {
  const map = new Map();
  plan.forEach((p) => map.set(p.doorId, p.lock));
  return Object.assign({}, it, { doors: it.doors.map((d) => (map.has(d.id) ? Object.assign({}, d, { lock: map.get(d.id) }) : d)) });
}
