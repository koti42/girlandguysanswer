/*
 * Titreşim (haptik) olayları: motor olaylarını köprünün stil adlarına
 * çevirir (saf mantık; DOM/three yok, node'da test edilir).
 *
 * Stil adları mobil köprüsüyle aynı (şartname D.2):
 * 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection'.
 *
 * Jeton titreşimi seyreltilir: art arda toplanan jetonlarda (jeton hattı,
 * mıknatıs) en fazla saniyede 10 kez (100 ms aralık). Diğer olaylar
 * zaten seyrek; seyreltilmez.
 */

export const HAPTIC_COIN_MIN_MS = 100;

/**
 * Motor olayı -> titreşim stili (yoksa null).
 * type: sim olay tipi ('coin', 'jump', 'land', 'stumble', 'crash', 'power',
 * 'shieldBreak') ya da 'gateCorrect' / 'gateWrong'. kind: olayın türü
 * (land için desteğin türü: 'ground' | 'car' | 'bus' | 'ramp').
 */
export function hapticStyleFor(type, kind) {
    switch (type) {
        case 'coin':
            return 'light';
        case 'jump':
            return 'light';
        case 'land':
            // Yalnızca araç çatısına iniş (zemine iniş çok sık, titreşmez).
            return kind === 'car' || kind === 'bus' ? 'medium' : null;
        case 'stumble':
            return 'warning';
        case 'crash':
            return 'heavy';
        case 'power':
            return 'medium';
        case 'shieldBreak':
            return 'medium';
        case 'gateCorrect':
            return 'success';
        case 'gateWrong':
            return 'error';
        default:
            return null;
    }
}

/**
 * emit(style) çağıran kapı: jetonları seyreltir. now(): ms (test için
 * enjekte edilebilir). Dönen fonksiyon olayı gönderdiyse stili, yoksa null döner.
 */
export function createHaptics(emit, { now = () => Date.now(), coinMinMs = HAPTIC_COIN_MIN_MS } = {}) {
    let lastCoin = -Infinity;
    return function haptic(type, kind) {
        const style = hapticStyleFor(type, kind);
        if (!style) return null;
        if (type === 'coin') {
            const t = now();
            if (t - lastCoin < coinMinMs) return null;
            lastCoin = t;
        }
        try {
            emit(style);
        } catch (err) {
            console.error('[runner] onHaptic hatası', err);
        }
        return style;
    };
}
