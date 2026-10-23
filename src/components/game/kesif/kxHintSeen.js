/*
 * KEŞİF — "Kontroller nerede?" tek seferlik ipucunun görüldü bilgisi (localStorage).
 *
 * Oyun doğrudan başlar; kontrol özetini hiçbir kart kendiliğinden göstermez. Dünya başlığından sonra yalnızca bir kez küçük bir bildirim
 * ("Kontroller için Esc → Ayarlar → Nasıl Oynanır") çıkar ve burada işaretlenir. Ayarlar'daki "İpuçlarını yeniden göster" işareti siler.
 * Depolama kapalı/dolu olabilir: her erişim try/catch içinde; okunamazsa "görülmedi" sayılır.
 */

export const HINT_SEEN_KEY = 'kesif.hintSeen.v1';

export function readHintSeen() {
  try {
    return window.localStorage.getItem(HINT_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markHintSeen() {
  try {
    window.localStorage.setItem(HINT_SEEN_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function clearHintSeen() {
  try {
    window.localStorage.removeItem(HINT_SEEN_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Bildirim metni: masaüstünde Esc, dokunmatikte üst çubuktaki Duraklat düğmesi. */
export function controlsToastText(touch) {
  return touch ? 'Kontroller için Duraklat → Ayarlar → Nasıl Oynanır' : 'Kontroller için Esc → Ayarlar → Nasıl Oynanır';
}
