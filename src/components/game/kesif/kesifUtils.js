/*
 * Herkesler Keşfediyor - lobi yardımcıları (bileşen olmayan her şey).
 *
 * Bilerek hafif: motor (src/game/kesif) ve three burada içe aktarılmaz; yalnızca
 * saf `sim/rng.js` (Dünya Kodu) gelir. Tarayıcı depolaması her erişimde
 * try/catch içinde; gizli sekme ya da kapalı site verisi lobiyi düşürmemeli.
 *
 * GİRİŞ (ENTRY) SÖZLEŞMESİ — lobi -> oyun sayfası
 * -------------------------------------------------
 *   navigate('/oyun/kesif/oyna', { state: { entry } })     // buildEntry ile üretilir
 *   entry = {
 *     mode:   'macera' | 'insa' | 'harita',
 *     seed:   string | null,    // macera/insa: Dünya Kodu (8 hane BÜYÜK base36) ya da serbest metin; harita: null
 *     mapId:  string | null,    // harita: oynanacak harita; insa: düzenlenecek kendi haritam; aksi null
 *     saveId: string | null,    // macera: devam edilecek kayıt ('cloud' = bulut kaydı, diğerleri yerel kayıt kimliği)
 *     base:   'düz'|'ada'|'boş'|'çayır' | null,   // insa (yeni, haritasız): başlangıç zemini; oyun yok sayabilir
 *   }
 * Oyun sayfası `readEntry(location.state)` ile doğrular (geçersizse null -> lobiye dön).
 * Kurallar: macera -> seed ya da saveId gerekli; harita -> mapId gerekli; insa -> hepsi isteğe bağlı.
 */
import { makeWorldCode, normalizeWorldCode } from '../../../game/kesif/sim/rng.js';
import { gameErrorData, gameErrorStatus } from '../../../services/gameErrors';

export const LOBBY_PATH = '/oyun/kesif';
export const PLAY_PATH = '/oyun/kesif/oyna';

/** Sunucu varsayılanları (overview.profile gelince onunla değişir). */
export const DEFAULT_SLOT_PRICE = 10000;
export const DEFAULT_SLOT_PACK = 5;

export const MODES = ['macera', 'insa', 'harita'];
/** sim/mapFormat.js MAP_BASES ile aynı (testle sabitlenir). */
export const BASES = [
    { key: 'düz', label: 'Düz' },
    { key: 'ada', label: 'Ada' },
    { key: 'boş', label: 'Boş' },
    { key: 'çayır', label: 'Çayır' },
];

/** Raporlama nedenleri (sunucu: config('game_kesif.report_reasons')). */
export const REPORT_REASONS = [
    { key: 'uygunsuz', label: 'Uygunsuz içerik', hint: 'Çocuklara uygun olmayan yapı ya da yazı' },
    { key: 'siddet', label: 'Şiddet', hint: 'Korkutucu ya da şiddet içeren sahne' },
    { key: 'nefret', label: 'Nefret ya da zorbalık', hint: 'Birini hedef alan yapı, sembol ya da yazı' },
    { key: 'spam', label: 'Spam', hint: 'Reklam, tekrar eden ya da anlamsız harita' },
    { key: 'kisisel_bilgi', label: 'Kişisel bilgi', hint: 'İsim, telefon, adres ya da hesap bilgisi' },
    { key: 'diger', label: 'Diğer', hint: 'Yukarıdakilerden hiçbiri' },
];
export const REPORT_REASON_KEYS = REPORT_REASONS.map((r) => r.key);

export const TITLE_MIN = 2;
export const TITLE_MAX = 60;
export const DESC_MAX = 300;
export const NOTE_MAX = 200;

/* ------------------------------------------------------------------ */
/* Tarayıcı depolaması                                                 */
/* ------------------------------------------------------------------ */

export const STORAGE_KEYS = {
    base: 'hs_kesif_base',
};

