/*
 * KEŞİF — HUD durum deposu (saf mantık; DOM/three yok, node'da test edilir).
 *
 * Motor (game.js) HUD nesnesini kare başına yeniden kullanır; React ise kimlik değişimine
 * bakar. Bu yüzden depo HER ZAMAN temiz bir kopya saklar (sanitizeHud) ve içerik
 * değişmediyse abonelere haber vermez. Böylece 60 FPS'te çalışan motor bile arayüzü
 * gereksiz yere yeniden çizdirmez.
 *
 *  - EMPTY_HUD            sözleşme §14'teki her alan için güvenli varsayılan (derin donmuş)
 *  - sanitizeHud(h)       kopyalar, sınırlar, beyaz listeler; bilinmeyen alanı atar
 *  - createHudStore()     { get, set, patch, reset, subscribe }  (useSyncExternalStore uyumlu)
 *  - createHudPublisher() motor için kısıtlayıcı (≤ 15 Hz) + önemli değişimde anında yayın
 *  - hudEqual / isImportantChange / hudSignature   saf yardımcılar
 *
 * Neon Meridyen (sözleşme §12): dim, district, dimLoading, vehicle (yer tutucu), city:{kredi,district,mission,radio,light}.
 * Şehir alanlarının yazarı systems/cityHud.js (+ gameTransition dimLoading); okuyucu components/game/kesif/city/*.
 *
 * Birimler: hp/hunger yarım kalp = 1 puan (0..20); oxygen saniye (0..60, tam = 15);
 * parkour.timer saniye; banner.until epoch ms (0 = süresiz); coords blok (1 ondalık).
 */
import { ABILITY_KEYS } from './sim/constants.js';

export const HUD_LIMITS = Object.freeze({
  hotbarSlots: 9,
  questLines: 6,
  itemKey: 64,
  name: 48,
  text: 80,
  sub: 140,
  line: 120,
  hint: 160,
  iconMax: 40000,
  count: 999,
  effects: 12,
});

export const HUD_UI_STATES = Object.freeze(['none', 'inventory', 'crafting', 'build', 'map', 'pause', 'dead', 'chest', 'journal', 'victory', 'enchant', 'brew', 'machine', 'dialogue', 'vendor', 'garage', 'photo', 'loading']);
/** Boyutlar (sim/dim/dimensions.js ile aynı kimlikler). */
export const HUD_DIMS = Object.freeze(['overworld', 'neon']);
/** Araç sınıfları (sözleşme §9; vehicle_ui yer tutucusu). */
export const HUD_VEHICLE_CLASSES = Object.freeze(['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike', 'suzulkay']);
/** Işık ipucu türleri: her birinin ayrı bir ŞEKLİ vardır (renk körlüğü: şekil + metin; sözleşme §12). */
export const HUD_LIGHT_KINDS = Object.freeze(['terminal', 'kapi', 'pano', 'garaj', 'cip', 'grafiti', 'oda']);
/** Işık ipucu menzili (blok; sözleşme: 40 m içinde). */
export const HUD_LIGHT_RANGE = 40;
/** Durum etkisi simgeleri (sim/magicData EFFECTS.icon; renk körlüğü için her simgenin ayrı şekli vardır). */
export const HUD_EFFECT_ICONS = Object.freeze(['hiz', 'ziplama', 'guc', 'goz', 'ates', 'su', 'kalp']);
export const HUD_MODES = Object.freeze(['macera', 'insa', 'harita']);
export const HUD_CAMERA_MODES = Object.freeze(['fp', 'tp', 'tpf']);

const COORD_LIMIT = 1_000_000;
const isControlCode = (c) => c < 32 || (c >= 127 && c <= 159) || c === 0x2028 || c === 0x2029;

/** Kontrol karakterlerini boşluğa çevirir (yoksa aynı string döner). */
function stripControl(s) {
  let out = null;
  for (let i = 0; i < s.length; i++) {
    if (isControlCode(s.charCodeAt(i))) {
      if (out === null) out = s.split('');
      out[i] = ' ';
    }
  }
  return out === null ? s : out.join('');
}
const ICON_OK = /^(data:image\/(png|jpeg|jpg|webp|gif|svg\+xml)[;,]|blob:|https?:\/\/|\/)/i;

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.keys(o).forEach((k) => deepFreeze(o[k]));
  }
  return o;
}

