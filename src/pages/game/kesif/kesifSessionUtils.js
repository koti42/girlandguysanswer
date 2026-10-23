/*
 * Herkesler Keşfediyor oturum yardımcıları (React yok; testlerde doğrudan sınanır).
 *
 * İçerik: ayar saklama, kayıt yuvası seçimi, yerel kayıt okuma/yazma (sim/saveStorage),
 * bulut kaydı kısıtlayıcısı, ödül talebi (claim) yürütücüsü, hata sınıflama, istatistik
 * özeti ve yükleme ipuçları. Tarayıcı depolaması her erişimde try/catch içindedir.
 */
import { DEFAULT_KESIF_SETTINGS, normalizeKesifSettings } from '../../../components/game/kesif/kxSettings';
import { classifyKesifError, cleanWorldCode } from '../../../components/game/kesif/kesifUtils';
import { buildCloudEnvelope, openCloudEnvelope } from '../../../game/kesif/sim/saveEnvelope.js';
import { seedFromInput } from '../../../game/kesif/sim/rng.js';

export const SETTINGS_KEY = 'kesif.settings.v1';

/** Yerel kayıt modülü (saf JS; oyun sayfası parçasında tembel yüklenir, testlerde değiştirilebilir). */
export const loadSaveStorage = () => import('../../../game/kesif/sim/saveStorage.js');

const safe = (fn, fallback) => {
    try {
        return fn();
    } catch {
        return fallback;
    }
};

/* ------------------------------------------------------------------ */
/* Ayarlar                                                             */
/* ------------------------------------------------------------------ */

/** localStorage'dan ayarlar (bozuk/eksik alanlar varsayılana düşer). */
export function loadSettings() {
    const raw = safe(() => window.localStorage.getItem(SETTINGS_KEY), null);
    if (!raw) return normalizeKesifSettings({});
    return normalizeKesifSettings(safe(() => JSON.parse(raw), {}));
}

export function saveSettings(settings) {
    safe(() => window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeKesifSettings(settings))));
}

/**
 * Başlangıç ayarları: sakladığın + (verilmişse) native/üst katman tercihleri.
 * muted/music/accessibility dışarıdan geldiğinde onlar kazanır.
 */
export function initialSettings({ muted, music, accessibility } = {}) {
    const base = loadSettings();
    const out = { ...base };
    if (typeof muted === 'boolean') out.muted = muted;
    if (typeof music === 'boolean') out.music = music;
    if (accessibility === true) out.accessibility = true;
    return normalizeKesifSettings(out, DEFAULT_KESIF_SETTINGS);
}

/* ------------------------------------------------------------------ */
/* Yerel kayıt                                                         */
/* ------------------------------------------------------------------ */

/** Girişten kayıt yuvası taban adı ('m-abcd1234' ya da kayıt kimliği). */
export function baseSlotFor(entry, save) {
    if (entry?.saveId && entry.saveId !== 'cloud') return entry.saveId;
    const src = entry?.seed ?? save?.seed ?? 'macera';
    const code = typeof src === 'string' ? cleanWorldCode(src) : null;
    if (code) return `m-${code.toLowerCase()}`;
    return `m-${seedFromInput(src).toString(36)}`;
}

/** Yeni macera için boş yuva: aynı dünya koduna ait kayıt varsa üzerine yazılmaz (-2, -3…). */
export async function pickFreeSlot(mod, adapter, base) {
    let existing = [];
    try {
        existing = (await adapter.list(mod.SAVE_KEY_PREFIX)).map((k) => k.slice(mod.SAVE_KEY_PREFIX.length));
    } catch {
        return base;
    }
    if (existing.indexOf(base) < 0) return base;
    for (let i = 2; i < 10; i++) {
        const name = `${base}-${i}`;
        if (existing.indexOf(name) < 0) return name;
    }
    return base;
}

export function saveFailText(code) {
    switch (code) {
        case 'full':
            return 'Kayıt alanı dolu. Lobiden eski bir kaydı silip tekrar dene.';
        case 'quota':
            return 'Cihazda yer kalmadı; oyun kaydedilemedi.';
        case 'format':
            return 'Kayıt oluşturulamadı.';
        default:
            return 'Oyun bu cihaza kaydedilemedi.';
    }
}

