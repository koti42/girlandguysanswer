/*
 * Herkesler Koşuyor - arayüz yardımcıları (bileşen olmayan her şey).
 *
 * Motor (src/game/runner/engine) burada içe aktarılmıyor: lobi ve hub
 * paketine three.js girmesin. Tarayıcı depolaması her erişimde try/catch
 * içinde; gizli sekme ya da kapalı site verisi oyunu düşürmemeli.
 */
import { gameApi, gameErrorMessage, gameErrorStatus } from '../../../services/gameApi';
// Yalnızca sabitler modülü (bağımlılığı yok): sim'in kendisi lobi paketine girmez.
import { SIM_VERSION } from '../../../game/runner/sim/constants.js';

/** İstemcinin konuştuğu simülasyon sürümü (v2 şartname §A, SIM_VERSION) — sim ile tek kaynak. */
export const RUNNER_SIM_VERSION = SIM_VERSION;

export const STORAGE_KEYS = {
    muted: 'hs_runner_muted',
    music: 'hs_runner_music',
    guestBest: 'hs_runner_best_guest',
    pending: 'hs_runner_pending',
    hintSeen: 'hs_runner_hint_seen',
};

/** Sunucu koşuyu 2 saat sonra kabul etmiyor; bekleyen kayıt da o kadar yaşar. */
export const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

/*
 * Şerit adları ve kapı renkleri (pembe / mor / mavi), şartname §6.
 * Tonlar beyaz kalın 11-14px metinle WCAG AA (4.5:1) kontrastı verecek
 * koyulukta: 500'lük tonlar 3.2-3.8 kalıyordu.
 */
export const LANES = [
    { key: 0, label: 'Sol', arrow: '◀', className: 'from-pink-600 to-rose-600', ring: 'ring-pink-300/60', text: 'text-pink-200' },
    { key: 1, label: 'Orta', arrow: '▲', className: 'from-violet-600 to-purple-600', ring: 'ring-violet-300/60', text: 'text-violet-200' },
    { key: 2, label: 'Sağ', arrow: '▶', className: 'from-sky-700 to-blue-700', ring: 'ring-sky-300/60', text: 'text-sky-200' },
];

// HUD çarpan rozeti: beyaz metinle AA kontrastı (sky-500 2.8, fuchsia-500 3.5 idi).
export const MULT_STYLES = {
    1: 'bg-white/15 text-white',
    2: 'bg-sky-700 text-white',
    3: 'bg-violet-600 text-white',
    4: 'bg-fuchsia-700 text-white',
    5: 'bg-gradient-to-r from-gold to-coral text-slate-950',
};

export const MULT_MAX = 5;

/*
 * Oyun katmanındaki tam ekran paneller için güvenli alan dolgusu: çentik,
 * yuvarlak köşe ve iOS ana ekran çubuğu (viewport-fit=cover ile env() dolar,
 * yoksa 0 olur ve 1rem kalır). Tailwind sınıfları taranabilsin diye düz metin.
 */
/*
 * Mobil uygulama gömmesinde (embed.html) native güvenli alanı
 * --hs-safe-top/right/bottom/left CSS değişkenleriyle verir (Android
 * WebView env()'i çoğu cihazda 0 bildiriyor); değişken yoksa env() kullanılır.
 */
export const SAFE_AREA_PAD =
    'pt-[max(1rem,var(--hs-safe-top,env(safe-area-inset-top)))] pr-[max(1rem,var(--hs-safe-right,env(safe-area-inset-right)))] pb-[max(1rem,var(--hs-safe-bottom,env(safe-area-inset-bottom)))] pl-[max(1rem,var(--hs-safe-left,env(safe-area-inset-left)))]';

