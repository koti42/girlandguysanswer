/*
 * KEŞİF — kilit panelleri için küçük saf yardımcılar (LockPanel / HackPanel ortak). Ekran okuyucu metni: soğuma geri sayımının saniyeleri OKUNMAZ.
 */
export function liveTextOf(snap) {
  if (!snap) return '';
  if (snap.status === 'soguma') return 'Kilit dinleniyor.';
  return snap.live || '';
}
