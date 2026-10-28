import api from './api';

/*
 * PROTOCOL: ZERO istemcisi. Sözleşme: girlsandguys-api-v10/docs/GAME_API.md ("PROTOCOL: ZERO").
 * Uçlar giriş istemez; api.js oturum varsa Bearer ekler ve kayıt üyeye bağlanır.
 * Her fonksiyon standart zarfın `data`'sını döndürür; hata olduğu gibi fırlatılır
 * (metin için services/gameErrors.gameErrorMessage).
 */

const unwrap = (res) => res?.data?.data ?? {};

const freshKey = () => ({
    headers: {
        'Idempotency-Key': window.crypto?.randomUUID ? window.crypto.randomUUID() : `pz_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    },
});

export const protocolZeroApi = {
    overview: (difficulty) =>
        api.get('/game/protocol-zero/overview', { params: difficulty ? { difficulty } : {}, timeout: 15000 }).then(unwrap),
    leaderboard: ({ difficulty, period = 'all', limit = 10 } = {}) =>
        api
            .get('/game/protocol-zero/leaderboard', { params: { ...(difficulty ? { difficulty } : {}), period, limit }, timeout: 15000 })
            .then(unwrap),
    submitScore: (body) => api.post('/game/protocol-zero/scores', body, { ...freshKey(), timeout: 20000 }).then(unwrap),
};

export default protocolZeroApi;
