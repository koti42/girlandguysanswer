/*
 * KEŞİF paneller — küçük yerel tercih deposu (favori/son kullanılan bloklar). Yalnızca izleyici başına bir
 * kolaylıktır; localStorage engelli/boş olabilir, bu yüzden her okuma/yazma try/catch içindedir.
 */
const MAX_ITEMS = 64;

export function readList(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.length < 80).slice(0, MAX_ITEMS) : [];
  } catch (_e) {
    return [];
  }
}

export function writeList(key, list) {
  try {
    window.localStorage.setItem(key, JSON.stringify((list || []).slice(0, MAX_ITEMS)));
  } catch (_e) {
    /* depolama kapalı: tercih yalnızca bu oturumda kalır */
  }
}