/** Metin: yalnız string/sayı/bool kabul, kontrol karakteri atılır, `max` uzunlukta (…) kesilir. */
export function clipStr(v, max, fallback = '') {
  let s;
  if (typeof v === 'string') s = v;
  else if (typeof v === 'number' && Number.isFinite(v)) s = String(v);
  else if (typeof v === 'boolean') s = String(v);
  else return fallback;
  s = stripControl(s).trim();
  if (!s) return fallback;
  if (s.length > max) {
    let cut = Math.max(0, max - 1);
    // Vekil çiftin ortasından kesme.
    const c = s.charCodeAt(cut - 1);
    if (c >= 0xd800 && c <= 0xdbff) cut--;
    s = s.slice(0, cut) + '…';
  }
  return s;
}

/** Sonlu sayı, [min,max] aralığına sıkıştırılır; geçersizse `def`. dec >= 0: ondalık basamak. */
export function clampNum(v, min, max, def = min, dec = -1) {
  if (typeof v === 'string' && v.trim() !== '') v = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  let n = v < min ? min : v > max ? max : v;
  if (dec >= 0) {
    const p = Math.pow(10, dec);
    n = Math.round(n * p) / p;
  }
  return n;
}

const clampInt = (v, min, max, def = min) => {
  const n = clampNum(v, min, max, def);
  return Math.floor(n);
};

const oneOf = (v, list, def) => (typeof v === 'string' && list.indexOf(v) >= 0 ? v : def);

const emptySlot = () => ({ item: null, count: 0 });

export const EMPTY_HUD = deepFreeze({
  hp: 20,
  maxHp: 20,
  hunger: 20,
  oxygen: 15,
  xpLevel: 0,
  hotbar: Array.from({ length: HUD_LIMITS.hotbarSlots }, emptySlot),
  selected: 0,
  held: null,
  target: { block: null, name: null, progress: 0 },
  coords: { x: 0, y: 0, z: 0 },
  depth: { rel: 0, band: '', key: '' },
  zone: { id: 0, name: '' },
  biome: '',
  time: 'gündüz',
  weather: '',
  quest: { title: '', lines: [] },
  boss: null,
  banner: null,
  parkour: null,
  abilities: ABILITY_KEYS.reduce((acc, k) => {
    acc[k] = false;
    return acc;
  }, {}),
  mode: 'macera',
  cameraMode: 'fp',
  ui: 'none',
  fps: 0,
  flying: false,
  sprinting: false,
  underwater: false,
  hint: null,
  mana: { value: 0, max: 0 },
  effects: [],
  spell: null,
  energy: null,
  jetpack: null,
  charge: null,
  scanner: null,
  shield: null,
  portals: null,
  dim: 'overworld',
  district: '',
  dimLoading: null,
  vehicle: null,
  city: null,
});

function sanitizeSlot(s) {
  if (!s || typeof s !== 'object') return emptySlot();
  const item = typeof s.item === 'string' ? clipStr(s.item, HUD_LIMITS.itemKey, '') : '';
  if (!item) return emptySlot();
  const count = clampInt(s.count, 0, HUD_LIMITS.count, 1);
  if (count <= 0) return emptySlot();
  const out = { item, count };
  if (typeof s.icon === 'string' && s.icon.length <= HUD_LIMITS.iconMax && ICON_OK.test(s.icon)) out.icon = s.icon;
  if (s.dur != null) {
    const d = clampNum(s.dur, 0, 1, -1, 3);
    if (d >= 0) out.dur = d;
  }
  // büyülü eşya: büyü sayısı (mor parıltı + ad rengi için); 0/yok = büyüsüz
  const en = clampInt(s.ench, 0, 6, 0);
  if (en > 0) out.ench = en;
  // teknoloji şarjı (jetpack yakıtı, alet/zırh/tarayıcı/portal tabancası): 0..1 oran (çubukta şarj çubuğu için)
  if (s.charge != null) {
    const ch = clampNum(s.charge, 0, 1, -1, 3);
    if (ch >= 0) out.charge = ch;
  }
  return out;
}