/** Yerel kaydı okur ve doğrular; motor ham (serileştirilmiş) kayıt nesnesini bekler. */
export async function readLocalSave(mod, adapter, slot) {
    const r = await mod.loadFromSlot(adapter, slot);
    if (!r.ok) {
        const text =
            r.code === 'missing'
                ? 'Bu kayıt bulunamadı; silinmiş olabilir.'
                : r.code === 'newer'
                  ? 'Bu kayıt daha yeni bir sürümden. Uygulamayı güncelle.'
                  : 'Kayıt okunamadı; bozuk olabilir.';
        return { ok: false, code: r.code, text };
    }
    let save = null;
    try {
        save = JSON.parse(await adapter.get(mod.SAVE_KEY_PREFIX + r.slot));
    } catch {
        save = null;
    }
    if (!save || typeof save !== 'object') return { ok: false, code: 'format', text: 'Kayıt okunamadı; bozuk olabilir.' };
    return { ok: true, save, slot: r.slot };
}

/** Bulut kaydı gövdesi -> ham kayıt nesnesi | null. */
export const cloudSaveFrom = (body) => openCloudEnvelope(body);

/** Sunucudan gelen harita nesnesinin `data` alanı (nesne ya da JSON metni) -> nesne | null. */
export function mapDataFromResponse(res) {
    const raw = res?.map?.data ?? res?.data ?? null;
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw === 'string') return safe(() => JSON.parse(raw), null);
    return null;
}

/* ------------------------------------------------------------------ */
/* Bulut kaydı kısıtlayıcısı                                           */
/* ------------------------------------------------------------------ */

export const CLOUD_MIN_GAP_MS = 30000;
export const CLOUD_RETRY_MS = 60000;

/**
 * Üye bulut kaydı: en son kayıt tutulur, otomatik kayıtlar en çok `minGapMs`'de bir gider;
 * elle/çıkış kaydı beklemez. Tek istek uçuşta; hata (ağ/5xx/429) sessiz, bir dakika sonra
 * yeniden denenir. 401 ve "çok büyük" bulut yazmayı bu oturum için kapatır.
 *
 * state(): 'idle' | 'saving' | 'saved' | 'error' | 'off'
 */
export function createCloudSaver({
    getApi,
    now = () => Date.now(),
    minGapMs = CLOUD_MIN_GAP_MS,
    retryMs = CLOUD_RETRY_MS,
    onState,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
} = {}) {
    let latest = null;
    let lastSentAt = -Infinity;
    let timer = null;
    let inflight = null;
    let state = 'idle';
    let off = false;

    const setState = (s, detail) => {
        state = s;
        if (onState) safe(() => onState(s, detail));
    };
    const cancelTimer = () => {
        if (timer !== null) {
            clearTimer(timer);
            timer = null;
        }
    };

    async function send() {
        if (off || !latest) return false;
        if (inflight) return inflight;
        const api = getApi();
        if (!api || typeof api.putSave !== 'function') return false;
        const env = buildCloudEnvelope(latest);
        if (!env.ok) {
            if (env.code === 'too_large') {
                off = true;
                setState('off', { reason: 'too_large' });
            }
            return false;
        }
        const sent = latest;
        latest = null;
        cancelTimer();
        setState('saving');
        inflight = (async () => {
            try {
                await api.putSave(env.save);
                lastSentAt = now();
                setState('saved', { truncated: env.truncated });
                return true;
            } catch (err) {
                const { kind } = classifyKesifError(err);
                if (kind === 'unauth' || kind === 'forbidden' || kind === 'too_large' || kind === 'invalid_map' || kind === 'validation') {
                    off = true;
                    latest = null;
                    setState('off', { reason: kind });
                    return false;
                }
                if (!latest) latest = sent;
                setState('error', { kind });
                timer = setTimer(() => {
                    timer = null;
                    send();
                }, retryMs);
                return false;
            } finally {
                inflight = null;
            }
        })();
        return inflight;
    }

    return {
        /** reason: 'auto' | 'manual' | 'exit'. Dönen söz gönderimin sonucudur (zamanlanırsa false). */
        push(save, reason = 'auto') {
            if (off || !save) return Promise.resolve(false);
            latest = save;
            const elapsed = now() - lastSentAt;
            if (reason !== 'auto' || elapsed >= minGapMs) return send();
            if (timer === null) {
                timer = setTimer(() => {
                    timer = null;
                    send();
                }, Math.max(1000, minGapMs - elapsed));
            }
            return Promise.resolve(false);
        },
        /** Bekleyen kaydı hemen gönderir; en çok `timeoutMs` bekler (çıkış asılı kalmasın). */
        async flush(timeoutMs = 2500) {
            if (off || (!latest && !inflight)) return true;
            let t;
            const wait = new Promise((r) => {
                t = setTimeout(() => r(false), timeoutMs);
            });
            const job = latest ? send() : inflight;
            const ok = await Promise.race([job, wait]);
            clearTimeout(t);
            return ok;
        },
        dispose() {
            cancelTimer();
        },
        state: () => state,
        hasPending: () => Boolean(latest) || Boolean(inflight),
    };
}

