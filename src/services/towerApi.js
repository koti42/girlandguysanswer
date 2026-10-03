import api from './api';

/*
 * Herkesler Yükseliyor (3D kule) istemcisi.
 *
 * Sözleşme: girlsandguys-api-v10/docs/GAME_API.md ("Herkesler Yükseliyor").
 * gameApi.js ile aynı zarf: her fonksiyon `{ success, message, data }`
 * içindeki `data`'yı döndürür, hata olduğu gibi fırlatılır (durum kodu ve
 * metin için gameApi'nin `gameErrorStatus` / `gameErrorMessage`'ı).
 *
 * Koşu açan / değiştiren her çağrı taze bir Idempotency-Key alır: api.js
 * aynı gövdeye 15 sn boyunca aynı anahtarı veriyor, sunucudaki ara katman da
 * hata yanıtlarını (5xx, 429) anahtarla saklıyor. Yeniden deneme eski
 * hatanın tekrarını almasın. Uçların kendisi sunucuda zaten idempotent.
 *
 * İstek başına zaman aşımı: mobilde ağ geçişinde askıda kalan bağlantı
 * "doğrulanıyor" ekranını kilitlemesin. Zaman aşımında `response` olmadığı
 * için yeniden deneme akışı değişmeden çalışır.
 */

const unwrap = (res) => res?.data?.data ?? {};

export const freshKey = () => ({
    headers: {
        'Idempotency-Key': window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `tower_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    },
});

const cfg = (ms) => ({ ...freshKey(), timeout: ms });
const path = (runId, tail) => `/game/tower/${encodeURIComponent(runId)}/${tail}`;

export const towerApi = {
    overview: () => api.get('/game/tower/overview', { timeout: 15000 }).then(unwrap),
    start: () => api.post('/game/tower/start', {}, cfg(15000)).then(unwrap),
    // Şık kilitlenir; yanıt doğru şıkkı içerir. Aynı soruya aynı şık -> aynı yanıt.
    answer: (runId, { q, choice }) => api.post(path(runId, 'answer'), { q, choice }, cfg(8000)).then(unwrap),
    // Bitişte sunucu kuleyi baştan oynatıyor (replay): süre diğerlerinden uzun.
    finish: (runId, { end_tick, inputs, client_score }) =>
        api
            .post(
                path(runId, 'finish'),
                Number.isFinite(client_score) ? { end_tick, inputs, client_score } : { end_tick, inputs },
                cfg(20000)
            )
            .then(unwrap),
    abandon: (runId) => api.post(path(runId, 'abandon'), {}, cfg(10000)).then(unwrap),
    leaderboard: ({ period = 'weekly', gender = 'all', limit = 10 } = {}) =>
        api.get('/game/tower/leaderboard', { params: { period, gender, limit }, timeout: 15000 }).then(unwrap),
};

export default towerApi;
