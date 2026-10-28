/*
 * Sonuç paylaşımı: metin üretimi + Web Share API / pano / WhatsApp / X bağlantıları.
 * Bağlantı her zaman sitenin lobi adresidir (organik trafik döngüsü).
 */
import { DIFFICULTIES, LOBBY_PATH } from './constants';
import { ARCHETYPES } from './archetypes';

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

export function buildShareUrl(origin = 'https://herkeslersoruyor.com.tr') {
    return `${String(origin).replace(/\/$/, '')}${LOBBY_PATH}`;
}

/**
 * @param {object} r { outcome, days, score, difficulty, decrypt, nodesSaved }
 */
export function buildShareText(r, url = buildShareUrl()) {
    const diff = DIFFICULTIES[r.difficulty]?.name || 'Normal';
    const arch = ARCHETYPES[r.archetype]?.name;
    const what = arch ? `"${arch}" türü yapay zekâyı` : 'kontrolden çıkan yapay zekâyı';
    if (r.outcome === 'victory') {
        return `🔥 PROTOCOL: ZERO'da ${what} ${fmt(r.days)} günde durdurdum! Skor: ${fmt(r.score)} (${diff}). Sen dünyayı kurtarabilir misin? ${url}`;
    }
    return `🚨 PROTOCOL: ZERO'da ${arch ? `"${arch}" türü ` : ''}yapay zekâ ${fmt(r.days)}. günde dünyayı ele geçirdi… Skor: ${fmt(r.score)} (${diff}). Sen daha uzun dayanabilir misin? ${url}`;
}

export const whatsappLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const xLink = (text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;

/**
 * Web Share varsa onu, yoksa panoyu kullanır. Dönüş: 'shared' | 'copied' | 'failed'.
 */
export async function shareResult(text, { nav = typeof navigator !== 'undefined' ? navigator : null, title = 'PROTOCOL: ZERO' } = {}) {
    if (nav && typeof nav.share === 'function') {
        try {
            await nav.share({ title, text });
            return 'shared';
        } catch (err) {
            if (err && err.name === 'AbortError') return 'failed';
            // paylaşım menüsü yoksa panoya düş
        }
    }
    return (await copyText(text, nav)) ? 'copied' : 'failed';
}

export async function copyText(text, nav = typeof navigator !== 'undefined' ? navigator : null) {
    try {
        if (nav?.clipboard?.writeText) {
            await nav.clipboard.writeText(text);
            return true;
        }
    } catch {
        // eski tarayıcı / izin yok → aşağıdaki yedek
    }
    try {
        if (typeof document === 'undefined') return false;
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        return Boolean(ok);
    } catch {
        return false;
    }
}
