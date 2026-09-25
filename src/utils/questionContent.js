import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

/**
 * Soru/cevap/yorum metinleriyle ilgili saf yardımcılar.
 *
 * SingleQuestionView'in tepesinden çıkarıldı: yorum ağacı ayrı modüle
 * taşınınca ikisi de aynı fonksiyonlara ihtiyaç duydu, kopyalamak yerine
 * ortak yere alındı. Hiçbiri React'e veya bileşen state'ine bağlı değil.
 */

export const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/gi;

/** Metindeki YouTube bağlantılarını tekilleştirerek çıkarır. */
export const getYoutubeVideoLinks = (content) => {
    if (!content || typeof content !== 'string') return [];
    const seen = new Set();
    const result = [];
    let m;
    // Kalıp global olduğu için her çağrıda yeni örnek: paylaşılan regex'in
    // lastIndex'i çağrılar arasında taşınıp eşleşme atlamasın.
    const re = new RegExp(YOUTUBE_URL_REGEX.source, 'gi');
    while ((m = re.exec(content)) !== null) {
        const videoId = m[1];
        const raw = m[0];
        const fullUrl = raw.startsWith('http') ? raw : `https://${raw}`;
        const isMusic = /music\.youtube\.com/i.test(raw);
        if (!seen.has(videoId)) {
            seen.add(videoId);
            result.push({ url: fullUrl, videoId, isMusic });
        }
    }
    return result;
};

/** "3 saat önce" biçiminde göreli tarih; hatalı girdide çökmez. */
export const formatDate = (dateString) => {
    if (!dateString) return 'Az önce';
    try {
        return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch {
        return 'Bilinmiyor';
    }
};
