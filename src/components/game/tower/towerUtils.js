/*
 * Herkesler Yükseliyor - arayüz yardımcıları (bileşen olmayan her şey).
 *
 * Motor (src/game/tower/engine) burada içe aktarılmıyor: lobi paketine
 * three.js girmesin. Tarayıcı depolaması her erişimde try/catch içinde;
 * gizli sekme ya da kapalı site verisi oyunu düşürmemeli. Koşu oyunuyla
 * ortak, oyundan bağımsız yardımcılar (yeniden deneme, WebGL kontrolü,
 * güvenli alan) runnerUtils'ten gelir.
 */
import { TOWER_SIM_VERSION as SIM_VERSION, TC } from '../../../game/tower/sim/constants.js';
import { towerApi } from '../../../services/towerApi';
import { gameErrorMessage, gameErrorStatus } from '../../../services/gameApi';
import { classifyFinishError, withRetry } from '../runner/runnerUtils';

export { classifyFinishError, clampInt, detectWebGL, isCoarsePointer, isRetryable, SAFE_AREA_PAD, withRetry } from '../runner/runnerUtils';

/** İstemcinin konuştuğu kule simülasyonu sürümü (şartname §B, TOWER_SIM_VERSION). */
export const TOWER_SIM_VERSION = SIM_VERSION;

export const LOBBY_PATH = '/oyun/kule';
export const PLAY_PATH = '/oyun/kule/oyna';
export const MAX_END_TICK = TC.MAX_TICKS;
export const QUESTION_EVERY = TC.QUESTION_EVERY;
export const CORRECT_POINTS = TC.CORRECT_POINTS;

export const STORAGE_KEYS = {
    muted: 'hs_tower_muted',
    music: 'hs_tower_music',
    guestBest: 'hs_tower_best_guest',
    pending: 'hs_tower_pending',
    // Eski 'hs_tower_hint_seen' her kulede artıyordu (ilk katı geçemeyen de
    // 3 denemede ipucunu kaybediyordu); yeni sayaç yalnızca öğrenilen kuleleri sayar.
    hintLearned: 'hs_tower_hint_learned',
};

/** Sunucu kuleyi 2 saat sonra kabul etmiyor; bekleyen kayıt da o kadar yaşar. */
export const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

/*
 * Şıklar: iki büyük buton (pembe / mavi). Tonlar beyaz kalın metinle WCAG AA
 * kontrastı verecek koyulukta (runner LANES ile aynı ölçüt).
 */
export const CHOICES = [
    { key: 0, label: 'A', className: 'from-pink-600 to-rose-600', ring: 'ring-pink-300/70', kbd: '←' },
    { key: 1, label: 'B', className: 'from-sky-700 to-blue-700', ring: 'ring-sky-300/70', kbd: '→' },
];

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

/** Arka plan müziği; varsayılan açık (yalnızca bilerek kapatıldıysa '0'). */
export function loadMusicEnabled() {
    return storageGet(STORAGE_KEYS.music) !== '0';
}

export function saveMusicEnabled(enabled) {
    storageSet(STORAGE_KEYS.music, enabled ? '1' : '0');
}

/** Misafirin cihazdaki en iyi antrenman kulesi. */
export function loadGuestBest() {
    const v = readJson(STORAGE_KEYS.guestBest);
    if (!v || typeof v !== 'object') return { score: 0, floor: 0 };
    const score = Number.isFinite(v.score) && v.score > 0 ? Math.floor(v.score) : 0;
    const floor = Number.isFinite(v.floor) && v.floor > 0 ? Math.floor(v.floor) : 0;
    return { score, floor };
}

/** Rekoru günceller; `{ best, newBest }` döner. Skor ve kat ayrı ayrı en iyiyi tutar. */
export function recordGuestRun({ score, floor }) {
    const prev = loadGuestBest();
    const s = Math.max(0, Math.floor(Number(score) || 0));
    const f = Math.max(0, Math.floor(Number(floor) || 0));
    const newBest = s > prev.score;
    const best = { score: Math.max(prev.score, s), floor: Math.max(prev.floor, f) };
    if (newBest || f > prev.floor) storageSet(STORAGE_KEYS.guestBest, JSON.stringify(best));
    return { best, newBest };
}

