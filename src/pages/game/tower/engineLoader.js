/*
 * Kule motorunu (three.js dahil) ayrı bir parça olarak, yalnızca oyun ekranı
 * açılınca yükler. Ayrı modül olmasının sebebi testler: sayfa testleri bu
 * dosyayı mock'lar, motorun kendisi (WebGL) jsdom'da hiç yüklenmez.
 */
export const loadTowerEngine = () => import('../../../game/tower/engine/index.js');
