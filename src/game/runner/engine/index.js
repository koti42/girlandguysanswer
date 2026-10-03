/*
 * "Herkesler Koşuyor" 3D motoru — giriş noktası (şartname §5).
 *
 * Arayüz bu dosyayı yalnızca oyun ekranında dinamik import eder
 * (`await import('.../engine/index.js')`); three ve motor ayrı bir chunk'a
 * düşer, site paketine girmez.
 *
 * createRunnerGame({ container, seed, gates, character, muted, musicEnabled, reducedMotion, callbacks })
 *   -> Promise<{ start, pause, resume, quit, destroy, setMuted, setMusicEnabled, setGateResult, isPaused, snapshot, getStats }>
 * muted tüm sesi, musicEnabled (varsayılan true) yalnızca arka plan müziğini kapatır.
 * snapshot() oyunu bitirmeden { endTick, inputs, localScore } döner (geçerli
 * bir finish yükü); sayfa kapanırken destroy()'dan önce çağrılır.
 * Ayrıntılar game.js başındaki notta.
 */
export { createRunnerGame } from './game.js';
export { isWebGLAvailable } from './webgl.js';
export { CHARACTER_PALETTES } from './palette.js';
