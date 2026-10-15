/*
 * Geri bildirim / güvenlik bildirimi sabitleri (sunucu App\Models\Feedback ile birebir).
 * Mobil uygulamadaki FEEDBACK_CATEGORIES anahtarlarıyla aynı.
 */
export const FEEDBACK_CATEGORY_LABELS = {
    child_safety: 'Çocuk güvenliği',
    harassment: 'Taciz / zorbalık',
    inappropriate_content: 'Uygunsuz içerik',
    spam_fraud: 'Dolandırıcılık / spam',
    bug: 'Hata bildirimi',
    suggestion: 'Öneri',
    other: 'Diğer',
};

export const FEEDBACK_STATUS = {
    open: { label: 'Açık', tone: 'warning' },
    in_review: { label: 'İnceleniyor', tone: 'info' },
    resolved: { label: 'Çözüldü', tone: 'success' },
};

export const FEEDBACK_PLATFORM_LABELS = { android: 'Android', ios: 'iOS', web: 'Web' };
