/**
 * Dock'un gizlendiği yollar: mesajlar sayfası kendi arayüzünü çiziyor;
 * yönetim ve moderasyon panellerinde ise sağ alttaki dock tabloların
 * sayfalamasını örtüyordu. Tam ekran oyun sahneleri (/oyun/<oyun>/oyna) de
 * dock'u örtüyor: HUD ve sonuç ekranı dock'un altında kalıyordu.
 */
export const isDockHiddenPath = (pathname = '') =>
    /^\/(messages|cpl-manage|mod)(\/|$)/.test(pathname) || /^\/oyun\/[^/]+\/oyna(\/|$)/.test(pathname);
