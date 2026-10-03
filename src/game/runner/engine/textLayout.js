/*
 * Kapı panellerindeki şık metni için satır kaydırma ve sığdırma
 * (saf mantık; ölçüm fonksiyonu dışarıdan verilir, testte sahte ölçüm).
 *
 * Metin sunucudan gelir ve yalnızca canvas fillText ile çizilir (HTML yok).
 * Kontrol karakterleri ve fazla boşluk temizlenir; aşırı uzun metin
 * en küçük puntoda da sığmazsa son satır "…" ile kesilir.
 */

const MAX_INPUT_CHARS = 400;
// Kontrol, sıfır genişlikli ve yön işaretleri, satır/paragraf ayırıcıları, BOM.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

export function normalizeText(text) {
    // Kontrol karakterlerini (satır sonu, tab, sıfır genişlikli vb.) boşluğa çevir.
    const cleaned = String(text ?? '').slice(0, MAX_INPUT_CHARS).replace(CONTROL_RE, ' ');
    return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Kelime sınırlarından satırlara böler. Tek başına satıra sığmayan kelime
 * karakter karakter bölünür. measure(str) -> piksel genişlik.
 */
export function wrapText(text, maxWidth, measure) {
    const words = normalizeText(text).split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate) <= maxWidth) {
            line = candidate;
            continue;
        }
        if (line) lines.push(line);
        if (measure(word) <= maxWidth) {
            line = word;
            continue;
        }
        // Kelime tek başına bile sığmıyor: harf harf parçala.
        let part = '';
        for (const ch of Array.from(word)) {
            if (part && measure(part + ch) > maxWidth) {
                lines.push(part);
                part = ch;
            } else {
                part += ch;
            }
        }
        line = part;
    }
    if (line) lines.push(line);
    return lines;
}

/** Satırı genişliğe sığacak şekilde kısaltıp "…" ekler. */
export function ellipsize(line, maxWidth, measure) {
    if (measure(line) <= maxWidth) return line;
    const chars = Array.from(line);
    while (chars.length > 0 && measure(chars.join('') + '…') > maxWidth) chars.pop();
    return chars.join('').trimEnd() + '…';
}

/**
 * En büyük puntodan başlayıp metin maxLines satıra (ve verilirse maxHeight
 * yüksekliğine; satır yüksekliği size * lineHeight) sığana kadar küçültür.
 * Bir punto ancak hiçbir kelime harf harf bölünmüyorsa kabul edilir:
 * "Süleymani / ye" yerine önce küçültmeyi dener. Harf bölme yalnızca
 * minSize yedek yolunda kalır.
 * measure(str, size) -> piksel genişlik. Dönen: { size, lines, truncated }.
 */
export function fitText(text, { maxWidth, maxLines, maxSize, minSize, step = 2, maxHeight = 0, lineHeight = 1.12, measure }) {
    const clean = normalizeText(text);
    if (!clean) return { size: maxSize, lines: [], truncated: false };
    const words = clean.split(' ');
    for (let size = maxSize; size >= minSize; size -= step) {
        const m = (s) => measure(s, size);
        if (!words.every((w) => m(w) <= maxWidth)) continue;
        const lines = wrapText(clean, maxWidth, m);
        if (lines.length > maxLines) continue;
        if (maxHeight && lines.length * size * lineHeight > maxHeight) continue;
        return { size, lines, truncated: false };
    }
    const size = minSize;
    const m = (s) => measure(s, size);
    const lines = wrapText(clean, maxWidth, m).slice(0, maxLines);
    // Kesilen kısmı belli etmek için son satırın sonuna üç nokta.
    lines[lines.length - 1] = ellipsize(`${lines[lines.length - 1]}…`, maxWidth, m);
    return { size, lines, truncated: true };
}
