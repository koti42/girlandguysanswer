/*
 * KEŞİF bulmaca kayıt defteri + ortak yüzey (saf; DOM/three yok, worker-güvenli).
 *
 * Bulmaca tipleri bu klasörde `<tip>.js` olarak durur ve içe aktarılınca kendini `registerPuzzle` ile kaydeder; bu dosya
 * onları OTOMATİK yükler (Vite `import.meta.glob`, `index.js`/`kit*.js`/`*.test.js` hariç). Böylece
 * `import { getPuzzle } from './puzzles/index.js'` yeterlidir.
 *
 *   registerPuzzle(type, impl) → impl   tip kaydı (arayüz doğrulanır; eksikse açık hata)
 *   getPuzzle(type) → impl | null       puzzleTypesForDifficulty(d) → [tip…] (belirlenimli sıralı)
 *   PUZZLE_TYPES                        11 kurallı ASCII anahtar (sabit sıra):
 *     basincplakasi runedizisi renkkollari isinayna itilebilirblok hareketliplatform golgekopru portaloda terazi
 *     kodkilidi suakisi
 *   + kit.js'in tüm yüzeyi (buildChamber, PuzzleManager, frame, fx, applyEffects, FakeWorld/fakeCtx, …):
 *     bulmaca yazarı sözleşmesi için kit.js dosya başındaki belgeye bak.
 *
 * Döngü güvenliği: kayıt defteri kitRegistry.js'te yaşar (bu dosyadan ve bulmaca modüllerinden önce değerlendirilir);
 * bulmaca modülleri `registerPuzzle`ı buradan alsa da canlı yeniden dışa aktarım olduğundan sorun çıkmaz.
 *
 * Yapı ajanı (decorateChunk): buildPuzzleRoom(desc, { seed, ...chunkWriter(chunk) }) ile oda kurar;
 * oyun: new PuzzleManager({world, emit, seed, spawnEntity}).register(id, desc) ile çalıştırır.
 */
export {
  PUZZLE_TYPES,
  registerPuzzle,
  getPuzzle,
  hasPuzzle,
  unregisterPuzzle,
  registeredPuzzleTypes,
  puzzleTypesForDifficulty,
  clampDifficulty,
} from './kitRegistry.js';
export * from './kit.js';
export { loadedPuzzleModules } from './kitLoader.js';