function sanitizeHotbar(list) {
  const out = [];
  const src = Array.isArray(list) ? list : [];
  for (let i = 0; i < HUD_LIMITS.hotbarSlots; i++) out.push(sanitizeSlot(src[i]));
  return out;
}

function sanitizeTarget(t) {
  if (!t || typeof t !== 'object') return { block: null, name: null, progress: 0 };
  let block = null;
  if (typeof t.block === 'number' && Number.isFinite(t.block)) block = Math.floor(t.block);
  else if (typeof t.block === 'string') block = clipStr(t.block, HUD_LIMITS.itemKey, '') || null;
  return {
    block,
    name: clipStr(t.name, HUD_LIMITS.name, '') || null,
    progress: clampNum(t.progress, 0, 1, 0, 3),
  };
}

function sanitizeQuest(q) {
  if (!q || typeof q !== 'object') return { title: '', lines: [] };
  const lines = [];
  if (Array.isArray(q.lines)) {
    for (let i = 0; i < q.lines.length && lines.length < HUD_LIMITS.questLines; i++) {
      const l = clipStr(q.lines[i], HUD_LIMITS.line, '');
      if (l) lines.push(l);
    }
  }
  return { title: clipStr(q.title, HUD_LIMITS.text, ''), lines };
}

function sanitizeBoss(b) {
  if (!b || typeof b !== 'object') return null;
  const maxHp = clampNum(b.maxHp, 1, 100000, 1, 1);
  return {
    name: clipStr(b.name, HUD_LIMITS.name, 'Boss'),
    hp: clampNum(b.hp, 0, maxHp, maxHp, 1),
    maxHp,
  };
}

function sanitizeBanner(b) {
  if (!b || typeof b !== 'object') return null;
  const text = clipStr(b.text, HUD_LIMITS.text, '');
  if (!text) return null;
  return {
    text,
    sub: clipStr(b.sub, HUD_LIMITS.sub, ''),
    until: clampNum(b.until, 0, 8.64e15, 0),
  };
}

function sanitizeParkour(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    timer: clampNum(p.timer, 0, 86400, 0, 2),
    checkpoint: clampInt(p.checkpoint, 0, 999, 0),
    difficulty: clampInt(p.difficulty, 1, 5, 1),
  };
}

function sanitizeAbilities(a) {
  const out = {};
  for (let i = 0; i < ABILITY_KEYS.length; i++) {
    const k = ABILITY_KEYS[i];
    out[k] = Boolean(a && typeof a === 'object' && a[k] === true);
  }
  return out;
}

function sanitizeMana(m) {
  if (!m || typeof m !== 'object') return { value: 0, max: 0 };
  const max = clampInt(m.max, 0, 1000, 0);
  return { value: clampInt(m.value, 0, max, 0), max };
}

function sanitizeEffects(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (let i = 0; i < list.length && out.length < HUD_LIMITS.effects; i++) {
    const e = list[i];
    if (!e || typeof e !== 'object') continue;
    const key = clipStr(e.key, 24, '');
    if (!key) continue;
    out.push({
      key,
      name: clipStr(e.name, HUD_LIMITS.name, key),
      icon: oneOf(e.icon, HUD_EFFECT_ICONS, 'kalp'),
      level: clampInt(e.level, 1, 5, 1),
      secondsLeft: clampInt(e.secondsLeft, 0, 3600, 0),
      fraction: clampNum(e.fraction, 0, 1, 0, 3),
    });
  }
  return out;
}

function sanitizeSpell(s) {
  if (!s || typeof s !== 'object') return null;
  const key = clipStr(s.key, 24, '');
  if (!key) return null;
  return {
    key,
    name: clipStr(s.name, HUD_LIMITS.name, key),
    manaCost: clampInt(s.manaCost, 0, 1000, 0),
    cooldown01: clampNum(s.cooldown01, 0, 1, 0, 3),
    ready: s.ready === true,
  };
}

function sanitizeHeld(h) {
  if (h && typeof h === 'object') return clipStr(h.name, HUD_LIMITS.name, '') || clipStr(h.item, HUD_LIMITS.itemKey, '') || null;
  return clipStr(h, HUD_LIMITS.itemKey, '') || null;
}