/* ------------------------------------------------------------------ */
/* Ödül talebi                                                         */
/* ------------------------------------------------------------------ */

export const REWARD_RETRY_MS = [2000, 8000, 30000];

/** Erteli talep bekleme sınırları (ms): sunucu `remaining_seconds`/`retry_after` verir; makul aralığa kırpılır. */
export const DEFER_MIN_MS = 5000;
export const DEFER_MAX_MS = 3600000;
export const DEFER_PREREQ_MS = 120000;

/**
 * Motorun 'reward' olayı -> sunucu talebi. Başarıda ya da 409/422/404'te motora
 * "talep edildi" bildirilir (tekrar gelmesin). Ağ/5xx/429'da geri çekilmeli yeniden deneme.
 * Günlük tavan tam doluyken (`claimed:false`) talep tüketilmez: bildirilmez, ertesi gün alınır.
 *
 * Sunucu ödül kapıları (CAYDIRICI; API: KesifRewardService):
 *  - 422 `no_session`: oturum yok -> `startSession()` (play/start) çağrılır, BAŞARILIRSA talep bir kez yeniden denenir;
 *    olmazsa talep motorun bekleyen kuyruğunda kalır (bildirilmez; motor 90 sn'de bir yeniden yayar).
 *  - 422 `too_early` / `prerequisite`, 429 `hourly_cap`: ödül TÜKETİLMEZ ve motora "talep edildi" DENMEZ; talep ertelenir
 *    (`remaining_seconds`/`retry_after`, önkoşulda 2 dk). Süre dolana dek aynı anahtar için motor olayları yutulur
 *    (sunucuya boşuna vurulmaz); `retryDue()` (her başarılı ping'te) zamanı gelenleri hemen yeniden dener.
 *  - 422 `world_cap` / `lifetime_cap` ve diğer 422: kalıcı; motora bildirilir (kuyruktan düşer).
 */
export function createRewardClaimer({
    getApi,
    isMember,
    getSeed,
    markClaimed,
    onGranted,
    onCapped,
    onGuest,
    onStopped,
    startSession,
    onDeferred,
    delays = REWARD_RETRY_MS,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    now = () => Date.now(),
}) {
    const busy = new Set();
    const deferred = new Map();
    const timers = new Set();
    let stopped = false;
    let guestNoted = false;
    let disposed = false;

    const defer = (key, ms, info) => {
        busy.delete(key);
        deferred.set(key, now() + Math.min(DEFER_MAX_MS, Math.max(DEFER_MIN_MS, ms)));
        if (onDeferred) safe(() => onDeferred(key, info));
    };

    async function attempt(key, tries, sessionRetried = false) {
        if (disposed || stopped) {
            busy.delete(key);
            return;
        }
        const api = getApi();
        try {
            const res = await api.claim(key, getSeed ? getSeed() : undefined);
            busy.delete(key);
            if (disposed) return;
            if (res?.claimed === false) {
                // Günlük tavan doldu: kayıt yazılmadı, yarın yeniden talep edilebilir.
                if (onCapped) safe(() => onCapped(key, res));
                return;
            }
            if (markClaimed) safe(() => markClaimed(key));
            if (onGranted) safe(() => onGranted(key, res || {}));
        } catch (err) {
            const { kind, status, data } = classifyKesifError(err);
            const reason = data && typeof data.reason === 'string' ? data.reason : '';
            if (status === 422 && reason === 'no_session') {
                if (!sessionRetried && typeof startSession === 'function') {
                    // Oturum aç, sonra bir kez yeniden dene. Açılamazsa talep kuyrukta kalır (tüketilmez).
                    let ok = false;
                    try {
                        ok = Boolean(await startSession());
                    } catch {
                        ok = false;
                    }
                    if (ok && !disposed && !stopped) {
                        attempt(key, tries, true);
                        return;
                    }
                }
                busy.delete(key);
                return;
            }
            if (status === 422 && (reason === 'too_early' || reason === 'prerequisite')) {
                const wait = reason === 'too_early' ? (Number(data.remaining_seconds) || 0) * 1000 : DEFER_PREREQ_MS;
                defer(key, wait, { reason, remaining_seconds: Number(data.remaining_seconds) || 0, requires: data.requires });
                return;
            }
            if (status === 429 && reason === 'hourly_cap') {
                defer(key, (Number(data.retry_after) || 0) * 1000, { reason, retry_after: Number(data.retry_after) || 0 });
                return;
            }
            if (kind === 'conflict' || kind === 'notfound' || kind === 'validation' || status === 400 || status === 422) {
                busy.delete(key);
                if (markClaimed) safe(() => markClaimed(key));
                return;
            }
            if (kind === 'unauth' || kind === 'forbidden') {
                busy.delete(key);
                stopped = true;
                if (onStopped) safe(() => onStopped(kind));
                return;
            }
            if (tries >= delays.length || disposed) {
                busy.delete(key);
                return;
            }
            const id = setTimer(() => {
                timers.delete(id);
                attempt(key, tries + 1, sessionRetried);
            }, delays[tries]);
            timers.add(id);
        }
    }

    function begin(key) {
        if (typeof key !== 'string' || !key || busy.has(key)) return false;
        const due = deferred.get(key);
        if (due !== undefined) {
            if (now() < due) return false; // süre dolmadı: sunucuya boşuna vurma
            deferred.delete(key);
        }
        if (!isMember()) {
            if (!guestNoted) {
                guestNoted = true;
                if (onGuest) safe(() => onGuest(key));
            }
            return false;
        }
        busy.add(key);
        attempt(key, 0);
        return true;
    }

    return {
        claim: begin,
        /** Zamanı gelen erteli talepleri hemen yeniden dener (her başarılı ping'te çağrılır). Dönen: denenen sayı. */
        retryDue() {
            let n = 0;
            const t = now();
            Array.from(deferred.keys()).forEach((key) => {
                if (deferred.get(key) <= t && begin(key)) n += 1;
            });
            return n;
        },
        /** Erteli (henüz denenmemiş) anahtarlar; test/teşhis. */
        deferredKeys: () => Array.from(deferred.keys()),
        dispose() {
            disposed = true;
            timers.forEach((id) => clearTimeout(id));
            timers.clear();
            deferred.clear();
        },
    };
}

