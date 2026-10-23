import api from './api';
import avatarApi from './avatarApi';
import shopApi from './shopApi';

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

/*
 * Koşu uçlarına istek başına zaman aşımı. api.js'de genel bir sınır yok
 * (yüklemeler etkilenmesin diye): mobilde Wi-Fi -> hücresel geçişinde askıda
 * kalan bağlantı "Koşun doğrulanıyor" ekranını sonsuza kadar kilitlemesin.
 * Zaman aşımı hatasında `response` olmadığından yeniden deneme / "Tekrar
 * dene" akışı (isRetryable, classifyFinishError) değişmeden çalışır.
 */
const runnerCfg = (ms) => ({ ...freshKey(), timeout: ms });

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

    /*
     * Herkesler Koşuyor (3D bilgi koşusu).
     *
     * Kapı / bitiş / terk çağrıları da her denemede taze anahtar alıyor:
     * sunucudaki Idempotency ara katmanı hata yanıtlarını (5xx, 429) da
     * anahtarla birlikte saklıyor; api.js ise aynı gövdeye 15 sn boyunca aynı
     * anahtarı veriyor. Yeniden deneme eski hatanın tekrarını almasın diye.
     * Uçların kendisi sunucuda zaten idempotent (aynı kapı -> aynı sonuç,
     * bitmiş koşuya ikinci finish -> kayıtlı sonuç).
     */
    runnerOverview: () => api.get('/game/runner/overview', { timeout: 15000 }).then(unwrap),
    startRunner: () => api.post('/game/runner/start', {}, runnerCfg(15000)).then(unwrap),
    runnerGate: (runId, { gate, lane }) =>
        api.post(`/game/runner/${encodeURIComponent(runId)}/gate`, { gate, lane }, runnerCfg(8000)).then(unwrap),
    // Bitişte sunucu koşuyu baştan oynatıyor (replay): süre diğerlerinden uzun.
    finishRunner: (runId, { end_tick, inputs, client_score }) =>
        api
            .post(
                `/game/runner/${encodeURIComponent(runId)}/finish`,
                Number.isFinite(client_score) ? { end_tick, inputs, client_score } : { end_tick, inputs },
                runnerCfg(20000)
            )
            .then(unwrap),
    abandonRunner: (runId) => api.post(`/game/runner/${encodeURIComponent(runId)}/abandon`, {}, runnerCfg(10000)).then(unwrap),
    runnerLeaderboard: ({ period = 'weekly', gender = 'all', limit = 10 } = {}) =>
        api.get('/game/runner/leaderboard', { params: { period, gender, limit }, timeout: 15000 }).then(unwrap),

    /*
     * Karakter, mağaza ve Mesaj Bileti: asıl uygulama avatarApi.js / shopApi.js'te
     * (tek kaynak; zaman aşımı ve Idempotency-Key kuralları orada). Burada
     * sözleşmedeki adlarla yalnızca yönlendirilir, kopya kod yok. Kule için
     * towerApi.js ayrı kalır.
     */
    getAvatar: (...a) => avatarApi.get(...a),
    saveAvatar: (...a) => avatarApi.save(...a),
    buyAvatarItem: (...a) => avatarApi.buy(...a),
    getShop: (...a) => shopApi.get(...a),
    buyShopItem: (...a) => shopApi.buy(...a),
    equipCosmetics: (...a) => shopApi.equip(...a),
    getKesifLoadout: (...a) => shopApi.kesifLoadout(...a),
    getWalletTransactions: (...a) => shopApi.transactions(...a),
    checkMessageTicket: (...a) => shopApi.checkMessageTicket(...a),
    sendTicketMessage: (...a) => shopApi.sendTicketMessage(...a),
};

export { gameErrorStatus, gameErrorData, gameErrorMessage } from './gameErrors';

export default gameApi;
