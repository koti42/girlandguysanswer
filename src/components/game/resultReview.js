/*
 * Şüpheli oyun işareti: sunucu oyunu otomatik kontrolde işaretlediyse
 * (`flagged: true` ya da dolu bir `review` alanı) true. Alanlar yoksa / false
 * ise (eski sunucu yanıtları) false. `review` metin ya da nesne olabilir;
 * yalnızca bayrak olarak okunur.
 */
export const isUnderReview = (result) => {
    if (!result || typeof result !== 'object') return false;
    if (result.flagged === true) return true;
    const r = result.review;
    if (r === true) return true;
    if (typeof r === 'string') return r.trim() !== '' && r !== 'none' && r !== 'cleared';
    if (r && typeof r === 'object') return r.status !== 'cleared' && r.status !== 'none';
    return false;
};
