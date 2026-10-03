/**
 * Dock'un gizlendiği yollar: mesajlar sayfası kendi arayüzünü çiziyor;
 * yönetim ve moderasyon panellerinde ise sağ alttaki dock tabloların
 * sayfalamasını örtüyordu.
 */
export const isDockHiddenPath = (pathname = '') => /^\/(messages|cpl-manage|mod)(\/|$)/.test(pathname);
