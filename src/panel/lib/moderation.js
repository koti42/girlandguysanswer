/**
 * Moderasyon sözlüğü: işlem adları, renkler, süre ön ayarları, durumlar.
 * Backend'in ModerationAction.action ve içerik türleriyle birebir.
 */

export const CONTENT_TYPES = ['question', 'answer', 'comment', 'opinion', 'story'];

export const CONTENT_LABELS = {
    question: 'Soru',
    answer: 'Cevap',
    comment: 'Yorum',
    opinion: 'Görüş',
    story: 'Hikâye',
    user: 'Kullanıcı',
    message: 'Mesaj',
    other: 'Diğer',
};

export const ACTION_LABELS = {
    ban: 'Ban',
    unban: 'Ban kaldırıldı',
    freeze: 'Dondurma',
    unfreeze: 'Dondurma kaldırıldı',
    warn: 'Uyarı',
    note: 'Not',
    hide: 'Gizleme',
    unhide: 'Görünür yapıldı',
    remove: 'Kaldırma',
    restore: 'Geri getirildi',
    auto_hide: 'Otomatik gizleme',
    complaint_accepted: 'Şikâyet kabul',
    complaint_rejected: 'Şikâyet ret',
    role_change: 'Rol değişikliği',
    feature_tag: 'Fenomen etiketi',
    verify: 'Doğrulandı',
    unverify: 'Doğrulama kaldırıldı',
    revoke_tokens: 'Oturumlar kapatıldı',
    delete: 'Hesap silindi',
    restore_user: 'Hesap geri getirildi',
    user_update: 'Kullanıcı düzenlendi',
    setting_change: 'Ayar değişti',
    catalog_create: 'Katalog eklendi',
    catalog_update: 'Katalog düzenlendi',
    catalog_delete: 'Katalog silindi',
    broadcast: 'Duyuru gönderildi',
    community_close: 'Oda kapatıldı',
    community_reopen: 'Oda açıldı',
    community_delete: 'Oda silindi',
    export: 'Dışa aktarma',
    cache_clear: 'Önbellek temizlendi',
    job_retry: 'İş tekrarlandı',
    job_forget: 'İş silindi',
    // Oyun Merkezi (soru / kategori / ikilem) ve Jeton Mağazası
    game_question_create: 'Oyun sorusu eklendi',
    game_question_update: 'Oyun sorusu düzenlendi',
    game_question_deactivate: 'Oyun sorusu pasifleştirildi',
    game_category_update: 'Oyun kategorisi düzenlendi',
    game_dilemma_create: 'İkilem eklendi',
    game_dilemma_update: 'İkilem düzenlendi',
    game_dilemma_deactivate: 'İkilem pasifleştirildi',
    game_dilemma_delete: 'İkilem silindi',
    game_shop_item_create: 'Mağaza ürünü eklendi',
    game_shop_item_update: 'Mağaza ürünü düzenlendi',
    game_wallet_grant: 'Jeton verildi',
    game_wallet_deduct: 'Jeton kesildi',
};

/** Renk sınıfı: ceza kırmızı, geri alma yeşil, bilgi mavi, nötr gri. */
export function actionTone(action) {
    if (['ban', 'remove', 'delete', 'auto_hide', 'community_delete'].includes(action)) return 'danger';
    if (['freeze', 'hide', 'warn', 'complaint_accepted', 'community_close', 'revoke_tokens', 'game_wallet_deduct'].includes(action)) return 'warning';
    if (['unban', 'unfreeze', 'unhide', 'restore', 'restore_user', 'verify', 'community_reopen', 'complaint_rejected'].includes(action)) return 'success';
    if (['note', 'export'].includes(action)) return 'neutral';
    return 'info';
}

export function actionLabel(action) {
    return ACTION_LABELS[action] || action;
}

export const DURATION_PRESETS = [
    { label: '1 saat', minutes: 60 },
    { label: '6 saat', minutes: 360 },
    { label: '1 gün', minutes: 1440 },
    { label: '3 gün', minutes: 4320 },
    { label: '1 hafta', minutes: 10080 },
    { label: '1 ay', minutes: 43200 },
    { label: 'Süresiz', minutes: null },
];

export const REASON_PRESETS = [
    'Spam / reklam',
    'Hakaret veya taciz',
    'Nefret söylemi',
    'Cinsel içerik',
    'Kişisel bilgi paylaşımı',
    'Yanıltıcı bilgi',
    'Konu dışı',
    'Çoklu hesap',
];

export const USER_STATUS = {
    active: { label: 'Aktif', tone: 'success' },
    banned: { label: 'Banlı', tone: 'danger' },
    frozen: { label: 'Dondurulmuş', tone: 'warning' },
    deleting: { label: 'Silinecek', tone: 'neutral' },
};

export function userStatusOf(user) {
    if (!user) return 'active';
    if (user.status) return user.status;
    const future = (until) => !until || new Date(until).getTime() > Date.now();
    if (user.banned_at && future(user.banned_until)) return 'banned';
    if (user.frozen_at && future(user.frozen_until)) return 'frozen';
    if (user.deletion_scheduled_at) return 'deleting';
    return 'active';
}

export const COMPLAINT_STATUS = {
    pending: { label: 'Bekliyor', tone: 'warning' },
    accepted: { label: 'Kabul', tone: 'success' },
    rejected: { label: 'Ret', tone: 'neutral' },
};

export const RISK_TONE = { low: 'success', medium: 'warning', high: 'danger' };

/** Şikâyet yaşına göre aciliyet: 24s+ kırmızı, 6s+ sarı. */
export function urgencyOf(ageHours, reportCount = 1) {
    if (reportCount >= 5 || ageHours >= 24) return 'danger';
    if (reportCount >= 3 || ageHours >= 6) return 'warning';
    return 'neutral';
}

/** Kısayol: içerik türünden ön yüz yoluna. Slug yoksa id ile. */
export function publicPathFor(type, item) {
    if (!item) return null;
    const key = item.slug || item.id;
    switch (type) {
        case 'question': return `/question/${key}`;
        case 'opinion': return `/opinion/${key}`;
        case 'story': return `/story/${key}`;
        case 'answer': return item.question_id ? `/question/${item.question_id}#answer-${item.id}` : null;
        case 'user': return item.username ? `/profile/${item.username}` : null;
        default: return null;
    }
}
