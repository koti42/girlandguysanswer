/*
 * Erişilebilirlik modu (görme engelli / ekran okuyucu kullanan üyeler).
 * Kaynak: /user/me -> accessibility_mode (user_details.accessibility_mode).
 * Açıkken: quiz soru süresi sunucuda uzar, koşu/kule sorularını tarayıcı
 * seslendirir ve okunurken oyun bekler, arayüzde büyük yazı + belirgin odak.
 */

export const A11Y_ATTR = 'data-a11y';

export function isAccessibilityOn(user) {
    if (!user) return false;
    if (typeof user.accessibility_mode === 'boolean') return user.accessibility_mode;
    return Boolean(user.detail?.accessibility_mode);
}

/** <html data-a11y="1">: CSS büyük yazı / belirgin odak kuralları buna bağlı. */
export function applyAccessibilityAttr(on, root = typeof document !== 'undefined' ? document.documentElement : null) {
    if (!root) return;
    if (on) root.setAttribute(A11Y_ATTR, '1');
    else root.removeAttribute(A11Y_ATTR);
}
