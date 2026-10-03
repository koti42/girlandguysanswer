import api from './api';

/*
 * Oyun karakteri, cüzdan ve karakter mağazası istemcisi.
 *
 * Sözleşme: girlsandguys-api-v10/docs/GAME_API.md ("Oyun Karakteri, cüzdan ve
 * mağaza"). gameApi.js ile aynı zarf: her fonksiyon `{ success, message, data }`
 * içindeki `data`'yı döndürür, hata olduğu gibi fırlatılır (durum kodu ve
 * metin için gameApi'nin `gameErrorStatus` / `gameErrorMessage`'ı; kilitli
 * öğe hatasında `gameErrorData(err).item`).
 *
 * Kaydet / satın al her çağrıda taze bir Idempotency-Key alır: api.js aynı
 * gövdeye 15 sn boyunca aynı anahtarı veriyor; "kaydet -> geri al -> yine
 * kaydet" ya da hatadan sonra yeniden deneme eski yanıtın tekrarını almasın.
 * Satın alma sunucuda zaten tek seferlik (ikinci istek 409).
 *
 * İstek başına zaman aşımı: mobil ağda askıda kalan bağlantı editörü
 * "Kaydediliyor" durumunda kilitlemesin.
 */

const unwrap = (res) => res?.data?.data ?? {};

export const freshKey = () => ({
    headers: {
        'Idempotency-Key': window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `avatar_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    },
});

const cfg = (ms) => ({ ...freshKey(), timeout: ms });

export const avatarApi = {
    /** `{ avatar, is_default, wallet, items, player: { level } }` */
    get: () => api.get('/game/avatar', { timeout: 15000 }).then(unwrap),
    /** `{ avatar }` (sunucunun kaydettiği kanonik yapılandırma) */
    save: (avatar) => api.put('/game/avatar', { avatar }, cfg(15000)).then(unwrap),
    /** `{ wallet, owned_keys }` */
    buy: (item) => api.post('/game/avatar/buy', { item }, cfg(15000)).then(unwrap),
};

export default avatarApi;
