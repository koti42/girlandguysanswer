import client from '../panel/api/client';

/**
 * Oyun Merkezi yönetim uçları: /api/admin/game (role:admin,super_admin).
 * Sözleşme: backend docs/GAME_API.md › "Yönetim uçları".
 *
 * Panelin ortak istemcisini (token, 401 yönlendirmesi) kullanır; ayrı
 * dosyada durur çünkü panel/api/endpoints.js iki panelin ortak dosyası.
 */

/** Boş/undefined parametreleri at: URL'de `?search=&category=` görünmesin. */
const clean = (params = {}) => Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
);

export const gameAdminApi = {
    stats: () => client.get('/admin/game/stats'),

    questions: (params) => client.get('/admin/game/questions', { params: clean(params) }),
    createQuestion: (body) => client.post('/admin/game/questions', body),
    updateQuestion: (id, body) => client.put(`/admin/game/questions/${id}`, body),
    /** Soruyu pasife alır; oynanmış soru silinmez. */
    deactivateQuestion: (id) => client.delete(`/admin/game/questions/${id}`),

    categories: () => client.get('/admin/game/categories'),
    updateCategory: (id, body) => client.put(`/admin/game/categories/${id}`, body),

    dilemmas: (params) => client.get('/admin/game/dilemmas', { params: clean(params) }),
    createDilemma: (body) => client.post('/admin/game/dilemmas', body),
    updateDilemma: (id, body) => client.put(`/admin/game/dilemmas/${id}`, body),
    deleteDilemma: (id) => client.delete(`/admin/game/dilemmas/${id}`),

    /* Jeton Mağazası (SPEC_V2 §F.7): /api/admin/game/shop/* */

    /** ?category&rarity&active&search&page&per_page → { items: [...+sold_count], pagination } */
    shopItems: (params) => client.get('/admin/game/shop/items', { params: clean(params) }),
    /** Yalnızca koddaki tasarım anahtarlarından (backend izinli listeyi ayrıca denetler). */
    createShopItem: (body) => client.post('/admin/game/shop/items', body),
    updateShopItem: (key, body) => client.put(`/admin/game/shop/items/${encodeURIComponent(key)}`, body),
    /** → { circulation, earned_today, spent_today, earned_7d, spent_7d, top_items, ticket_log } */
    shopSummary: () => client.get('/admin/game/shop/summary'),

    /** ?q=username → [{ user, wallet }] */
    searchWallets: (q) => client.get('/admin/game/shop/wallets/search', { params: clean({ q }) }),
    /** ?page → { user, wallet, transactions (sayfalı) } */
    wallet: (userId, params) => client.get(`/admin/game/shop/wallets/${encodeURIComponent(userId)}`, { params: clean(params) }),
    /** { amount: ±n (≠0, |n| ≤ 50.000.000), reason } — bakiye negatife düşmez; yönetici kendine de verebilir. */
    adjustWallet: (userId, body) => client.post(`/admin/game/shop/wallets/${encodeURIComponent(userId)}/adjust`, body),

    /* Profil Teması (Ada Profili): /api/admin/game/themes */

    /** ?user_id&page&per_page → { items: [{ user, user_id, theme, source, enabled, active, expires_at, unlimited, price_paid, purchases, granted_by }], pagination } (yalnız etkin haklar) */
    themes: (params) => client.get('/admin/game/themes', { params: clean(params) }),
    /** { user_id | username, days: tam sayı | null (null = süresiz), reason } */
    grantTheme: (body) => client.post('/admin/game/themes/grant', body),
    /** Hakkı kaldırır (kullanıcı kimliği + tema anahtarı). */
    revokeTheme: (userId, key = 'ada') => client.delete(`/admin/game/themes/${encodeURIComponent(userId)}/${encodeURIComponent(key)}`),
};

export default gameAdminApi;