/* ------------------------------------------------------------------------------------------------
 * Teknoloji alanları (systems/tech): enerji, jetpack, eldeki şarj, tarayıcı, kalkan, portal tabancası
 * ---------------------------------------------------------------------------------------------- */
function sanitizeEnergy(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  return {
    value: clampInt(e.value, 0, 1e9, 0),
    max: clampInt(e.max, 0, 1e9, 0),
    gen: clampNum(e.gen, 0, 1e6, 0, 1),
    use: clampNum(e.use, 0, 1e6, 0, 1),
    net: clampNum(e.net, -1e6, 1e6, 0, 1),
    live: e.live === true,
    standby: e.standby === true,
    nodes: clampInt(e.nodes, 0, 100000, 0),
    name: clipStr(e.name, 24, ''),
  };
}

function sanitizeJetpack(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const max = clampInt(j.max, 1, 100000, 1);
  return {
    fuel: clampInt(j.fuel, 0, max, 0),
    max,
    fraction: clampNum(j.fraction, 0, 1, 0, 3),
    empty: j.empty === true,
    cells: clampInt(j.cells, 0, 9999, 0),
    thrusting: j.thrusting === true,
  };
}

function sanitizeCharge(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const max = clampInt(c.max, 1, 100000, 1);
  return {
    item: clipStr(c.item, HUD_LIMITS.itemKey, ''),
    name: clipStr(c.name, HUD_LIMITS.name, ''),
    value: clampInt(c.value, 0, max, 0),
    max,
    fraction: clampNum(c.fraction, 0, 1, 0, 3),
  };
}

const PING_TYPES = ['maden', 'yapı', 'canlı'];
function sanitizePings(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (let i = 0; i < list.length && out.length < 8; i++) {
    const p = list[i];
    if (!p || typeof p !== 'object') continue;
    out.push({
      type: oneOf(p.type, PING_TYPES, 'maden'),
      kind: clipStr(p.kind, 24, ''),
      name: clipStr(p.name, HUD_LIMITS.name, ''),
      color: clampInt(p.color, 0, 0xffffff, 0xffffff),
      dist: clampNum(p.dist, 0, 10000, 0, 1),
      yaw: clampNum(p.yaw, -10, 10, 0, 3),
      dy: clampNum(p.dy, -1000, 1000, 0, 1),
      hostile: p.hostile === true,
    });
  }
  return out;
}

function sanitizeScanner(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const max = clampInt(s.max, 1, 100000, 1);
  return {
    charge: clampInt(s.charge, 0, max, 0),
    max,
    empty: s.empty === true,
    nextIn: clampNum(s.nextIn, 0, 600, 0, 1),
    heading: clampNum(s.heading, -10, 10, 0, 3),
    pings: sanitizePings(s.pings),
  };
}

function sanitizeShield(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const max = clampInt(s.max, 0, 100000, 0);
  return {
    pieces: clampInt(s.pieces, 0, 4, 0),
    charge: clampInt(s.charge, 0, max, 0),
    max,
    fraction: clampNum(s.fraction, 0, 1, 0, 3),
  };
}

