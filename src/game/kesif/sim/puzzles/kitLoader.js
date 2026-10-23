/*
 * KEŞİF bulmaca altyapısı — tip yükleyici.
 *
 * Bu klasördeki her `<tip>.js` içe aktarılınca kendini kaydeder. Yükleme, index.js'in EN SON içe aktardığı bu ayrı
 * modülde yapılır: böylece bulmaca modülleri `./index.js`ten registerPuzzle/buildChamber alırken kayıt defteri ve kit
 * zaten değerlendirilmiş olur (dairesel içe aktarma güvenli). Vite `import.meta.glob` (eager); `index.js`, `kit*.js` ve
 * `*.test.js` hariç.
 */
export const PUZZLE_MODULES = import.meta.glob(['./*.js', '!./index.js', '!./kit*.js', '!./*.test.js'], { eager: true });

/** Yüklenen bulmaca modülü dosya adları (sıralı). */
export function loadedPuzzleModules() {
  return Object.keys(PUZZLE_MODULES).sort();
}
