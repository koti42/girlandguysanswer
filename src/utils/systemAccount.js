/*
 * Sistem hesabı: moderasyon ve hesap bildirimlerini taşıyan bot kullanıcı
 * (backend: Database\Seeders\SystemUserSeeder::SYSTEM_USERNAME). Sunucu bu
 * hesabın engellenmesini zaten reddeder ("Bu hesap engellenemez."); arayüz
 * de engelleme seçeneğini hiç göstermez.
 */
export const SYSTEM_USERNAME = 'herkeslersoruyor-system';

/** Kullanıcı adı ya da kullanıcı nesnesi sistem hesabı mı? (büyük/küçük harf duyarsız) */
export function isSystemAccount(userOrUsername) {
    const raw = typeof userOrUsername === 'string' ? userOrUsername : userOrUsername?.username;
    if (typeof raw !== 'string') return false;
    return raw.trim().replace(/^@/, '').toLowerCase() === SYSTEM_USERNAME;
}

/*
 * Engelleme seçeneği gösterilsin mi? Sistem hesabı engellenemez; ama eski bir
 * engel kalmışsa (sunucu kuralından önce) "Engeli kaldır" yine sunulur.
 */
export function canOfferBlock(userOrUsername, hasBlocked = false) {
    return Boolean(hasBlocked) || !isSystemAccount(userOrUsername);
}