function storageGet(key) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function storageSet(key, value) {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function storageRemove(key) {
    try {
        window.localStorage.removeItem(key);
    } catch {
        // depolama kapalıysa yapacak bir şey yok
    }
}

function readJson(key) {
    const raw = storageGet(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function loadMuted() {
    return storageGet(STORAGE_KEYS.muted) === '1';
}

export function saveMuted(muted) {
    storageSet(STORAGE_KEYS.muted, muted ? '1' : '0');
}

/*
 * Arka plan müziği (efektlerden ayrı). Varsayılan açık: yalnızca bilerek
 * kapatıldıysa ('0') kapalı; depolama kapalı/bozuk değer açık sayılır.
 */
export function loadMusicEnabled() {
    return storageGet(STORAGE_KEYS.music) !== '0';
}

export function saveMusicEnabled(enabled) {
    storageSet(STORAGE_KEYS.music, enabled ? '1' : '0');
}

/** Misafirin cihazdaki en iyi antrenman koşusu. */
export function loadGuestBest() {
    const v = readJson(STORAGE_KEYS.guestBest);
    if (!v || typeof v !== 'object') return { score: 0, distance: 0 };
    const score = Number.isFinite(v.score) && v.score > 0 ? Math.floor(v.score) : 0;
    const distance = Number.isFinite(v.distance) && v.distance > 0 ? Math.floor(v.distance) : 0;
    return { score, distance };
}

/** Rekoru günceller; `{ best, newBest }` döner. Skor ve mesafe ayrı ayrı en iyiyi tutar. */
export function recordGuestRun({ score, distance }) {
    const prev = loadGuestBest();
    const s = Math.max(0, Math.floor(Number(score) || 0));
    const d = Math.max(0, Math.floor(Number(distance) || 0));
    const newBest = s > prev.score;
    const best = { score: Math.max(prev.score, s), distance: Math.max(prev.distance, d) };
    if (newBest || d > prev.distance) storageSet(STORAGE_KEYS.guestBest, JSON.stringify(best));
    return { best, newBest };
}

/*
 * Gönderilemeyen bitiş. Kullanıcı kimliğiyle saklanır: ortak cihazda başka
 * hesap açılınca o hesabın adına gönderilmesin (sunucu 404 dönerdi zaten).
 */
export function savePending({ userId, runId, endTick, inputs, clientScore }) {
    if (!runId) return false;
    return storageSet(
        STORAGE_KEYS.pending,
        JSON.stringify({
            v: 1,
            user_id: userId ?? null,
            run_id: runId,
            end_tick: endTick,
            inputs: inputs ?? '',
            client_score: Number.isFinite(clientScore) ? Math.min(Math.max(0, Math.floor(clientScore)), 2000000000) : null,
            saved_at: Date.now(),
        })
    );
}

/** Geçerli ve süresi dolmamış bekleyen kayıt; değilse (ve bozuksa siler) null. */
export function loadPending(userId, now = Date.now()) {
    const p = readJson(STORAGE_KEYS.pending);
    if (!p) return null;
    const valid =
        p.v === 1 &&
        typeof p.run_id === 'string' &&
        p.run_id.length > 0 &&
        p.run_id.length <= 64 &&
        Number.isInteger(p.end_tick) &&
        p.end_tick >= 0 &&
        typeof p.inputs === 'string' &&
        Number.isFinite(p.saved_at);
    if (!valid || now - p.saved_at > PENDING_TTL_MS || p.saved_at - now > 60_000) {
        storageRemove(STORAGE_KEYS.pending);
        return null;
    }
    if (userId != null && p.user_id != null && String(p.user_id) !== String(userId)) return null;
    return p;
}

export function clearPending(runId) {
    const p = readJson(STORAGE_KEYS.pending);
    if (!runId || !p || p.run_id === runId) storageRemove(STORAGE_KEYS.pending);
}

/*
 * Oyun içi kontrol ipucu: ilk birkaç koşuda gösterilir. Sayaç her koşunun
 * geri sayımında bir artar. Depolama kapalıysa ipucu gösterilir (güvenli
 * varsayılan: yeni oyuncu ilk engelde ölmesin).
 */
export const HINT_RUNS = 3;

export function shouldShowControlsHint() {
    try {
        const n = Number(window.localStorage.getItem(STORAGE_KEYS.hintSeen) || 0);
        return !Number.isFinite(n) || n < HINT_RUNS;
    } catch {
        return true;
    }
}

export function markControlsHintShown() {
    try {
        const n = Number(window.localStorage.getItem(STORAGE_KEYS.hintSeen) || 0);
        window.localStorage.setItem(STORAGE_KEYS.hintSeen, String((Number.isFinite(n) ? n : 0) + 1));
    } catch {
        // depolama kapalı: ipucu her koşuda görünür, sorun değil
    }
}

/*
 * Kontroller (lobideki "Nasıl oynanır?" ve oyun içi ipucu aynı kaynaktan).
 * hint: oyun içi tek satırlık ipucundaki kısa metin.
 */
export const CONTROL_ROWS = [
    { what: 'Şerit değiştir', touch: 'Sağa / sola kaydır', keys: ['←', '→'], alt: ['A', 'D'], hintTouch: '◀ ▶ kaydır: şerit', hintKeys: '← → şerit' },
    { what: 'Zıpla', touch: 'Yukarı kaydır', keys: ['↑', 'Boşluk'], alt: ['W'], hintTouch: '▲ yukarı: zıpla', hintKeys: '↑/Boşluk zıpla' },
    { what: 'Kay (eğil)', touch: 'Aşağı kaydır', keys: ['↓'], alt: ['S'], hintTouch: '▼ aşağı: kay', hintKeys: '↓ kay' },
    { what: 'Duraklat', touch: 'Sağ üstteki buton', keys: ['Esc'], alt: ['P'], hintTouch: null, hintKeys: 'Esc duraklat' },
];

export function controlsHintText(touch) {
    return CONTROL_ROWS.map((r) => (touch ? r.hintTouch : r.hintKeys))
        .filter(Boolean)
        .join(' · ');
}

/** Kaba pointer (dokunmatik) cihaz mı? Motorun webgl.js kontrolüyle aynı. */
export function isCoarsePointer() {
    try {
        return Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    } catch {
        return false;
    }
}

/** Antrenman tohumu: 1..2^32-1, Math.random kullanmadan. */
export function randomSeed() {
    try {
        const buf = new Uint32Array(1);
        do {
            window.crypto.getRandomValues(buf);
        } while (buf[0] === 0);
        return buf[0];
    } catch {
        // Çok eski tarayıcı: antrenman tohumunun güvenlikle ilgisi yok.
        return (Date.now() % 0xfffffffe) + 1;
    }
}

/*
 * Lobide motoru yüklemeden hafif WebGL kontrolü. Dereceli koşu açılıp
 * oynanamaz bir cihazda sunucuda boşa "aktif" koşu kalmasın diye.
 * Yalnızca WebGL2: three r163+ WebGL1'i desteklemiyor (motorun
 * isWebGLAvailable'ı da yalnızca webgl2'ye bakıyor). WebGL1 yeterli
 * sayılsaydı eski cihazda koşu açılıp motor yüklenince terk edilirdi.
 */
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

/** Ağ hatası, zaman aşımı, 429 ve 5xx yeniden denenir; 4xx kararları denenmez. */
export function isRetryable(err) {
    const status = gameErrorStatus(err);
    if (status == null) return true;
    return status === 408 || status === 429 || status >= 500;
}

/*
 * Kapı isteği neden sonuçsuz kaldı:
 *  - network: ağ / zaman aşımı / 5xx / 429 (yeniden denemeler de bitti)
 *  - pending: sunucu bu an karar vermedi (409 "Çok erken.", 422, 404...) ->
 *    yeniden denenmez; kapı koşu sonunda replay şeridiyle değerlendirilir.
 */
export function gateFailureReason(err) {
    return isRetryable(err) ? 'network' : 'pending';
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `fn`'i `delays.length + 1` kez dener; yalnızca yeniden denenebilir
 * hatalarda bekleyip tekrarlar. `shouldStop()` true dönerse bırakır.
 */
export async function withRetry(fn, delays = [], shouldStop = () => false) {
    let lastErr;
    for (let i = 0; i <= delays.length; i += 1) {
        try {
            return await fn(i);
        } catch (err) {
            lastErr = err;
            if (!isRetryable(err) || i === delays.length || shouldStop()) throw err;
            await wait(delays[i]);
            if (shouldStop()) throw err;
        }
    }
    throw lastErr;
}

/*
 * HUD çarpanı (şartname §3.7): sonucu bilinen kapılar index sırasıyla
 * işlenir; sonucu bilinmeyen kapı "değişmemiş çarpan" sayılır.
 */
export function multiplierFrom(results) {
    let mult = 1;
    const keys = Object.keys(results || {})
        .map(Number)
        .filter(Number.isInteger)
        .sort((a, b) => a - b);
    for (const k of keys) {
        const r = results[k];
        if (r === true) mult = Math.min(mult + 1, MULT_MAX);
        else if (r === false) mult = 1;
    }
    return mult;
}

export function clampInt(v, min, max, fallback = min) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

/*
 * Sunucunun gönderdiği koşu nesnesini motor için doğrular ve sadeleştirir.
 * Kapılar süzülmez: motorun kapı sayısı sunucununkiyle (gate_count) aynı
 * olmalı, yoksa pist farklı üretilir ve koşu replay'de reddedilir. Bozuk
 * tek bir kapı bile varsa koşu hiç başlatılmaz (null).
 */
export function normalizeRun(run) {
    if (!run || typeof run !== 'object' || typeof run.id !== 'string' || !run.id) return null;
    const seed = Number(run.seed);
    if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) return null;
    const raw = Array.isArray(run.gates) ? run.gates : [];
    const gates = [];
    for (const g of raw) {
        const q = g?.question;
        if (!Number.isInteger(g?.index) || !q || typeof q.text !== 'string' || !Array.isArray(q.options) || q.options.length !== 3) {
            return null;
        }
        gates.push({
            index: g.index,
            question: {
                id: q.id,
                text: q.text,
                options: q.options.map((o) => String(o ?? '')),
                category: q.category ?? null,
                difficulty: q.difficulty ?? null,
            },
        });
    }
    gates.sort((a, b) => a.index - b.index);
    if (gates.some((g, i) => g.index !== i)) return null;
    if (run.gate_count != null && Number(run.gate_count) !== gates.length) return null;
    return {
        id: run.id,
        seed,
        simVersion: Number(run.sim_version ?? RUNNER_SIM_VERSION),
        gates,
        startedAt: run.started_at ?? null,
    };
}

/*
 * Yeniden deneme beklemeleri (ms). Kapı: sessizce 2 yeniden deneme; bitiş:
 * toplam 3 deneme, artan bekleme. Ağ / 5xx / 429 dışındaki hatalar (409, 422)
 * hiç yeniden denenmez (isRetryable). Testler beklemeyi sıfırlayabilsin diye
 * dışa açık bir nesne.
 */
export const RUNNER_RETRY = {
    gate: [400, 1200],
    finish: [1000, 2500],
    // Bitişten önce yoldaki kapı isteklerini en fazla bu kadar bekle.
    settle: 4000,
};

/*
 * Aynı koşu için tek bitiş isteği zinciri. Oyun ekranı kapanıp lobi açılınca
 * lobi bekleyen kaydı gönderirken hâlâ süren deneme varsa ona katılır; sunucu
 * zaten idempotent ama boşuna ikinci istek ve çift bildirim olmasın.
 */
const inflightFinish = new Map();

export function finishRunOnce(runId, payload, client = gameApi) {
    const running = inflightFinish.get(runId);
    if (running) return running;
    // client: SPA'da gameApi; mobil gömmede kendi axios örneğiyle çalışan eşdeğeri (src/embed/embedApi.js).
    const p = withRetry(() => client.finishRunner(runId, payload), RUNNER_RETRY.finish).finally(() => {
        inflightFinish.delete(runId);
    });
    inflightFinish.set(runId, p);
    return p;
}

/*
 * Bitiş hatasının anlamı:
 *  - rejected: 422, sunucu koşuyu doğrulamadı (ya da istek geçersiz) -> bekleyen silinir
 *  - gone: 403/404/409/410, koşu artık bitirilemez (terk edilmiş, süresi geçmiş...) -> silinir
 *  - auth: 401, oturum düşmüş -> bekleyen kalır, girişten sonra lobi gönderir
 *  - retry: ağ / 5xx / 429 -> bekleyen kalır, "Tekrar dene"
 */
export function classifyFinishError(err) {
    const status = gameErrorStatus(err);
    if (status === 422) return 'rejected';
    if (status === 401) return 'auth';
    if (status === 403 || status === 404 || status === 409 || status === 410) return 'gone';
    if (status != null && status >= 400 && status < 500 && !isRetryable(err)) return 'gone';
    return 'retry';
}

/*
 * Kalıcı bitiş hatasının (rejected / gone) kullanıcıya metni. Sunucunun
 * mesajı ("Koşu yarıda bırakılmış.", "Koşu doğrulanamadı; skor
 * kaydedilmedi.") varsa o, yoksa duruma göre genel bir açıklama.
 */
export function finishFailureText(err, kind = classifyFinishError(err)) {
    if (kind === 'rejected') return gameErrorMessage(err, 'Koşun doğrulanamadı; bu koşu sayılmadı.');
    if (kind === 'gone') {
        const fallback =
            gameErrorStatus(err) === 409
                ? 'Bu koşu sunucuda kapanmış (yarıda bırakılmış ya da reddedilmiş); artık kaydedilemiyor.'
                : 'Bu koşu artık kaydedilemiyor.';
        return gameErrorMessage(err, fallback);
    }
    return gameErrorMessage(err, 'Koşun gönderilemedi.');
}