function sanitizePortals(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const max = clampInt(p.max, 0, 1000, 0);
  return {
    held: p.held === true,
    mavi: p.mavi === true,
    turuncu: p.turuncu === true,
    charge: clampInt(p.charge, 0, max, 0),
    max,
    cells: clampInt(p.cells, 0, 9999, 0),
    canFire: p.canFire === true,
    next: oneOf(p.next, ['mavi', 'turuncu'], 'mavi'),
    // Portal Tabancası kipi: 'boyut' = ateş Neon Meridyen kapısı açar (systems/techPortalGun; eylem portalMode)
    mode: oneOf(p.mode, ['normal', 'boyut'], 'normal'),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Neon Meridyen alanları
 * ---------------------------------------------------------------------------------------------- */
/** Boyut geçişi yükleme durumu {active,progress,label}: yalnız etkinken nesne; etkin değilse null. */
function sanitizeDimLoading(l) {
  if (!l || typeof l !== 'object' || Array.isArray(l) || l.active !== true) return null;
  return { active: true, progress: clampNum(l.progress, 0, 1, 0, 3), label: clipStr(l.label, HUD_LIMITS.text, '') };
}

/** Araç göstergesi (yer tutucu; vehicle_ui doldurur). Bilinmeyen sınıf → null. */
function sanitizeVehicle(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const cls = oneOf(v.cls, HUD_VEHICLE_CLASSES, '');
  if (!cls) return null;
  const out = {
    cls,
    kmh: clampInt(v.kmh, 0, 400, 0),
    gear: clampInt(v.gear, -1, 8, 0),
    nitro: clampNum(v.nitro, 0, 1, 0, 3),
    drift: v.drift === true,
    camera: clampInt(v.camera, 0, 3, 0),
  };
  // vehicle_ui ek alanları: yalnız açıkken eklenir (nitro yanıyor · akış bekçisi hız sınırlıyor · kiralık aracın kalan saniyesi)
  if (v.boost === true) out.boost = true;
  if (v.slow === true) out.slow = true;
  const rent = clampInt(v.rent, 0, 3600, 0);
  if (rent > 0) out.rent = rent;
  return out;
}

function sanitizeCityMission(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const title = clipStr(m.title, HUD_LIMITS.text, '');
  if (!title) return null;
  return {
    title,
    sub: clipStr(m.sub, HUD_LIMITS.sub, ''),
    dist: clampInt(m.dist, 0, 100000, 0),
    timeLeft: clampInt(m.timeLeft, -1, 86400, -1),
  };
}

/** Işık ipucu {kind,dist,text}: tür beyaz listede, menzil dışı (> 40 blok) ya da metinsiz ise null. */
function sanitizeLight(l) {
  if (!l || typeof l !== 'object' || Array.isArray(l)) return null;
  const kind = oneOf(l.kind, HUD_LIGHT_KINDS, '');
  const text = clipStr(l.text, 40, '');
  const dist = clampNum(l.dist, 0, 1e6, HUD_LIGHT_RANGE + 1, 1);
  if (!kind || !text || dist > HUD_LIGHT_RANGE) return null;
  return { kind, dist, text };
}

const DISTRICT_KEY_RE = /^[a-z0-9_]{1,24}$/;
/** Şehir durumu: yalnız şehirdeyken nesne, yoksa null. district bir bölge ANAHTARI ('merkez'); görünen ad hud.district'tedir. */
function sanitizeCity(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  return {
    kredi: clampInt(c.kredi, 0, 1e9, 0),
    district: typeof c.district === 'string' && DISTRICT_KEY_RE.test(c.district) ? c.district : '',
    mission: sanitizeCityMission(c.mission),
    radio: clipStr(c.radio, 40, ''),
    light: sanitizeLight(c.light),
  };
}

/** Derin dünya göstergesi: deniz seviyesine göre yükseklik (blok, +/−), derinlik bandı adı ve anahtarı. */
function sanitizeDepth(d) {
  if (!d || typeof d !== 'object') return { rel: 0, band: '', key: '' };
  return {
    rel: clampInt(d.rel, -1000, 1000, 0),
    band: clipStr(d.band, 32, ''),
    key: clipStr(d.key, 16, ''),
  };
}

/*
 * HUD nesnesini temiz kopyaya çevirir. Her alan sınırlanır, bilinmeyenler atılır, diziler
 * kırpılır; giriş nesnesi değiştirilmez ve sonuç girişle bellek paylaşmaz. Geçersiz giriş
 * (null, dizi, ilkel) EMPTY_HUD döner.
 */
export function sanitizeHud(h) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return EMPTY_HUD;
  const maxHp = clampNum(h.maxHp, 1, 200, 20, 1);
  const c = h.coords && typeof h.coords === 'object' ? h.coords : null;
  const z = h.zone && typeof h.zone === 'object' ? h.zone : null;
  const hotbar = sanitizeHotbar(h.hotbar);
  return {
    hp: clampNum(h.hp, 0, maxHp, maxHp, 1),
    maxHp,
    hunger: clampNum(h.hunger, 0, 20, 20, 1),
    oxygen: clampNum(h.oxygen, 0, 60, 15, 1),
    xpLevel: clampInt(h.xpLevel, 0, 9999, 0),
    hotbar,
    selected: clampInt(h.selected, 0, HUD_LIMITS.hotbarSlots - 1, 0),
    held: sanitizeHeld(h.held),
    target: sanitizeTarget(h.target),
    coords: {
      x: clampNum(c && c.x, -COORD_LIMIT, COORD_LIMIT, 0, 1),
      y: clampNum(c && c.y, -COORD_LIMIT, COORD_LIMIT, 0, 1),
      z: clampNum(c && c.z, -COORD_LIMIT, COORD_LIMIT, 0, 1),
    },
    depth: sanitizeDepth(h.depth),
    zone: { id: clampInt(z && z.id, 0, 15, 0), name: clipStr(z && z.name, HUD_LIMITS.name, '') },
    biome: clipStr(h.biome, 40, ''),
    time: clipStr(h.time, 24, 'gündüz'),
    weather: clipStr(h.weather, 24, ''),
    quest: sanitizeQuest(h.quest),
    boss: sanitizeBoss(h.boss),
    banner: sanitizeBanner(h.banner),
    parkour: sanitizeParkour(h.parkour),
    abilities: sanitizeAbilities(h.abilities),
    mode: oneOf(h.mode, HUD_MODES, 'macera'),
    cameraMode: oneOf(h.cameraMode, HUD_CAMERA_MODES, 'fp'),
    ui: oneOf(h.ui, HUD_UI_STATES, 'none'),
    fps: clampInt(h.fps, 0, 1000, 0),
    flying: h.flying === true,
    sprinting: h.sprinting === true,
    underwater: h.underwater === true,
    hint: clipStr(h.hint, HUD_LIMITS.hint, '') || null,
    mana: sanitizeMana(h.mana),
    effects: sanitizeEffects(h.effects),
    spell: sanitizeSpell(h.spell),
    energy: sanitizeEnergy(h.energy),
    jetpack: sanitizeJetpack(h.jetpack),
    charge: sanitizeCharge(h.charge),
    scanner: sanitizeScanner(h.scanner),
    shield: sanitizeShield(h.shield),
    portals: sanitizePortals(h.portals),
    dim: oneOf(h.dim, HUD_DIMS, 'overworld'),
    district: clipStr(h.district, HUD_LIMITS.name, ''),
    dimLoading: sanitizeDimLoading(h.dimLoading),
    vehicle: sanitizeVehicle(h.vehicle),
    city: sanitizeCity(h.city),
  };
}

/** JSON benzeri (düz nesne/dizi/ilkel) iki değerin derin eşitliği. */
export function hudEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
  }
  const aa = Array.isArray(a);
  if (aa !== Array.isArray(b)) return false;
  if (aa) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!hudEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (let i = 0; i < ka.length; i++) {
    const k = ka[i];
    if (!Object.prototype.hasOwnProperty.call(b, k) || !hudEqual(a[k], b[k])) return false;
  }
  return true;
}