/*
 * Gönderilemeyen bitiş. Kullanıcı kimliğiyle saklanır: ortak cihazda başka
 * hesap açılınca o hesabın adına gönderilmesin.
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
        p.end_tick <= MAX_END_TICK &&
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
 * Oyun içi "katı bırak" ipucu: oyuncu HINT_RUNS kez en az HINT_LEARN_FLOOR
 * kat dikene kadar her kulede gösterilir (yalnızca açılan kule sayılmaz).
 */
export const HINT_RUNS = 3;
export const HINT_LEARN_FLOOR = 3;

export function shouldShowTapHint() {
    try {
        const n = Number(window.localStorage.getItem(STORAGE_KEYS.hintLearned) || 0);
        return !Number.isFinite(n) || n < HINT_RUNS;
    } catch {
        return true;
    }
}

/** Bu kulede HINT_LEARN_FLOOR. kata ulaşıldı (kule başına bir kez çağrılır). */
export function markTapHintLearned() {
    try {
        const n = Number(window.localStorage.getItem(STORAGE_KEYS.hintLearned) || 0);
        window.localStorage.setItem(STORAGE_KEYS.hintLearned, String((Number.isFinite(n) ? n : 0) + 1));
    } catch {
        // depolama kapalı: ipucu her kulede görünür, sorun değil
    }
}

/** Antrenman paleti tohumu (yalnızca görsel): 1..2^32-1. */
export function randomSeed() {
    try {
        const buf = new Uint32Array(1);
        do {
            window.crypto.getRandomValues(buf);
        } while (buf[0] === 0);
        return buf[0];
    } catch {
        return (Date.now() % 0xfffffffe) + 1;
    }
}

/*
 * Sunucunun gönderdiği kule nesnesini motor için doğrular ve sadeleştirir.
 * Sorular süzülmez: motorun soru sayısı sunucununkiyle (question_count) aynı
 * olmalı, yoksa soru katları farklı oluşur ve kule replay'de reddedilir.
 * Bozuk tek bir soru bile varsa kule hiç başlatılmaz (null).
 */
export function normalizeTowerRun(run) {
    if (!run || typeof run !== 'object' || typeof run.id !== 'string' || !run.id || run.id.length > 64) return null;
    const seed = Number(run.seed ?? 0);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    const raw = Array.isArray(run.questions) ? run.questions : [];
    const questions = [];
    for (const item of raw) {
        const q = item?.question;
        if (!Number.isInteger(item?.index) || !q || typeof q.text !== 'string' || !Array.isArray(q.options) || q.options.length !== 2) {
            return null;
        }
        questions.push({
            index: item.index,
            question: {
                id: q.id ?? null,
                text: q.text,
                options: q.options.map((o) => String(o ?? '')),
                category: q.category ?? null,
            },
        });
    }
    questions.sort((a, b) => a.index - b.index);
    if (questions.some((q, i) => q.index !== i)) return null;
    if (questions.length > TC.MAX_QUESTIONS) return null;
    if (run.question_count != null && Number(run.question_count) !== questions.length) return null;
    return {
        id: run.id,
        seed,
        simVersion: Number(run.sim_version ?? TOWER_SIM_VERSION),
        questions,
        startedAt: run.started_at ?? null,
    };
}

/*
 * Cevap yanıtı: sunucu `{ answer: { q, choice, correct, correct_choice } }`
 * döner (alan adları için esnek: is_correct / correctChoice da kabul).
 */
export function parseAnswerResult(data) {
    const r = data?.answer && typeof data.answer === 'object' ? data.answer : data || {};
    const correct = r.correct === true || r.is_correct === true;
    const cc = Number.isInteger(r.correct_choice) ? r.correct_choice : Number.isInteger(r.correctChoice) ? r.correctChoice : null;
    const explanation = typeof r.explanation === 'string' && r.explanation.trim() ? r.explanation : null;
    return { correct, correctChoice: cc === 0 || cc === 1 ? cc : null, explanation };
}

