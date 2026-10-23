/*
 * Mobil uygulama <-> gömülü oyun köprüsü (şartname v2 §D.2, protokol v1).
 *
 * Native -> web, sayfa yüklenmeden önce: window.__HS_NATIVE__ = { v, platform,
 * token, user, safeArea, muted, music, haptics, avatar }.
 * Native -> web, çalışırken: window.__hsNativeReceive({ type, ... })
 * (pause | resume | back | setAvatar | setMuted | setMusic | safeArea | photoSaved).
 * Web -> native: window.ReactNativeWebView.postMessage(JSON.stringify({ type, ... }))
 * (ready | haptic | exit | result | settings | error | openUrl | login | speak | speakStop | savePhoto | savePhotoPart).
 *
 * Her iki yönde de mesajlar şemayla doğrulanır; bilinmeyen tip ve bozuk
 * alan sessizce yok sayılır. ReactNativeWebView yoksa (normal tarayıcı,
 * test) gönderimler etkisizdir. __HS_NATIVE__ yoksa yapılandırma adres
 * çubuğundaki test parametrelerinden okunur (token ASLA adresten okunmaz:
 * loglara ve geçmişe düşer).
 *
 * Token yalnızca bellekte tutulur; localStorage'a yazılmaz.
 */
export const BRIDGE_VERSION = 1;
export const GAMES = ['kosu', 'kule', 'kesif', 'avatar'];
export const HAPTIC_STYLES = ['light', 'medium', 'heavy', 'success', 'warning', 'error', 'selection'];

// Aynı titreşim stili bu süreden sık gönderilmez (jeton hattında köprüyü boğmasın).
export const HAPTIC_MIN_GAP_MS = 90;
// Tek mesajın en büyük JSON boyu.
const MAX_MESSAGE_CHARS = 4096;
// Dinleyici bağlanmadan gelen mesajlardan en fazla bu kadarı saklanır.
const MAX_QUEUE = 32;

// Object.hasOwn eski Android WebView'larda (Chrome < 93) yok.
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isBool = (v) => typeof v === 'boolean';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isShortStr = (v, max = 200) => typeof v === 'string' && v.length <= max;

// Foto kaydı (savePhoto): sınırlar embed/photoBridge.js ile paylaşılır.
export const PHOTO_PART_CHARS = 3000; // 4'ün katı: parça başına 2250 bayt
export const PHOTO_MAX_BYTES = 2500000;
export const PHOTO_MAX_PARTS = 1200;
const isPhotoId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);

/*
 * Site içi göreli yol: "/oyun/kosu", "/profile/ayse?tab=badges". Protokol,
 * "//alan" ve ters bölü yok; native tarafı ayrıca doğrular.
 */
