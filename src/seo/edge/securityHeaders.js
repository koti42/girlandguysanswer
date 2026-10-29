/*
 * Güvenlik başlıkları: fonksiyon yanıtları için functions/_middleware.js, statik dosyalar için public/_headers.
 * İki yer aynı listeyi yansıtmalı; securityHeaders.test.js _headers dosyasını bu nesneye karşı doğrular.
 *
 * Bilerek yok:
 *  - Tam CSP: reklam (AdSense), yazı tipleri, Pusher, reCAPTCHA ve API alanları için geniş bir izin listesi
 *    gerekir; yanlış bir satır siteyi kırar. Yalnızca frame-ancestors ile tıklama hırsızlığı kapatılır.
 *  - HSTS includeSubDomains: alt alan adlarının tamamı HTTPS garantili değil.
 *  - Permissions-Policy: sesli mesaj (mikrofon) ve Keşif oyunu (cihaz yönelimi) tarayıcı API'lerini kullanıyor.
 */
export const SECURITY_HEADERS = {
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "frame-ancestors 'self'",
};
