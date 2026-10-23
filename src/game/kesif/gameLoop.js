/*
 * KEŞİF — sabit adımlı oyun döngüsü (60 Hz sim + ekran hızında çizim).
 *
 *   createStepper({stepMs?, maxFrameMs?, maxSteps?}) → { advance(frameMs) → adım sayısı, alpha, reset(), dropped }
 *       runner/engine/fixedStep.js biriktiricisi + kare başı adım tavanı (spiral-of-death önlemi): tavanı aşan süre atılır
 *       (sim gerçek zamandan YAVAŞ akar, asla hızlı akmaz).
 *   createFrameStats({window?}) → { push(frameMs), fps, avgMs, worstMs, spikes(>50 ms), reset() }   HUD fps + tanı
 *   createGameLoop({frame(frameMs, nowMs), raf?, caf?, now?}) → { start(), stop(), running, restartClock() }
 *       frame ilk çağrıda frameMs = 0 alır (durup başlayınca ışınlanma yok). raf/caf/now enjekte edilebilir (test).
 *
 * Saf mantık: DOM'a yalnız varsayılan raf/caf/now bağlanır (yoksa setTimeout).
 */
import { createFixedStepper, MAX_FRAME_MS, TICK_MS } from '../runner/engine/fixedStep.js';

export { TICK_MS, MAX_FRAME_MS };
export const MAX_STEPS_PER_FRAME = 6;

export function createStepper(opts) {
  const o = opts || {};
  const stepMs = o.stepMs > 0 ? o.stepMs : TICK_MS;
  const maxSteps = o.maxSteps > 0 ? o.maxSteps : MAX_STEPS_PER_FRAME;
  const inner = createFixedStepper({ stepMs, maxFrameMs: o.maxFrameMs > 0 ? o.maxFrameMs : MAX_FRAME_MS });
  let dropped = 0;
  return {
    advance(frameMs) {
      let n = inner.advance(frameMs);
      if (n > maxSteps) {
        dropped += n - maxSteps;
        n = maxSteps;
      }
      return n;
    },
    get alpha() {
      return inner.alpha;
    },
    get dropped() {
      return dropped;
    },
    get stepMs() {
      return stepMs;
    },
    reset() {
      inner.reset();
    },
  };
}

/** Kayan pencere ile kare istatistikleri (ring tampon; ayırma yok). */
export function createFrameStats(opts) {
  const size = (opts && opts.window) > 0 ? opts.window : 60;
  const buf = new Float32Array(size);
  let n = 0;
  let i = 0;
  let sum = 0;
  let spikes = 0;
  let worst = 0;
  let total = 0;
  return {
    push(ms) {
      if (!(ms >= 0) || !Number.isFinite(ms)) return;
      if (n === size) sum -= buf[i];
      else n++;
      buf[i] = ms;
      sum += ms;
      i = (i + 1) % size;
      total++;
      if (ms > 50) spikes++;
      if (ms > worst) worst = ms;
    },
    get avgMs() {
      return n === 0 ? 0 : sum / n;
    },
    get fps() {
      return n === 0 || sum <= 0 ? 0 : Math.round((1000 * n) / sum);
    },
    get spikes() {
      return spikes;
    },
    get worstMs() {
      return worst;
    },
    get frames() {
      return total;
    },
    reset() {
      n = 0;
      i = 0;
      sum = 0;
      spikes = 0;
      worst = 0;
      total = 0;
    },
  };
}

function defaultRaf(cb) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(defaultNow()), 16);
}
function defaultCaf(id) {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
}
function defaultNow() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export function createGameLoop(opts) {
  const o = opts || {};
  if (typeof o.frame !== 'function') throw new TypeError('createGameLoop: frame gerekli');
  const raf = o.raf || defaultRaf;
  const caf = o.caf || defaultCaf;
  const now = o.now || defaultNow;
  let id = 0;
  let running = false;
  let last = -1;

  function tick(t) {
    if (!running) return;
    const tt = typeof t === 'number' && Number.isFinite(t) ? t : now();
    const ms = last < 0 ? 0 : Math.max(0, tt - last);
    last = tt;
    // bir sonraki kare önce istenir: frame içindeki hata döngüyü öldürmesin (frame kendi try/catch'ini yönetir)
    id = raf(tick);
    o.frame(ms, tt);
  }

  return {
    start() {
      if (running) return false;
      running = true;
      last = -1;
      id = raf(tick);
      return true;
    },
    stop() {
      if (!running) return false;
      running = false;
      if (id) caf(id);
      id = 0;
      return true;
    },
    /** Sonraki kare dt = 0 olsun (duraklatma/sekme dönüşü). */
    restartClock() {
      last = -1;
    },
    get running() {
      return running;
    },
  };
}
