/*
 * 3D karakter görüntüleyicisini (three.js dahil) ayrı parça olarak, yalnızca
 * önizleme açılınca yükler. Ayrı modül olmasının sebebi testler: sayfa
 * testleri bu dosyayı mock'lar, WebGL jsdom'da hiç yüklenmez.
 */
export const loadAvatarViewer = () => import('../../../game/avatar/viewer.js');
