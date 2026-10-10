import client from './client';

/** Boş/undefined parametreleri at: URL'de `?search=&role=` görünmesin. */
const clean = (params = {}) => Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
);

export const authApi = {
    login: (email, password) => client.post('/auth/login', { email, password }),
    logout: () => client.post('/auth/logout'),
    me: () => client.get('/user/me'),
    /** Verilen token ile /user/me - oturum devralma ve Google dönüşü için. */
    meWith: (token) => client.get('/user/me', { headers: { Authorization: `Bearer ${token}` } }),
    forgotPassword: (email) => client.post('/auth/password/forgot', { email }),
    /** Google giriş URL'si; sunucu redirect_uri'yi izinli kaynaklarla sınırlar. */
    googleUrl: (redirectUri) => client.get('/auth/google', { params: { redirect_uri: redirectUri } }),
};

export const passkeyApi = {
    authOptions: (body) => client.post('/auth/passkey/options', body),
    authenticate: (body) => client.post('/auth/passkey/login', body),
    list: () => client.get('/passkeys'),
    registrationOptions: () => client.post('/passkeys/options'),
    register: (body) => client.post('/passkeys', body),
    remove: (id) => client.delete(`/passkeys/${id}`),
};

export const publicApi = {
    settings: () => client.get('/settings/public'),
};

/* ------------------------------------------------------------------ */
/* Moderasyon paneli                                                   */
/* ------------------------------------------------------------------ */
export const modApi = {
    dashboard: () => client.get('/mod/dashboard'),

    complaints: (params) => client.get('/mod/complaints', { params: clean(params) }),
    complaint: (id) => client.get(`/mod/complaints/${id}`),
    resolveComplaint: (id, body) => client.post(`/mod/complaints/${id}/resolve`, body),
    bulkResolve: (body) => client.post('/mod/complaints/bulk-resolve', body),

    content: (type, params) => client.get(`/mod/content/${type}`, { params: clean(params) }),
    contentItem: (type, id) => client.get(`/mod/content/${type}/${id}`),
    hide: (type, id, body) => client.post(`/mod/content/${type}/${id}/hide`, body),
    unhide: (type, id, body) => client.post(`/mod/content/${type}/${id}/unhide`, body),
    remove: (type, id, body) => client.post(`/mod/content/${type}/${id}/remove`, body),
    restore: (type, id, body) => client.post(`/mod/content/${type}/${id}/restore`, body),
    bulkContent: (type, body) => client.post(`/mod/content/${type}/bulk`, body),

    users: (params) => client.get('/mod/users', { params: clean(params) }),
    user: (id) => client.get(`/mod/users/${id}`),
    userHistory: (id) => client.get(`/mod/users/${id}/history`),
    ban: (id, body) => client.post(`/mod/users/${id}/ban`, body),
    unban: (id, body) => client.post(`/mod/users/${id}/unban`, body),
    freeze: (id, body) => client.post(`/mod/users/${id}/freeze`, body),
    unfreeze: (id, body) => client.post(`/mod/users/${id}/unfreeze`, body),
    warn: (id, body) => client.post(`/mod/users/${id}/warn`, body),
    note: (id, body) => client.post(`/mod/users/${id}/notes`, body),

    actions: (params) => client.get('/mod/actions', { params: clean(params) }),
};

