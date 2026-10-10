/**
 * Kademeli moderasyon sözlüğü: backend config/moderation.php ile birebir.
 * Burada yalnızca düğme görünürlüğü ve süre ön ayarı için; asıl kapı
 * sunucuda (ModeratorLevelService). Değişiklikte iki tarafı birlikte güncelle.
 */

export const ADMIN_LEVEL = 99;
export const MAX_LEVEL = 5;

export const CAPABILITY_LABELS = {
    complaint: 'Şikâyet karara bağlama',
    warn: 'Uyarı',
    note: 'Moderatör notu',
    hide: 'İçerik gizleme',
    unhide: 'Gizlemeyi kaldırma',
    remove: 'İçerik kaldırma',
    restore: 'Kaldırılanı geri getirme',
    freeze: 'Hesap dondurma',
    unfreeze: 'Dondurmayı kaldırma',
    ban: 'Hesap banlama',
    unban: 'Banı kaldırma',
    bulk: 'Toplu işlem',
};

/** limits: dakika; anahtar yoksa süresiz dahil serbest. */
export const MOD_LEVELS = {
    1: { name: 'Gözlemci', description: 'Şikâyet karara bağlar, uyarır, not düşer; içeriği en fazla 24 saat gizler.', capabilities: ['complaint', 'warn', 'note', 'hide'], limits: { hide: 1440 } },
    2: { name: 'Moderatör', description: 'Süresiz gizleme, gizlemeyi kaldırma ve içerik kaldırma.', capabilities: ['complaint', 'warn', 'note', 'hide', 'unhide', 'remove'], limits: {} },
    3: { name: 'Kıdemli Moderatör', description: 'Kaldırılanı geri getirir; hesabı en fazla 7 gün dondurur.', capabilities: ['complaint', 'warn', 'note', 'hide', 'unhide', 'remove', 'restore', 'freeze', 'unfreeze'], limits: { freeze: 10080 } },
    4: { name: 'Baş Moderatör', description: 'Süresiz dondurma; en fazla 30 gün ban ve ban kaldırma.', capabilities: ['complaint', 'warn', 'note', 'hide', 'unhide', 'remove', 'restore', 'freeze', 'unfreeze', 'ban', 'unban'], limits: { ban: 43200 } },
    5: { name: 'Yönetici Yardımcısı', description: 'Süresiz ban ve toplu işlemler.', capabilities: ['complaint', 'warn', 'note', 'hide', 'unhide', 'remove', 'restore', 'freeze', 'unfreeze', 'ban', 'unban', 'bulk'], limits: {} },
};

const slugsOf = (user) => (user?.roles || []).map((r) => (typeof r === 'string' ? r : r?.slug)).filter(Boolean);

/** 0 = moderatör değil; 1..5 = seviye; 99 = admin (sınırsız). */
export function levelOf(user) {
    if (!user) return 0;
    const roles = slugsOf(user);
    if (roles.includes('admin') || roles.includes('super_admin')) return ADMIN_LEVEL;
    if (!roles.includes('moderator')) return 0;
    const raw = Number(user.mod_level ?? user.permissions?.mod_level ?? 0);
    return raw > 0 ? Math.min(raw, MAX_LEVEL) : 1;
}

export function levelName(level) {
    if (level === ADMIN_LEVEL) return 'Yönetici';
    return MOD_LEVELS[level]?.name || `Seviye ${level}`;
}

export function capabilitiesOf(user) {
    const level = levelOf(user);
    if (level === ADMIN_LEVEL) return Object.keys(CAPABILITY_LABELS);
    return MOD_LEVELS[level]?.capabilities || [];
}

/** null = süresiz dahil serbest; sayı = en fazla o kadar dakika; false = yetki yok. */
export function limitFor(user, capability) {
    const level = levelOf(user);
    if (level === ADMIN_LEVEL) return null;
    const def = MOD_LEVELS[level];
    if (!def || !def.capabilities.includes(capability)) return false;
    return Object.prototype.hasOwnProperty.call(def.limits, capability) ? def.limits[capability] : null;
}

/**
 * minutes verilmezse yalnızca yetenek var mı diye bakar; null = süresiz
 * istek (sınırlı seviyede olmaz); sayı = sınırla karşılaştırılır.
 */
export function canDo(user, capability, minutes) {
    const limit = limitFor(user, capability);
    if (limit === false) return false;
    if (minutes === undefined) return true;
    if (limit === null) return true;
    if (minutes == null) return false;
    return minutes <= limit;
}