/* ------------------------------------------------------------------ */
/* Küçük harici depo (panel sürümü)                                    */
/* ------------------------------------------------------------------ */

/** Envanter değişince artan sayaç; yalnızca abone panel yeniden çizilir (ekranın tamamı değil). */
export function createVersionStore() {
    let v = 0;
    const listeners = new Set();
    return {
        get: () => v,
        bump() {
            v += 1;
            listeners.forEach((l) => safe(l));
        },
        subscribe(l) {
            listeners.add(l);
            return () => listeners.delete(l);
        },
    };
}

/* ------------------------------------------------------------------ */
/* Motor hatası / yükleme / istatistik                                 */
/* ------------------------------------------------------------------ */

/** 'webgl' | 'contextlost' | 'other' */
export function classifyEngineError(err) {
    const code = String(err?.code || err?.name || '').toLowerCase();
    const msg = String(err?.message || err || '').toLowerCase();
    if (/context.?lost|contextlost/.test(code) || /context.?lost|lost context|bağlam/.test(msg)) return 'contextlost';
    if (/webgl/.test(code) || /webgl/.test(msg)) return 'webgl';
    return 'other';
}

/** getLoadProgress() sonucu (sayı 0..1 | 0..100 ya da {value|progress, label|stage}) -> {value:0..1, label} */
export function normalizeProgress(p) {
    let value = null;
    let label = '';
    if (typeof p === 'number') value = p;
    else if (p && typeof p === 'object') {
        value = typeof p.value === 'number' ? p.value : typeof p.progress === 'number' ? p.progress : typeof p.p === 'number' ? p.p : null;
        label = typeof p.label === 'string' ? p.label : typeof p.stage === 'string' ? p.stage : typeof p.text === 'string' ? p.text : '';
    }
    if (value === null || !Number.isFinite(value)) return { value: 0, label };
    if (value > 1) value /= 100;
    return { value: Math.max(0, Math.min(1, value)), label };
}

export const LOADING_TIPS = [
    'Bulmaca odalarında takılırsan görev kutusundaki ipucu düğmesini kullan.',
    'Geceleri meşale taşı: gölgeler ışıktan kaçar.',
    'Her bölgenin sonunda bir koruyucu var; hazırlıklı git.',
    'Mühürleri açmak için bölgedeki Anahtar Kristallerini topla.',
    'Kırdığın bloklar, bulduğun eşyalar yeni tarifleri açar.',
    'Parkur plakalarında düşersen kontrol noktasına dönersin, endişelenme.',
    'Dünya kodunu arkadaşınla paylaş; aynı dünyayı keşfedin.',
    'İnşa modunda uçabilir ve sınırsız blok kullanabilirsin.',
];