export function createHudStore() {
  let state = EMPTY_HUD;
  const listeners = new Set();
  const store = {
    get: () => state,
    /** Ham ya da temiz HUD kabul eder; içerik aynıysa abonelere haber vermez. */
    set(next) {
      const clean = next === EMPTY_HUD ? EMPTY_HUD : sanitizeHud(next);
      if (clean === state || hudEqual(clean, state)) return false;
      state = clean;
      listeners.forEach((l) => {
        try {
          l();
        } catch {
          // Tek bir abonenin hatası diğerlerini ya da motoru durdurmasın.
        }
      });
      return true;
    },
    /** Mevcut durumun üzerine kısmi alanları yazar (iç içe nesneler bütün olarak değişir). */
    patch(partial) {
      if (!partial || typeof partial !== 'object') return false;
      return store.set({ ...state, ...partial });
    },
    reset() {
      return store.set(EMPTY_HUD);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

/* ------------------------------------------------------------------------------------------------
 * Yayın kısıtlayıcı: motor her karede push() çağırır, depoya en çok `hz` sıklıkla yazılır.
 * Önemli değişimler (arayüz durumu, can kaybı, boss, duyuru, bölge, görev, seçili yuva…)
 * beklemeden geçer. Kısıtlanan son durum, sürenin sonunda zamanlayıcıyla yine de yayımlanır.
 * ---------------------------------------------------------------------------------------------- */

/** Önemli alanların küçük özeti (motorun yeniden kullandığı nesneyi korumak için ilkel kopya). */
export function hudSignature(h, out = {}) {
  const hh = h || {};
  out.ui = hh.ui;
  out.mode = hh.mode;
  out.cameraMode = hh.cameraMode;
  out.selected = hh.selected;
  out.held = typeof hh.held === 'string' ? hh.held : hh.held && (hh.held.item || hh.held.name);
  out.hp = typeof hh.hp === 'number' ? hh.hp : 0;
  out.bossOn = Boolean(hh.boss);
  out.bannerText = (hh.banner && hh.banner.text) || '';
  out.zoneId = hh.zone ? hh.zone.id : 0;
  out.questTitle = (hh.quest && hh.quest.title) || '';
  out.hint = hh.hint || '';
  out.dim = hh.dim;
  out.district = hh.district || '';
  out.loading = Boolean(hh.dimLoading && hh.dimLoading.active);
  return out;
}

/** `sig` önceki yayının özeti; `h` yeni HUD. Önemli bir değişim varsa true. */
export function isImportantChange(sig, h) {
  if (!sig) return true;
  const n = hudSignature(h, {});
  if (n.ui !== sig.ui || n.mode !== sig.mode || n.cameraMode !== sig.cameraMode) return true;
  if (n.selected !== sig.selected || n.held !== sig.held) return true;
  if (n.bossOn !== sig.bossOn || n.bannerText !== sig.bannerText) return true;
  if (n.zoneId !== sig.zoneId || n.questTitle !== sig.questTitle || n.hint !== sig.hint) return true;
  // Boyut / bölge / geçiş yüklemesi: ekran durumu değişir, bekletilmeden yayımlanır.
  if (n.dim !== sig.dim || n.district !== sig.district || n.loading !== sig.loading) return true;
  // Hasar (can düşüşü) ve can sıfırlanması/yenilenmesi anında görünmeli.
  if (n.hp < sig.hp || (sig.hp <= 0 && n.hp > 0)) return true;
  return false;
}

const defaultNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export function createHudPublisher(publish, { hz = 15, now = defaultNow, setTimer, clearTimer } = {}) {
  const rate = clampNum(hz, 1, 60, 15);
  const minGap = 1000 / rate;
  const startTimer = setTimer || ((fn, ms) => setTimeout(fn, ms));
  const stopTimer = clearTimer || ((id) => clearTimeout(id));
  const sig = {};
  let hasSig = false;
  let latest = null;
  let pending = false;
  let lastAt = -Infinity;
  let timer = null;
  let cancelled = false;

  function cancelTimer() {
    if (timer !== null) {
      stopTimer(timer);
      timer = null;
    }
  }

  function emit() {
    cancelTimer();
    pending = false;
    lastAt = now();
    hudSignature(latest, sig);
    hasSig = true;
    publish(latest);
  }

  return {
    /** Her karede çağrılabilir; ucuzdur. `immediate: true` bekletmeden yayımlar. */
    push(hud, { immediate = false } = {}) {
      if (cancelled) return false;
      latest = hud;
      const t = now();
      const elapsed = t - lastAt;
      if (immediate || !hasSig || elapsed >= minGap || isImportantChange(sig, hud)) {
        emit();
        return true;
      }
      pending = true;
      if (timer === null) {
        timer = startTimer(() => {
          timer = null;
          if (pending && !cancelled) emit();
        }, Math.max(1, minGap - elapsed));
      }
      return false;
    },
    /** Bekleyen son durumu hemen yayımlar (duraklatma/çıkış öncesi). */
    flush() {
      if (!cancelled && pending) emit();
    },
    /** Zamanlayıcıyı bırakır; sonraki push'lar yok sayılır (destroy). */
    cancel() {
      cancelled = true;
      pending = false;
      cancelTimer();
    },
    get pending() {
      return pending;
    },
  };
}
