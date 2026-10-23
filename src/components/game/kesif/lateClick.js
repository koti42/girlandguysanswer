/*
 * KEŞİF — dokunmatik "gecikmeli tıklama" bekçisi.
 *
 * Sorun (final_gate, gerçek tarayıcı + CDP dokunma): sürüş düğmeleri eylemi `pointerdown`'da yürütür. "İn" (araçtan in) bastığı anda sürüş arayüzü sökülüp
 * yürüme arayüzü çizilir; parmak kalkınca tarayıcının ürettiği `click` artık parmağın altındaki YENİ öğeye (yürüme üst çubuğunun ilk düğmesi = Duraklat,
 * sürüşteki "İn" düğmesiyle aynı yerde) gider ve oyun araçtan indikten hemen sonra duraklıyordu.
 *
 * Çözüm: eylem düğmesine basılırken tek seferlik, yakalama evreli bir `click` süzgeci kurulur. Süzgeç yalnız basılan öğenin DIŞINA düşen (ya da basılan öğe
 * söküldüyse herhangi) ve basış noktasına yakın (≤ 64 px) ilk tıklamayı, kısa süre (≤ 600 ms) içinde yutar. Öğe yerinde kaldıysa (kendi tıklaması) hiçbir şey yutmaz:
 * ekran okuyucu/klavye etkinleştirme yolu ve `handled` bayrakları değişmez.
 */
export const LATE_MS = 600;
export const LATE_RADIUS = 64;

/**
 * @param {Element|null} el  basılan öğe
 * @param {number} x         basış noktası (clientX)
 * @param {number} y         basış noktası (clientY)
 * @param {{win?: Window, now?: () => number}} [env]  test için
 * @returns {() => void}     süzgeci iptal eder
 */
export function armLateClickGuard(el, x, y, env) {
  const win = (env && env.win) || (typeof window !== 'undefined' ? window : null);
  if (!win || typeof win.addEventListener !== 'function') return () => {};
  if (!Number.isFinite(x) || !Number.isFinite(y)) return () => {};
  const now = (env && env.now) || Date.now;
  const t0 = now();
  let timer = 0;
  let live = true;
  const done = () => {
    if (!live) return;
    live = false;
    win.removeEventListener('click', onClick, true);
    if (timer) clearTimeout(timer);
  };
  function onClick(e) {
    if (now() - t0 > LATE_MS) {
      done();
      return;
    }
    if (!e || e.isTrusted === false || e.detail === 0) return; // yazılımla üretilen / klavye-ekran okuyucu etkinleştirmesi: gecikmeli tıklama değildir
    const t = e.target;
    if (el && el.isConnected && t && typeof el.contains === 'function' && el.contains(t)) {
      done(); // basılan öğenin kendi tıklaması
      return;
    }
    const dx = (e.clientX || 0) - x;
    const dy = (e.clientY || 0) - y;
    if (dx * dx + dy * dy > LATE_RADIUS * LATE_RADIUS) return; // uzak bir tıklama: dokunma, süzgeç süresi dolana dek bekler
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
    done();
  }
  win.addEventListener('click', onClick, true);
  timer = setTimeout(done, LATE_MS + 100);
  return done;
}
