/**
 * Tablo seçim durumu - saf fonksiyonlar. DataTable bunları kullanır;
 * ayrı dosyada olması test edilebilsin diye.
 */
export const emptySelection = () => new Set();

export function toggleOne(selection, id) {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
}

/** Sayfadaki tüm satırlar seçiliyse hepsini kaldırır, değilse hepsini ekler. */
export function togglePage(selection, pageIds) {
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selection.has(id));
    const next = new Set(selection);
    if (allSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    return next;
}

export function pageState(selection, pageIds) {
    if (!pageIds.length) return 'none';
    const count = pageIds.filter((id) => selection.has(id)).length;
    if (count === 0) return 'none';
    if (count === pageIds.length) return 'all';
    return 'some';
}

/** Sayfa değişince artık listede olmayan seçimler düşsün mü? Hayır - toplu
 * işlem için sayfalar arası seçim korunur; bu yardımcı yalnızca temizler. */
export function pruneMissing(selection, knownIds) {
    const known = new Set(knownIds);
    return new Set([...selection].filter((id) => known.has(id)));
}