/*
 * Yeniden deneme beklemeleri (ms). Cevap: sessizce 2 yeniden deneme; bitiş:
 * toplam 3 deneme, artan bekleme. Ağ / 5xx / 429 dışındaki hatalar (409,
 * 422) hiç yeniden denenmez. Testler beklemeyi sıfırlayabilsin diye açık nesne.
 */
export const TOWER_RETRY = {
    answer: [400, 1200],
    finish: [1000, 2500],
    // Bitişten önce yoldaki cevap isteklerini en fazla bu kadar bekle.
    settle: 4000,
};

/*
 * Aynı kule için tek bitiş isteği zinciri: oyun ekranı kapanıp lobi açılınca
 * lobi bekleyen kaydı gönderirken hâlâ süren deneme varsa ona katılır.
 */
const inflightFinish = new Map();

export function finishTowerOnce(runId, payload, client = towerApi) {
    const running = inflightFinish.get(runId);
    if (running) return running;
    // client: SPA'da towerApi; mobil gömmede kendi axios örneğiyle çalışan eşdeğeri (src/embed/embedApi.js).
    const p = withRetry(() => client.finish(runId, payload), TOWER_RETRY.finish).finally(() => {
        inflightFinish.delete(runId);
    });
    inflightFinish.set(runId, p);
    return p;
}

/** Kalıcı bitiş hatasının (rejected / gone) kullanıcıya metni. */
export function finishFailureText(err, kind = classifyFinishError(err)) {
    if (kind === 'rejected') return gameErrorMessage(err, 'Kulen doğrulanamadı; bu oyun sayılmadı.');
    if (kind === 'gone') {
        const fallback =
            gameErrorStatus(err) === 409
                ? 'Bu kule sunucuda kapanmış (yarıda bırakılmış ya da reddedilmiş); artık kaydedilemiyor.'
                : 'Bu kule artık kaydedilemiyor.';
        return gameErrorMessage(err, fallback);
    }
    return gameErrorMessage(err, 'Kulen gönderilemedi.');
}

/** Kaba (dokunmatik) cihazda titreşim desenleri; motorun onHaptic stilleri. */
export const HAPTIC_PATTERNS = {
    selection: 8,
    light: 12,
    medium: 24,
    heavy: [70, 40, 90],
    success: [18, 40, 28],
    warning: [40, 30, 40],
    error: [60, 40, 60],
};

/* Mükemmel yerleşim yazısı: kombo büyüdükçe coşar. */
const PERFECT_WORDS = [
    [10, 'Efsane!'],
    [6, 'İnanılmaz!'],
    [3, 'Harika!'],
];

export function perfectWord(combo) {
    for (const [min, word] of PERFECT_WORDS) if (combo >= min) return word;
    return 'Mükemmel!';
}

// --- HUD deposu -----------------------------------------------------------

export const EMPTY_HUD = Object.freeze({ score: 0, floor: 0, combo: 0, perfect: 0, maxCombo: 0 });

const num = (v, max = Number.MAX_SAFE_INTEGER) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};

/*
 * Motor aynı HUD nesnesini yeniden kullanır (render döngüsünde allocation
 * yok): kopyalamadan saklasak anlık görüntü kimliği değişmez ve HUD donardı.
 */
export function sanitizeHud(h) {
    if (!h || typeof h !== 'object') return EMPTY_HUD;
    return {
        score: num(h.score),
        floor: num(h.floor, 1_000_000),
        combo: num(h.combo, 1_000_000),
        perfect: num(h.perfect, 1_000_000),
        maxCombo: num(h.maxCombo, 1_000_000),
    };
}

/*
 * HUD için küçük dış depo: motor her yerleşimde bildiriyor; sayfa state'ine
 * yazmak tüm oyun ekranını yeniden çizerdi. useSyncExternalStore ile yalnız
 * HUD güncellenir.
 */
export function createHudStore() {
    let state = EMPTY_HUD;
    const listeners = new Set();
    return {
        get: () => state,
        set(next) {
            state = next;
            listeners.forEach((l) => l());
        },
        reset() {
            this.set(EMPTY_HUD);
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