export function storageGet(key) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function storageSet(key, value) {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

/** Tarayıcı WebGL 2 verebiliyor mu (motor yalnızca WebGL2). */
export function detectWebGL() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return false;
        gl.getExtension?.('WEBGL_lose_context')?.loseContext();
        return true;
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/* Sayı ve metin biçimleri                                             */
/* ------------------------------------------------------------------ */

const toInt = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

/** 1.234 -> "1,2 B", 1.250.000 -> "1,3 Mn" (kart sayaçları için kısa biçim). */
export function formatCount(n) {
    const v = Math.max(0, toInt(n));
    if (v < 1000) return String(v);
    const fmt = (x, unit) => `${(Math.round(x * 10) / 10).toLocaleString('tr-TR')} ${unit}`;
    if (v < 1000000) return v < 10000 ? fmt(v / 1000, 'B') : `${Math.round(v / 1000).toLocaleString('tr-TR')} B`;
    return fmt(v / 1000000, 'Mn');
}

/** Hak sayacı: "3/5". */
export function slotLabel(used, total) {
    return `${Math.max(0, toInt(used))}/${Math.max(0, toInt(total))}`;
}

/** Sayaç çubuğu yüzdesi (0..100); hak yokken 0. */
export function slotPercent(used, total) {
    const t = Math.max(0, toInt(total));
    if (t === 0) return 0;
    return Math.max(0, Math.min(100, Math.round((Math.max(0, toInt(used)) / t) * 100)));
}

/** Ekran okuyucu için hak özeti. */
export function slotSpeech(used, total) {
    const u = Math.max(0, toInt(used));
    const t = Math.max(0, toInt(total));
    if (t === 0) return 'Henüz harita hakkın yok';
    const free = Math.max(0, t - u);
    return `${t} haktan ${u} tanesi dolu, ${free} boş hak`;
}

/** Saniye -> "2 sa 5 dk" / "12 dk" / "1 dk'dan az". */
export function formatPlayTime(seconds) {
    const s = Math.max(0, toInt(seconds));
    const m = Math.floor(s / 60);
    if (m < 1) return '1 dk\'dan az';
    if (m < 60) return `${m} dk`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} sa ${rest} dk` : `${h} sa`;
}

/** ISO tarih / epoch ms -> "az önce", "5 dk önce", "3 gün önce", "12 Eki 2026". */
export function relativeTime(value, now = Date.now()) {
    if (value == null || value === '') return '';
    const t = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(t)) return '';
    const diff = Math.max(0, now - t);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'az önce';
    if (min < 60) return `${min} dk önce`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} sa önce`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} gün önce`;
    try {
        return new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
        return '';
    }
}

/* ------------------------------------------------------------------ */
/* Dünya Kodu                                                          */
/* ------------------------------------------------------------------ */

function randomUnit() {
    try {
        const c = typeof window !== 'undefined' ? window.crypto : null;
        if (c?.getRandomValues) {
            const a = new Uint32Array(1);
            c.getRandomValues(a);
            return a[0] / 4294967296;
        }
    } catch {
        // güvenli rastgele yoksa aşağıdaki yedek
    }
    return Math.random();
}

/** Yeni rastgele Dünya Kodu (8 hane base36 BÜYÜK harf). `rnd`: test için () => [0,1). */
export function generateWorldCode(rnd = randomUnit) {
    return makeWorldCode(rnd);
}

/** "abcd-1234" -> "ABCD1234"; geçersizse null. */
export function cleanWorldCode(input) {
    return normalizeWorldCode(typeof input === 'string' ? input : '');
}

/** Gösterim: "ABCD 1234". */
export function prettyWorldCode(code) {
    const c = cleanWorldCode(code);
    return c ? `${c.slice(0, 4)} ${c.slice(4)}` : String(code || '');
}

/** Panoya kopyala; başarıyı döner (izin yoksa eski yol, o da olmazsa false). */
export async function copyText(text) {
    const value = String(text ?? '');
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch {
        // izin reddedildi: eski yöntemi dene
    }
    try {
        if (typeof document === 'undefined') return false;
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
        document.body.removeChild(ta);
        return Boolean(ok);
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/* Giriş (entry) üretimi / doğrulaması                                 */
/* ------------------------------------------------------------------ */

const str = (v, max = 80) => (typeof v === 'string' && v.trim() !== '' && v.length <= max ? v.trim() : null);
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const id = (v) => (typeof v === 'string' && SAFE_ID.test(v) ? v : null);
const BASE_KEYS = BASES.map((b) => b.key);

/**
 * Lobiden oyuna giriş nesnesi. Geçersiz birleşimde null döner (çağıran
 * düğmeyi kapatmalı); geçerliyse yukarıdaki sözleşmenin tam biçimi.
 */
export function buildEntry({ mode, seed = null, mapId = null, saveId = null, base = null } = {}) {
    if (!MODES.includes(mode)) return null;
    const s = typeof seed === 'number' && Number.isFinite(seed) ? String(Math.trunc(seed)) : str(seed, 40);
    const entry = {
        mode,
        seed: mode === 'harita' ? null : s,
        mapId: mode === 'macera' ? null : id(mapId),
        saveId: mode === 'macera' ? id(saveId) : null,
        base: mode === 'insa' && !id(mapId) && BASE_KEYS.includes(base) ? base : null,
    };
    if (mode === 'macera' && !entry.seed && !entry.saveId) return null;
    if (mode === 'harita' && !entry.mapId) return null;
    return entry;
}

/**
 * Oyun sayfasında `location.state`'ten girişi okur: `{ entry }` ya da düz giriş
 * nesnesi kabul edilir; `consumed: true` ya da geçersiz içerik null döner.
 */
export function readEntry(state) {
    if (!state || typeof state !== 'object' || state.consumed) return null;
    const raw = state.entry && typeof state.entry === 'object' ? state.entry : state;
    if (raw.consumed) return null;
    return buildEntry(raw);
}

/* ------------------------------------------------------------------ */
/* Kayıt (save) özetleri                                               */
/* ------------------------------------------------------------------ */

/**
 * Yerel/bulut kayıt özetini ortak biçime getirir; kimliği olmayan atılır (null).
 *  { id, name, seed, worldCode, playTime, zone, updatedAt, source:'local'|'cloud' }
 */
export function normalizeSave(raw, source = 'local') {
    if (!raw || typeof raw !== 'object') return null;
    const sid = source === 'cloud' ? 'cloud' : id(String(raw.id ?? ''));
    if (!sid) return null;
    const seedRaw = raw.seed ?? raw.worldCode ?? raw.world_code ?? null;
    const seed = typeof seedRaw === 'number' ? String(seedRaw) : str(seedRaw, 40);
    const code = cleanWorldCode(raw.worldCode ?? raw.world_code ?? seed ?? '');
    const zone = raw.zone && typeof raw.zone === 'object' ? str(raw.zone.name, 40) : str(raw.zone, 40);
    const updated = raw.updatedAt ?? raw.updated_at ?? raw.savedAt ?? raw.saved_at ?? raw.createdAt ?? null;
    return {
        id: sid,
        name: str(raw.name, 60) || (source === 'cloud' ? 'Bulut kaydı' : 'Adsız macera'),
        seed,
        worldCode: code,
        playTime: Math.max(0, toInt(raw.playTime ?? raw.play_time)),
        zone,
        updatedAt: updated,
        source,
    };
}

/** Yerel + bulut listeyi birleştirir, en yeniden eskiye sıralar. */
export function mergeSaves(local = [], cloud = null) {
    const out = [];
    local.forEach((s) => {
        const n = normalizeSave(s, 'local');
        if (n) out.push(n);
    });
    if (cloud) {
        const n = normalizeSave(cloud, 'cloud');
        if (n) out.push(n);
    }
    const time = (s) => {
        const t = typeof s.updatedAt === 'number' ? s.updatedAt : Date.parse(s.updatedAt || '');
        return Number.isFinite(t) ? t : 0;
    };
    return out.sort((a, b) => time(b) - time(a));
}

/** Kayıttan oyuna giriş. */
export function entryForSave(save) {
    if (!save) return null;
    return buildEntry({ mode: 'macera', seed: save.seed || save.worldCode || null, saveId: save.id });
}

/* ------------------------------------------------------------------ */
/* Harita nesneleri                                                    */
/* ------------------------------------------------------------------ */

const COVER_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** Kapak yalnızca küçük, güvenli bir data-URL ise kullanılır (başka şema yok). */
export function safeCover(cover) {
    return typeof cover === 'string' && cover.length <= 60000 && COVER_RE.test(cover) ? cover : null;
}

/** Sunucudan gelen MapCard/MapMine'ı güvenli biçime çevirir; kimliksiz ise null. */
export function normalizeMap(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
    const a = raw.author && typeof raw.author === 'object' ? raw.author : {};
    return {
        id: raw.id,
        title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Adsız harita',
        description: typeof raw.description === 'string' ? raw.description : '',
        author: { id: a.id ?? null, username: typeof a.username === 'string' ? a.username : 'oyuncu', avatar: a.avatar ?? null, gender: a.gender ?? null },
        likes: Math.max(0, toInt(raw.likes)),
        plays: Math.max(0, toInt(raw.plays)),
        cover: safeCover(raw.cover),
        publishedAt: raw.published_at ?? null,
        liked: Boolean(raw.liked_by_me),
        mine: Boolean(raw.mine),
        visibility: raw.visibility === 'public' ? 'public' : raw.visibility === 'private' ? 'private' : null,
        status: ['ok', 'hidden', 'removed'].includes(raw.status) ? raw.status : null,
        blockCount: Math.max(0, toInt(raw.block_count)),
        reports: Math.max(0, toInt(raw.reports)),
        updatedAt: raw.updated_at ?? null,
    };
}

/**
 * Haritalarım kartındaki durum etiketi ve yapılabilecek eylemler.
 * removed: yalnızca silinebilir; hidden: yayınlanamaz (moderasyon); public: gizlenebilir.
 */
export function mapState(map) {
    if (map.status === 'removed') {
        return { key: 'removed', label: 'Kaldırıldı', tone: 'rose', note: 'Moderasyon ekibi bu haritayı topluluk kurallarına uymadığı için kaldırdı; artık kimse göremez. Harita hakkını geri almak için silebilirsin.', canPublish: false, canUnpublish: false, canEdit: false };
    }
    if (map.status === 'hidden') {
        return { key: 'hidden', label: 'Gizlendi (inceleniyor)', tone: 'amber', note: 'Bu harita raporlar ya da moderasyon nedeniyle gizlendi; ekibimiz inceliyor. İnceleme sürerken başkaları göremez. Sonuç olumluysa otomatik olarak yeniden açılır.', canPublish: false, canUnpublish: false, canEdit: true };
    }
    if (map.visibility === 'public') {
        return { key: 'public', label: 'Yayında', tone: 'emerald', note: '', canPublish: false, canUnpublish: true, canEdit: true };
    }
    return { key: 'private', label: 'Özel', tone: 'slate', note: '', canPublish: true, canUnpublish: false, canEdit: true };
}

/** Kapak yoksa kimlikten türeyen sabit renk üçlüsü (gökyüzü, tepe, zemin). */
export function coverPalette(seedKey) {
    let h = 2166136261;
    const s = String(seedKey || 'x');
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const hue = Math.abs(h) % 360;
    return {
        sky: `hsl(${hue} 55% 22%)`,
        hill: `hsl(${(hue + 40) % 360} 38% 38%)`,
        ground: `hsl(${(hue + 90) % 360} 42% 30%)`,
        spark: `hsl(${(hue + 180) % 360} 85% 70%)`,
    };
}

/* ------------------------------------------------------------------ */
/* Hata metinleri                                                      */
/* ------------------------------------------------------------------ */

/**
 * Hatayı kullanıcıya gösterilecek türe ayırır.
 *  kind: 'network' | 'unauth' | 'forbidden' | 'notfound' | 'conflict' | 'throttle' | 'server'
 *      | 'insufficient' | 'slot_cap' | 'no_slot' | 'invalid_map' | 'text_blocked' | 'too_large' | 'validation' | 'other'
 */
export function classifyKesifError(err) {
    const status = gameErrorStatus(err);
    const data = gameErrorData(err) || {};
    if (status == null) return { kind: 'network', status: null, data };
    if (status === 401) return { kind: 'unauth', status, data };
    if (status === 403) return { kind: 'forbidden', status, data };
    if (status === 404) return { kind: 'notfound', status, data };
    if (status === 409) return { kind: 'conflict', status, data };
    if (status === 429) return { kind: 'throttle', status, data };
    if (status >= 500) return { kind: 'server', status, data };
    if (status === 422) {
        const reason = data.reason;
        if (['insufficient', 'slot_cap', 'no_slot', 'invalid_map', 'text_blocked', 'too_large'].includes(reason)) return { kind: reason, status, data };
        return { kind: 'validation', status, data };
    }
    return { kind: 'other', status, data };
}

/** Sunucu metni varsa onu, yoksa türe uygun Türkçe metni döner. */
export function kesifErrorText(err, fallback = 'İşlem tamamlanamadı. Lütfen tekrar dene.') {
    const { kind, data } = classifyKesifError(err);
    const serverMsg = err?.response?.data?.message;
    const msg = typeof serverMsg === 'string' && serverMsg ? serverMsg : null;
    switch (kind) {
        case 'network':
            return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.';
        case 'unauth':
            return 'Bu işlem için giriş yapmalısın.';
        case 'throttle':
            return 'Çok hızlı gidiyorsun, birkaç saniye bekleyip tekrar dene.';
        case 'server':
            return 'Sunucuda bir sorun oluştu. Birazdan tekrar dene.';
        case 'notfound':
            return msg || 'Bu harita bulunamadı ya da artık yayında değil.';
        case 'forbidden':
            return msg || 'Bu işlem için iznin yok.';
        case 'no_slot':
            return 'Boş harita hakkın kalmadı. Yeni hak alabilir ya da eski bir haritanı silebilirsin.';
        case 'insufficient':
            return 'Yeterli jetonun yok.';
        case 'slot_cap':
            return msg || 'Bu hesap için en fazla harita hakkına ulaştın.';
        case 'text_blocked':
            return data.field === 'description'
                ? 'Açıklamada uygun olmayan bir ifade var. Lütfen değiştirip tekrar dene.'
                : 'Başlıkta uygun olmayan bir ifade var. Lütfen değiştirip tekrar dene.';
        case 'invalid_map':
            return 'Harita verisi geçersiz. Haritayı oyunda yeniden kaydetmeyi dene.';
        case 'too_large':
            return 'Kayıt çok büyük.';
        default:
            return msg || fallback;
    }
}

/** URL arama dizgesinden lobi bölümü: ?mode=macera|insa|topluluk|slots (+ eş anlamlılar). */
export function parseLobbyMode(search) {
    let raw = '';
    try {
        raw = new URLSearchParams(search || '').get('mode') || '';
    } catch {
        raw = '';
    }
    const m = raw.toLowerCase();
    if (m === 'macera' || m === 'adventure') return 'macera';
    if (m === 'insa' || m === 'inşa' || m === 'build') return 'insa';
    if (m === 'topluluk' || m === 'community') return 'topluluk';
    if (m === 'slots' || m === 'slot' || m === 'hak') return 'slots';
    if (m === 'haritalarim' || m === 'mine') return 'haritalarim';
    return null;
}
