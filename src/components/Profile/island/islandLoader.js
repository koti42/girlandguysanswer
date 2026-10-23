/*
 * Ada Profili: ağır parçaları (three.js sahne motoru ve kahraman bileşeni)
 * yalnızca gerektiğinde, ayrı parça olarak yükler. Ana pakete hiçbir şey
 * girmez. Ayrı modül olmasının sebebi testler: testler bu dosyayı mock'lar,
 * WebGL jsdom'da hiç yüklenmez.
 *
 * Not: dizin adı gerçekte `components/Profile/island` (büyük P). Linux
 * derlemesinde büyük/küçük harf önemlidir; içe aktarırken bu yazımı kullanın.
 */
export const loadIslandScene = () => import('../../../game/island/index.js');

// Kahraman parçası inmezse (ağ hatası) profil bozulmasın: kapak yedeği çizilir.
const HeroLoadFailed = ({ fallback = null }) => fallback;

export const loadIslandHero = () =>
    import('./ProfileIslandHero.jsx').catch(() => ({ default: HeroLoadFailed }));
