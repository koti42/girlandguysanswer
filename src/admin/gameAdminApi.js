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
};

export default gameAdminApi;
