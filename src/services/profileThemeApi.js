import api from './api';

/*
 * Profil Teması (Ada Profili) istemcisi — yalnızca web profilinde görünen,
 * jetonla alınan tema. Sözleşme: girlsandguys-api-v10 `/api/game/themes/*`.
 *
 * gameApi.js ile aynı zarf: her fonksiyon `{ success, message, data }`
 * içindeki `data`'yı döndürür; hata olduğu gibi fırlatılır (durum kodu,
 * metin ve `data.reason` için gameErrors.js yardımcıları).
 *
 * Satın alma / aç-kapa / ücretsiz etkinleştirme her çağrıda taze
 * Idempotency-Key alır: api.js aynı gövdeye 15 sn boyunca aynı anahtarı
 * veriyor; art arda iki "uzat" (aynı gövde, bilerek iki ayrı işlem) ikinci
 * isteğin eski yanıtın tekrarını almasına yol açardı. Çift dokunmayı arayüz
 * kilitler.
 */

const unwrap = (res) => res?.data?.data ?? {};

export const freshKey = () => ({
    headers: {
        'Idempotency-Key': window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `theme_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    },
});

const cfg = (ms) => ({ ...freshKey(), timeout: ms });
const path = (key, tail) => `/game/themes/${encodeURIComponent(key)}/${tail}`;

export const profileThemeApi = {
    /** `{ themes: [{ key, name, price, days, owned, active, enabled, expires_at, unlimited, source, can_free }], wallet }` */
    overview: () => api.get('/game/themes/overview', { timeout: 15000 }).then(unwrap),
    /** `{ theme, wallet }` — bakiye yetmezse 422 `reason: 'insufficient'`, süresizse `reason: 'unlimited'`. */
    buy: (key = 'ada') => api.post(path(key, 'buy'), {}, cfg(15000)).then(unwrap),
    /** `{ theme }` — sahip değilse 422. */
    toggle: (key = 'ada', enabled) => api.put(path(key, 'toggle'), { enabled: !!enabled }, cfg(15000)).then(unwrap),
    /** Yalnız yönetici: ücretsiz ve süresiz etkinleştirir. `{ theme, wallet? }` */
    activate: (key = 'ada') => api.post(path(key, 'activate'), {}, cfg(15000)).then(unwrap),
};

export default profileThemeApi;
