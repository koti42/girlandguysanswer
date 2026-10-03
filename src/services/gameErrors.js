/*
 * Oyun API hata yardımcıları (durum kodu, `data` gövdesi, kullanıcı metni).
 *
 * Bilerek bağımlılıksız: sohbet penceresi gibi her sayfada yüklenen yerler
 * (Mesaj Bileti kontrolü) bu yardımcıları gameApi'yi ya da mağaza tasarım
 * kayıt defterini paketine çekmeden kullanabilsin. gameApi.js bunları aynen
 * yeniden dışa aktarır; mevcut içe aktarmalar değişmez.
 */

export const gameErrorStatus = (err) => err?.response?.status ?? null;

export const gameErrorData = (err) => err?.response?.data?.data ?? null;

export function gameErrorMessage(err, fallback = 'Bir şeyler ters gitti. Lütfen tekrar dene.') {
    const status = gameErrorStatus(err);
    const serverMsg = err?.response?.data?.message;
    if (serverMsg && typeof serverMsg === 'string') return serverMsg;
    const firstValidation = err?.response?.data?.errors
        ? Object.values(err.response.data.errors).flat()[0]
        : null;
    if (firstValidation) return firstValidation;
    if (!err?.response) return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.';
    if (status === 401) return 'Oynamak için giriş yapmalısın.';
    if (status === 404) return 'Aradığın içerik bulunamadı.';
    if (status === 429) return 'Çok hızlı gidiyorsun, birkaç saniye bekleyip tekrar dene.';
    if (status >= 500) return 'Sunucuda bir sorun oluştu. Birazdan tekrar dene.';
    return fallback;
}
