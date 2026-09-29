import api from './api';

/*
 * Oyun Merkezi istemcisi.
 *
 * Sözleşme: girlsandguys-api-v10/docs/GAME_API.md. Her fonksiyon standart
 * zarfın (`{ success, message, data }`) içindeki `data`'yı döndürür; hata
 * durumunda axios hatası olduğu gibi fırlatılır (durum kodu için
 * `gameErrorStatus`, kullanıcıya gösterilecek metin için `gameErrorMessage`).
 */

const unwrap = (res) => res?.data?.data ?? {};

/*
 * api.js POST/PUT isteklerine gövdenin parmak izinden türetilmiş ve 15 sn
 * geçerli bir Idempotency-Key ekliyor. "Tekrar oyna" ya da art arda iki
 * rastgele düello gibi aynı gövdeli ama bilerek yeni olan istekler o pencerede
 * eski yanıtın tekrarını alabilirdi. Yeni oturum/düello açan uçlara her
 * çağrıda taze bir anahtar veriyoruz.
 */
const freshKey = () => ({
    headers: {
        'Idempotency-Key': window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `game_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    },
});

export const gameApi = {
    // Genel
    overview: () => api.get('/game/overview').then(unwrap),
    categories: () => api.get('/game/categories').then(unwrap),

    // Oturum başlatma
    startArena: (category) =>
        api.post('/game/arena/start', category ? { category } : {}, freshKey()).then(unwrap),
    startDaily: () => api.post('/game/daily/start', {}, freshKey()).then(unwrap),

    // Oturum akışı
    getSession: (id) => api.get(`/game/sessions/${id}`).then(unwrap),
    getQuestion: (id) => api.get(`/game/sessions/${id}/question`).then(unwrap),
    answer: (id, { index, choice }) =>
        api.post(`/game/sessions/${id}/answer`, { index, choice: choice ?? null }).then(unwrap),
    getResult: (id) => api.get(`/game/sessions/${id}/result`).then(unwrap),
    abandon: (id) => api.post(`/game/sessions/${id}/abandon`).then(unwrap),
    history: (page = 1) => api.get('/game/history', { params: { page } }).then(unwrap),

    // Düello
    createDuel: (opponentUsername) =>
        api
            .post(
                '/game/duels',
                opponentUsername ? { opponent_username: opponentUsername } : {},
                freshKey()
            )
            .then(unwrap),
    listDuels: () => api.get('/game/duels').then(unwrap),
    getDuel: (id) => api.get(`/game/duels/${id}`).then(unwrap),
    acceptDuel: (id) => api.post(`/game/duels/${id}/accept`).then(unwrap),
    declineDuel: (id) => api.post(`/game/duels/${id}/decline`).then(unwrap),

    // İkilem
    dilemmaToday: () => api.get('/game/dilemmas/today').then(unwrap),
    dilemmaNext: () => api.get('/game/dilemmas/next').then(unwrap),
    dilemmaHistory: (page = 1) => api.get('/game/dilemmas', { params: { page } }).then(unwrap),
    voteDilemma: (id, choice) => api.post(`/game/dilemmas/${id}/vote`, { choice }).then(unwrap),

    // Sıralama ve profil
    leaderboard: ({ period = 'weekly', gender = 'all', limit = 50 } = {}) =>
        api.get('/game/leaderboard', { params: { period, gender, limit } }).then(unwrap),
    profile: (username) => api.get(`/game/profile/${encodeURIComponent(username)}`).then(unwrap),
};

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

export default gameApi;
