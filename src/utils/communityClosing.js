/**
 * Yazılı odanın sahibi "Açık bırak" deyip ayrıldığında sunucu `closes_at`
 * gönderir. Kartta "N sa içinde kapanır" göstermek için kalan saat.
 * Süre geçmişse ya da tarih yoksa/bozuksa null (rozet gizlenir); en az 1.
 */
export const hoursUntilClose = (closesAt, now = Date.now()) => {
    if (!closesAt) return null;
    const closesAtMs = new Date(closesAt).getTime();
    if (Number.isNaN(closesAtMs)) return null;
    const diff = closesAtMs - now;
    if (diff <= 0) return null;
    return Math.max(1, Math.ceil(diff / 3_600_000));
};