/* ------------------------------------------------------------------ */
/* Admin paneli                                                        */
/* ------------------------------------------------------------------ */
export const adminApi = {
    overview: () => client.get('/admin/stats/overview'),
    timeseries: (days = 30) => client.get('/admin/stats/timeseries', { params: { days } }),
    top: (limit = 10) => client.get('/admin/stats/top', { params: { limit } }),
    activity: (limit = 20) => client.get('/admin/stats/activity', { params: { limit } }),
    moderators: (days = 30) => client.get('/admin/stats/moderators', { params: { days } }),

    users: (params) => client.get('/admin/users', { params: clean(params) }),
    user: (id) => client.get(`/admin/users/${id}`),
    updateUser: (id, body) => client.put(`/admin/users/${id}`, body),
    updateRoles: (id, roleSlugs) => client.put(`/admin/users/${id}/roles`, { role_slugs: roleSlugs }),
    updateFeatureTag: (id, slug) => client.put(`/admin/users/${id}/feature-tag`, { feature_tag_slug: slug }),
    verify: (id) => client.post(`/admin/users/${id}/verify`),
    unverify: (id) => client.post(`/admin/users/${id}/unverify`),
    revokeTokens: (id, body) => client.post(`/admin/users/${id}/revoke-tokens`, body),
    deleteUser: (id, body) => client.delete(`/admin/users/${id}`, { data: body }),
    restoreUser: (id) => client.post(`/admin/users/${id}/restore`),
    bulkUsers: (body) => client.post('/admin/users/bulk', body),
    userConversations: (id, params) => client.get(`/admin/users/${id}/conversations`, { params: clean(params) }),
    conversationMessages: (id, params) => client.get(`/admin/conversations/${id}/messages`, { params: clean(params) }),

    /** Kademeli moderasyon: rapor, seviye atama, değerlendirme (admin). */
    moderatorReport: (params) => client.get('/admin/moderators', { params: clean(params) }),
    setModeratorLevel: (id, body) => client.put(`/admin/moderators/${id}/level`, body),
    reviewModerators: (body) => client.post('/admin/moderators/review', body),
    /** Yönetici hesabından kullanıcıya özel mesaj; kapalı kutu/engel sunucuda aşılır. */
    sendMessage: (body) => client.post('/messages/send', body),

    roles: () => client.get('/admin/roles'),
    createRole: (body) => client.post('/admin/roles', body),
    updateRole: (id, body) => client.put(`/admin/roles/${id}`, body),
    deleteRole: (id) => client.delete(`/admin/roles/${id}`),
    roleUsers: (id) => client.get(`/admin/roles/${id}/users`),

    settings: () => client.get('/admin/settings'),
    updateSettings: (settings) => client.put('/admin/settings', { settings }),

    catalog: (type) => client.get(`/admin/catalog/${type}`),
    createCatalog: (type, body) => client.post(`/admin/catalog/${type}`, body),
    updateCatalog: (type, id, body) => client.put(`/admin/catalog/${type}/${id}`, body),
    deleteCatalog: (type, id) => client.delete(`/admin/catalog/${type}/${id}`),
    reorderCatalog: (type, ids) => client.post(`/admin/catalog/${type}/reorder`, { ids }),

    broadcastPreview: (filters) => client.post('/admin/broadcast/preview', filters),
    broadcast: (body) => client.post('/admin/broadcast', body),

    communities: (params) => client.get('/admin/communities', { params: clean(params) }),
    closeCommunity: (uuid, body) => client.post(`/admin/communities/${uuid}/close`, body),
    reopenCommunity: (uuid) => client.post(`/admin/communities/${uuid}/reopen`),
    deleteCommunity: (uuid, body) => client.delete(`/admin/communities/${uuid}`, { data: body }),

    specialDays: () => client.get('/admin/special-days'),
    toggleSpecialDay: (id) => client.post(`/admin/special-days/${id}/toggle`),
    updateSpecialDay: (id, body) => client.put(`/admin/special-days/${id}`, body),
    syncSpecialDays: () => client.post('/admin/special-days/sync'),

    actions: (params) => client.get('/admin/actions', { params: clean(params) }),
    exportUrl: (type) => `${client.defaults.baseURL}/admin/export/${type}`,
    export: (type) => client.get(`/admin/export/${type}`, { responseType: 'blob' }),

    health: () => client.get('/admin/system/health'),
    failedJobs: () => client.get('/admin/system/failed-jobs'),
    retryJob: (uuid) => client.post(`/admin/system/failed-jobs/${uuid}/retry`),
    forgetJob: (uuid) => client.delete(`/admin/system/failed-jobs/${uuid}`),
    clearCache: () => client.post('/admin/system/cache-clear'),
};