/** Aygıta özel giriş ipuçları: masaüstü tuşları (E envanter, R üret, 1-9 eşya) / dokunmatik düğme adları. */
export const KEY_TIPS = [
    'Envanter için E, üretim menüsü için R tuşuna bas; 1-9 tuşlarıyla elindeki eşyayı seç.',
];
export const TOUCH_TIPS = [
    'Alttaki Envanter ve Üret düğmeleriyle eşyalarını yönet; kırdıkça yeni tarifler açılır.',
];

/** touch: true → dokunmatik, false → klavye/fare; verilmezse yalnızca genel ipuçları. */
export const tipsFor = (touch) => (touch === undefined ? LOADING_TIPS : LOADING_TIPS.concat(touch ? TOUCH_TIPS : KEY_TIPS));

export const pickTip = (i, touch) => {
    const list = tipsFor(touch);
    return list[Math.abs(Math.trunc(i)) % list.length];
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

/** Motor istatistiği + olay sayaçlarından köprü sonucu için düz özet. */
export function pickStats(stats, counters = {}) {
    const s = stats && typeof stats === 'object' ? stats : {};
    const zoneRaw = s.zone && typeof s.zone === 'object' ? s.zone.id : s.zone ?? s.zoneId;
    return {
        puzzles: Math.max(num(s.puzzlesSolved ?? s.puzzles), num(counters.puzzles)),
        zone: Math.max(num(zoneRaw), num(counters.zone)),
        bosses: Math.max(num(s.bossesDefeated ?? s.bosses), num(counters.bosses)),
        playSeconds: num(s.playTime ?? s.playSeconds),
        victory: counters.victory === true,
    };
}

/** HUD'daki zafer ekranı için istatistik nesnesi (VictoryScreen anahtarları). */
export function victoryStatsFrom(evtStats, engineStats, counters = {}) {
    const a = evtStats && typeof evtStats === 'object' ? evtStats : {};
    const b = engineStats && typeof engineStats === 'object' ? engineStats : {};
    const pick = (k, alt) => {
        const v = a[k] ?? b[k] ?? (alt ? a[alt] ?? b[alt] : undefined);
        return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    };
    const out = {
        playTime: pick('playTime', 'playSeconds'),
        puzzlesSolved: pick('puzzlesSolved', 'puzzles') ?? (counters.puzzles > 0 ? counters.puzzles : undefined),
        crystals: pick('crystals') ?? (counters.crystals > 0 ? counters.crystals : undefined),
        achievements: pick('achievements'),
        mobsKilled: pick('mobsKilled'),
        blocksBroken: pick('blocksBroken'),
        blocksPlaced: pick('blocksPlaced'),
        distance: pick('distance'),
        deaths: pick('deaths'),
    };
    Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
    return out;
}

/** Ölüm olayından neden ve kaybedilen yığın sayısı (şekil esnek okunur). */
export function deathInfoFrom(evt) {
    const e = evt && typeof evt === 'object' ? evt : {};
    const reason = e.reason ?? e.info ?? (e.cause ? { cause: e.cause, by: e.by } : null);
    return { reason: reason ?? null, lostCount: num(e.lostCount ?? e.lost ?? e.dropped ?? e.stacks) };
}

/** Bölge numarası (olaydaki `zone` sayı ya da {id}). */
export function zoneIndexOf(evt) {
    if (!evt) return null;
    const z = evt.zone;
    if (typeof z === 'number' && Number.isFinite(z)) return Math.max(0, Math.floor(z));
    if (z && typeof z === 'object' && typeof z.id === 'number') return Math.max(0, Math.floor(z.id));
    if (typeof evt.index === 'number') return Math.max(0, Math.floor(evt.index));
    return null;
}

/** Dışa aktarılan harita için kısa hata metni. */
export function exportErrorText(res) {
    const first = Array.isArray(res?.errors) ? res.errors[0] : null;
    if (typeof first === 'string' && first) return first;
    return 'Harita dışa aktarılamadı. Biraz daha inşa edip tekrar dene.';
}

/** Motorun dünya kodu: api.getWorldCode() (sistem) ya da api.worldCode (çekirdek özelliği); yoksa ''. */
export function worldCodeOf(g) {
    if (!g) return '';
    const raw = safe(() => (typeof g.getWorldCode === 'function' ? g.getWorldCode() : g.worldCode));
    return typeof raw === 'string' ? raw : '';
}