export function isSafeInternalPath(url) {
    if (typeof url !== 'string' || url.length === 0 || url.length > 300) return false;
    if (url[0] !== '/' || url[1] === '/' || url[1] === '\\') return false;
    return /^\/[A-Za-z0-9\-._~/?=&%#+]*$/.test(url);
}

/*
 * result özeti: oyun adı + skor zorunlu, diğer alanlar düz değer
 * (sayı / boolean / kısa metin / null). Native yalnızca lobiyi tazeler.
 */
function validResult(m) {
    if (!GAMES.includes(m.game) || m.game === 'avatar') return false;
    if (!(m.score === null || (Number.isInteger(m.score) && m.score >= 0))) return false;
    return Object.entries(m).every(([k, v]) => k === 'type' || v === null || isNum(v) || isBool(v) || isShortStr(v, 100));
}

const OUTGOING = {
    ready: (m) => m.game === undefined || GAMES.includes(m.game),
    haptic: (m) => HAPTIC_STYLES.includes(m.style),
    exit: () => true,
    result: validResult,
    settings: (m) => isBool(m.muted) && isBool(m.music),
    error: (m) => typeof m.message === 'string' && m.message.length > 0 && m.message.length <= 500,
    openUrl: (m) => isSafeInternalPath(m.url),
    login: () => true,
    // Erişilebilirlik: native TTS ile oku / okumayı durdur (web'de speechSynthesis kullanılır).
    speak: (m) => typeof m.text === 'string' && m.text.trim().length > 0 && m.text.length <= 600,
    speakStop: () => true,
    // Keşif foto modu (Neon Meridyen): fotoğrafı cihaza kaydet. Üstbilgi + sıralı base64 parçaları (tek iletiyi 4096 karakter sınırı aşar); bkz. embed/photoBridge.js.
    savePhoto: (m) => isPhotoId(m.id) && /^[\w.-]{1,64}\.jpe?g$/i.test(m.name || '') && m.mime === 'image/jpeg' && Number.isInteger(m.bytes) && m.bytes >= 1
        && m.bytes <= PHOTO_MAX_BYTES && Number.isInteger(m.parts) && m.parts >= 1 && m.parts <= PHOTO_MAX_PARTS,
    savePhotoPart: (m) => isPhotoId(m.id) && Number.isInteger(m.index) && m.index >= 0 && m.index < PHOTO_MAX_PARTS && typeof m.data === 'string'
        && m.data.length >= 4 && m.data.length <= PHOTO_PART_CHARS && /^[A-Za-z0-9+/]+={0,2}$/.test(m.data),
};

const INCOMING = {
    pause: () => true,
    resume: () => true,
    back: () => true,
    setAvatar: (m) => m.avatar === null || isObj(m.avatar),
    setMuted: (m) => isBool(m.muted),
    setMusic: (m) => isBool(m.music),
    // Döndürme sonrası güvenli alan (yatay kilitli oyun): her kenar 0-200 px.
    safeArea: (m) => ['top', 'right', 'bottom', 'left'].every((k) => isNum(m[k]) && m[k] >= 0 && m[k] <= 200),
    // savePhoto sonucu: native fotoğrafı albüme yazdı mı? (id = savePhoto üstbilgisindeki kimlik). status (isteğe bağlı, eski
    // uygulamalarda yok): working | saved | permission_denied | too_large | cancelled | busy | failed; bilinmeyen değer photoBridge'de failed sayılır.
    photoSaved: (m) => isPhotoId(m.id) && isBool(m.ok) && (m.status === undefined || (typeof m.status === 'string' && /^[a-z_]{1,24}$/.test(m.status))),
};

export const OUTGOING_TYPES = Object.keys(OUTGOING);
export const INCOMING_TYPES = Object.keys(INCOMING);

/** Web -> native mesajı geçerli mi? */
export function validateOutgoing(msg) {
    if (!isObj(msg) || typeof msg.type !== 'string' || !has(OUTGOING, msg.type)) return false;
    return OUTGOING[msg.type](msg) === true;
}

/** Native -> web mesajını çözer ve doğrular; geçersizse null. JSON metni de kabul edilir. */
export function parseIncoming(raw) {
    let msg = raw;
    if (typeof raw === 'string') {
        if (raw.length > MAX_MESSAGE_CHARS * 4) return null;
        try {
            msg = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    if (!isObj(msg) || typeof msg.type !== 'string' || !has(INCOMING, msg.type)) return null;
    return INCOMING[msg.type](msg) === true ? msg : null;
}

// ---- Native yapılandırması ----

const clampPx = (v) => (isNum(v) ? Math.max(0, Math.min(200, Math.round(v))) : 0);

function sanitizeSafeArea(sa) {
    if (!isObj(sa)) return null;
    return { top: clampPx(sa.top), right: clampPx(sa.right), bottom: clampPx(sa.bottom), left: clampPx(sa.left) };
}

function sanitizeToken(t) {
    // Sanctum: "12|AbC..."; JWT de olabilir. Boşluk / kontrol karakteri yok.
    return typeof t === 'string' && t.length > 0 && t.length <= 2048 && /^[A-Za-z0-9|._\-~+/=]+$/.test(t) ? t : null;
}

function sanitizeUser(u) {
    if (!isObj(u)) return null;
    const id = typeof u.id === 'string' || Number.isInteger(u.id) ? u.id : null;
    if (id === null || String(id).length > 64) return null;
    return {
        id,
        username: isShortStr(u.username, 64) ? u.username : '',
        gender: u.gender === 'female' || u.gender === 'male' ? u.gender : null,
    };
}

// Avatar burada yalnızca biçimce elenir; çizimden önce normalizeAvatar'dan geçer.
const sanitizeAvatar = (a) => (isObj(a) ? a : null);

/*
 * Tarayıcıda (native yokken) test: ?platform=ios&muted=1&music=0&haptics=0&safe=47,0,34,0&gender=female
 * Token yok: misafir.
 */
function configFromQuery(search) {
    let q;
    try {
        q = new URLSearchParams(search || '');
    } catch {
        q = new URLSearchParams();
    }
    const safe = (q.get('safe') || '').split(',').map((n) => Number(n));
    const gender = q.get('gender');
    return {
        v: BRIDGE_VERSION,
        platform: q.get('platform') === 'ios' || q.get('platform') === 'android' ? q.get('platform') : 'web',
        token: null,
        user: gender === 'female' || gender === 'male' ? { id: null, username: '', gender } : null,
        safeArea: safe.length === 4 && safe.every(Number.isFinite) ? sanitizeSafeArea({ top: safe[0], right: safe[1], bottom: safe[2], left: safe[3] }) : null,
        muted: q.get('muted') === '1',
        music: q.get('music') !== '0',
        haptics: q.get('haptics') !== '0',
        avatar: null,
        // ?a11y=1: erişilebilirlik modu (soru seslendirilir, okunurken oyun bekler).
        accessibility: q.get('a11y') === '1',
        native: false,
    };
}

/**
 * Native'in enjekte ettiği yapılandırma (doğrulanmış kopya). Yoksa adres
 * parametrelerinden test yapılandırması (native: false, misafir).
 */
export function readNativeConfig(win = typeof window !== 'undefined' ? window : undefined) {
    const raw = win?.__HS_NATIVE__;
    if (!isObj(raw)) return configFromQuery(win?.location?.search);
    const user = sanitizeUser(raw.user);
    return {
        v: Number.isInteger(raw.v) ? raw.v : BRIDGE_VERSION,
        platform: raw.platform === 'ios' || raw.platform === 'android' ? raw.platform : 'web',
        token: sanitizeToken(raw.token),
        user,
        safeArea: sanitizeSafeArea(raw.safeArea),
        muted: raw.muted === true,
        music: raw.music !== false,
        haptics: raw.haptics !== false,
        avatar: sanitizeAvatar(raw.avatar),
        accessibility: raw.accessibility === true,
        native: true,
    };
}

/** ?game= parametresi; geçersizse null. */
export function readGame(search = typeof window !== 'undefined' ? window.location.search : '') {
    try {
        const g = new URLSearchParams(search || '').get('game');
        return GAMES.includes(g) ? g : null;
    } catch {
        return null;
    }
}

/*
 * Native'in bildirdiği güvenli alanı CSS değişkenlerine yazar
 * (--hs-safe-top/right/bottom/left). Oyun bileşenleri
 * max(…, var(--hs-safe-*, env(safe-area-inset-*))) kullanır: değişken yoksa env().
 */
export function applySafeArea(safeArea, root = typeof document !== 'undefined' ? document.documentElement : null) {
    if (!root || !safeArea) return;
    for (const side of ['top', 'right', 'bottom', 'left']) {
        root.style.setProperty(`--hs-safe-${side}`, `${clampPx(safeArea[side])}px`);
    }
}

// ---- Gönderim ----

const nativeTarget = (win) => {
    const t = win?.ReactNativeWebView;
    return t && typeof t.postMessage === 'function' ? t : null;
};

/**
 * Web -> native mesajı. Şemaya uymayan mesaj gönderilmez (false). Native
 * yoksa etkisiz (false). Gönderildiyse true.
 */
export function postToNative(type, payload = {}, win = typeof window !== 'undefined' ? window : undefined) {
    const msg = { ...(isObj(payload) ? payload : {}), type };
    if (!validateOutgoing(msg)) {
        if (import.meta.env?.DEV) console.warn('[embed] geçersiz köprü mesajı yok sayıldı', msg);
        return false;
    }
    const target = nativeTarget(win);
    if (!target) return false;
    let json;
    try {
        json = JSON.stringify(msg);
    } catch {
        return false;
    }
    if (json.length > MAX_MESSAGE_CHARS) return false;
    try {
        target.postMessage(json);
        return true;
    } catch {
        return false;
    }
}

/*
 * Titreşim isteği. Kullanıcı native ayarlarda titreşimi kapattıysa
 * (haptics: false) gönderilmez; aynı stil HAPTIC_MIN_GAP_MS içinde tekrar
 * gelirse (ör. motor ve arayüz aynı anı bildirirse) bir kez gider.
 */
export function createHaptics({ enabled = true, post = postToNative, now = () => Date.now() } = {}) {
    const last = new Map();
    return (style) => {
        if (!enabled || !HAPTIC_STYLES.includes(style)) return false;
        const t = now();
        const prev = last.get(style);
        if (prev != null && t - prev < HAPTIC_MIN_GAP_MS) return false;
        last.set(style, t);
        return post('haptic', { style });
    };
}

// ---- Alım ----

const listeners = new Set();
let queue = [];

function dispatch(msg) {
    if (listeners.size === 0) {
        // Uygulama henüz bağlanmadı (ör. React kökü çizilmeden "pause" geldi): sakla.
        queue.push(msg);
        if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
        return;
    }
    listeners.forEach((l) => {
        try {
            l(msg);
        } catch (err) {
            console.error('[embed] köprü dinleyicisi hata verdi', err);
        }
    });
}

/** Native mesajlarını dinler; bağlanınca bekleyen mesajlar (sırayla) teslim edilir. Aboneliği bırakan işlev döner. */
export function onNativeMessage(listener) {
    listeners.add(listener);
    if (queue.length) {
        const pending = queue;
        queue = [];
        pending.forEach((m) => dispatch(m));
    }
    return () => listeners.delete(listener);
}

/*
 * Native'in injectJavaScript ile çağırdığı alıcı; yalnızca beklenen tipleri
 * işler. İşlendiyse true. Dönüş native'e `__ack ok` olarak gider: Android geri
 * tuşunda ok=false native'in ekrandan çıkmasını sağlar. Bu yüzden dinleyici
 * yokken gelen `back` (parça inerken, hata ekranı abone olmadan) kuyruğa
 * alınmaz ve false döner; aksi hâlde geri tuşu hiçbir şey yapmazdı.
 */
export function receiveFromNative(raw) {
    const msg = parseIncoming(raw);
    if (!msg) return false;
    if (msg.type === 'back' && listeners.size === 0) return false;
    if (msg.type === 'safeArea') {
        // Native betik CSS değişkenlerini zaten yazar; doğrudan çağrıda da uygula ve ölçüleri tazele.
        applySafeArea(msg);
        try {
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
        } catch {
            // olay üretilemedi
        }
        return true;
    }
    dispatch(msg);
    return true;
}

/** window.__hsNativeReceive'i kurar (tekrar çağrılırsa aynısı kalır). */
export function installNativeReceiver(win = typeof window !== 'undefined' ? window : undefined) {
    if (!win) return;
    if (win.__hsNativeReceive === receiveFromNative) return;
    Object.defineProperty(win, '__hsNativeReceive', { value: receiveFromNative, configurable: true, writable: false });
}

/** Yalnızca testler için: dinleyicileri ve kuyruğu sıfırlar. */
export function __resetBridgeForTests() {
    listeners.clear();
    queue = [];
}
