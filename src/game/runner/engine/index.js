/*
 * "Herkesler Koşuyor" 3D motoru — giriş noktası (şartname §5).
 *
 * Arayüz bu dosyayı yalnızca oyun ekranında dinamik import eder
 * (`await import('.../engine/index.js')`); three ve motor ayrı bir chunk'a
 * düşer, site paketine girmez.
 *
 * createRunnerGame({ container, seed, gates, avatar, muted, musicEnabled, reducedMotion, timeOfDay, callbacks })
 *   -> Promise<{ start, pause, resume, quit, destroy, setMuted, setMusicEnabled, setGateResult, isPaused, snapshot, getStats }>
 * avatar: karakter yapılandırması (avatar/catalog.js Config); yoksa varsayılan karakter.
 * timeOfDay: 'auto' (varsayılan; mesafeyle gün/gece döngüsü) | 'day' | 'dusk' | 'night'.
 * callbacks: onHud({ ..., superPct }), onGateApproach, onGateCross, onCountdown,
 * onCrash, onEnd, onError, onPause, onHaptic(style) (yeni, opsiyonel).
 * muted tüm sesi, musicEnabled (varsayılan true) yalnızca arka plan müziğini kapatır.
 * snapshot() oyunu bitirmeden { endTick, inputs, localScore } döner (geçerli
 * bir finish yükü); sayfa kapanırken destroy()'dan önce çağrılır.
 * Ayrıntılar game.js başındaki notta.
 */
export { createRunnerGame, resolveAvatar } from './game.js';
export { isWebGLAvailable } from './webgl.js';
