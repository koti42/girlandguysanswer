/*
 * Erişilebilirlik seslendirmesi (görme engelli oyuncular): soru metni ve
 * sonuçlar sesli okunur. Web'de Web Speech API (speechSynthesis), mobil
 * WebView'de native TTS (köprü 'speak' mesajı; expo-speech). Hiçbiri yoksa
 * sessizce geçer ama onEnd yine çağrılır: oyun akışı seslendirmeye bağımlı değil.
 *
 * speak(text, { onEnd, maxMs }): okuma bitince (ya da en geç maxMs sonra) onEnd
 * bir kez çağrılır. Yeni speak öncekini iptal eder (önceki onEnd hemen çalışır).
 */

export const SPEECH_LANG = 'tr-TR';
export const SPEECH_MAX_MS = 15000;
const NATIVE_MAX_CHARS = 600;

/** Okuma süresi tahmini (native TTS bitişini bildirmez): ~14 karakter/sn + giriş payı. */
export function estimateSpeechMs(text) {
    const n = String(text || '').trim().length;
    if (!n) return 0;
    return Math.min(SPEECH_MAX_MS, 700 + Math.ceil(n * 72));
}

function nativeBridge(win) {
    const t = win?.ReactNativeWebView;
    return t && typeof t.postMessage === 'function' ? t : null;
}

function synth(win) {
    const s = win?.speechSynthesis;
    return s && typeof s.speak === 'function' && typeof win.SpeechSynthesisUtterance === 'function' ? s : null;
}

export function isSpeechSupported(win = typeof window !== 'undefined' ? window : undefined) {
    return Boolean(nativeBridge(win) || synth(win));
}

export function createSpeaker({ enabled = true, lang = SPEECH_LANG, win = typeof window !== 'undefined' ? window : undefined } = {}) {
    let current = null; // { timer, done }

    const finish = () => {
        const c = current;
        if (!c) return;
        current = null;
        if (c.timer) clearTimeout(c.timer);
        if (!c.done) {
            c.done = true;
            try {
                c.onEnd?.();
            } catch {
                /* dinleyici hatası seslendirmeyi düşürmesin */
            }
        }
    };

    const cancel = () => {
        const native = nativeBridge(win);
        const s = synth(win);
        try {
            if (native) native.postMessage(JSON.stringify({ type: 'speakStop' }));
            else if (s) s.cancel();
        } catch {
            /* yoksay */
        }
        finish();
    };

    const speak = (text, { onEnd, maxMs = SPEECH_MAX_MS } = {}) => {
        const t = String(text || '').replace(/\s+/g, ' ').trim();
        cancel();
        if (!enabled || !t) {
            try {
                onEnd?.();
            } catch {
                /* yoksay */
            }
            return false;
        }
        const entry = { timer: null, done: false, onEnd };
        current = entry;
        const budget = Math.max(300, Math.min(maxMs, estimateSpeechMs(t) + 1500));
        const native = nativeBridge(win);
        const s = synth(win);
        try {
            if (native) {
                native.postMessage(JSON.stringify({ type: 'speak', text: t.slice(0, NATIVE_MAX_CHARS) }));
                // Native bitişi bildirmez: tahmini süre kadar bekle.
                entry.timer = setTimeout(finish, Math.min(maxMs, estimateSpeechMs(t)));
                return true;
            }
            if (s) {
                const u = new win.SpeechSynthesisUtterance(t);
                u.lang = lang;
                u.rate = 1;
                u.onend = () => {
                    if (current === entry) finish();
                };
                u.onerror = u.onend;
                s.speak(u);
                // Bazı tarayıcılar onend'i hiç atmaz: güvenlik ağı.
                entry.timer = setTimeout(finish, budget);
                return true;
            }
        } catch {
            /* aşağıda bitir */
        }
        finish();
        return false;
    };

    return { speak, cancel, supported: Boolean(nativeBridge(win) || synth(win)) };
}
