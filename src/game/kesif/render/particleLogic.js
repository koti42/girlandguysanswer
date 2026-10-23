/*
 * KEŞİF render — parçacık sistemi saf mantığı (three/DOM yok; node'da test edilir).
 *
 * - Halka tampon: yuvaları sırayla dağıtır (dolunca en eskinin üzerine yazar), karede değişen
 *   aralıkları birleştirip GPU'ya kısmi yükleme için verir (ayırma yok).
 * - Yoğunluk (olasılıklı yuvarlama), titreme sınırı (3 Hz), kalite tablosu.
 * - Shader'daki balistik/yörünge formüllerinin CPU karşılığı (test + dışarıdan konum sorgusu).
 */

/** Işık yanıp sönmesi için üst sınır (Hz): erişilebilirlik (WCAG 2.3.1). */
export const MAX_FLASH_HZ = 3;

export const PARTICLE_QUALITY = Object.freeze({
  low: Object.freeze({ density: 0.4, max: 512 }),
  medium: Object.freeze({ density: 0.7, max: 1024 }),
  high: Object.freeze({ density: 1, max: 2048 }),
});

/** 'low'|'medium'|'high' (veya 0..2, bilinmeyen → medium). */
export function qualityKey(q) {
  if (q === 0 || q === 'low' || q === 'düşük') return 'low';
  if (q === 2 || q === 'high' || q === 'yüksek') return 'high';
  return 'medium';
}

/** Titreme frekansını sınırlar; kısıtlı harekette titreme tamamen kapanır (0). */
export function safeFlickerHz(hz, reduced) {
  if (reduced) return 0;
  return hz > MAX_FLASH_HZ ? MAX_FLASH_HZ : hz;
}

/** n × yoğunluk, olasılıklı yuvarlama (ortalama tutar). rnd: () => [0,1). */
export function scaleCount(n, density, rnd) {
  const f = n * density;
  const base = Math.floor(f);
  return base + (rnd() < f - base ? 1 : 0);
}

const MAX_RUNS = 8;

/**
 * Halka tampon yuva dağıtıcısı. alloc() → yuva indeksi; drain(cb) kirli aralıkları cb(start, count) ile verir.
 * activeCap, capacity'den küçük olabilir (düşük kalitede daha az canlı parçacık).
 */
export function createRing(capacity) {
  const runs = new Int32Array(MAX_RUNS * 2);
  const ring = {
    capacity,
    activeCap: capacity,
    head: 0,
    high: 0,
    total: 0,
    runCount: 0,
    runLo: -1,
    runHi: -1,
    since: 0,
    full: false,
    alloc() {
      let i = this.head;
      if (i >= this.activeCap) i = 0;
      this.head = i + 1 >= this.activeCap ? 0 : i + 1;
      if (i + 1 > this.high) this.high = i + 1;
      this.total++;
      this.since++;
      if (this.since >= this.activeCap) this.full = true;
      if (!this.full) {
        if (this.runLo < 0) { this.runLo = i; this.runHi = i; } else if (i === this.runHi + 1) this.runHi = i;
        else {
          this._closeRun();
          this.runLo = i; this.runHi = i;
        }
      }
      return i;
    },
    _closeRun() {
      if (this.runLo < 0) return;
      if (this.runCount >= MAX_RUNS) { this.full = true; this.runLo = -1; return; }
      runs[this.runCount * 2] = this.runLo;
      runs[this.runCount * 2 + 1] = this.runHi - this.runLo + 1;
      this.runCount++;
      this.runLo = -1;
    },
    /** Kirli aralıkları verir ve temizler. Dönen: yazılan yuva sayısı (en çok high). */
    drain(cb) {
      let n = 0;
      if (this.full) {
        cb(0, this.high);
        n = this.high;
      } else {
        this._closeRun();
        if (this.full) { cb(0, this.high); n = this.high; } else {
          for (let r = 0; r < this.runCount; r++) { cb(runs[r * 2], runs[r * 2 + 1]); n += runs[r * 2 + 1]; }
        }
      }
      this.runCount = 0; this.runLo = -1; this.runHi = -1; this.since = 0; this.full = false;
      return n;
    },
    /** Tüm tamponu kirli say (temizleme/yeniden temellendirme sonrası). */
    markAll() {
      this.full = true;
      this.since = this.activeCap;
    },
    setActiveCap(n) {
      this.activeCap = Math.max(1, Math.min(this.capacity, n | 0));
      if (this.head >= this.activeCap) this.head = 0;
    },
    reset() {
      this.head = 0; this.high = 0; this.total = 0; this.runCount = 0; this.runLo = -1; this.runHi = -1; this.since = 0; this.full = false;
    },
  };
  return ring;
}

/**
 * Balistik yer değiştirme (shader ile aynı): hız v0 üstel sönümlü (drag k), yerçekimi g (y).
 * out = [dx,dy,dz]. k → 0 iken serbest düşmeye (v0 t + g t²/2) yakınsar.
 */
export function ballistic(out, vx, vy, vz, gravity, drag, t) {
  const k = Math.max(drag, 0.01);
  const D = (1 - Math.exp(-k * t)) / k;
  const G = (t - D) / k;
  out[0] = vx * D;
  out[1] = vy * D + gravity * G;
  out[2] = vz * D;
  return out;
}

/** Anlık hız (shader'daki türev). */
export function ballisticVelocity(out, vx, vy, vz, gravity, drag, t) {
  const k = Math.max(drag, 0.01);
  const e = Math.exp(-k * t);
  out[0] = vx * e;
  out[1] = vy * e + gravity * ((1 - e) / k);
  out[2] = vz * e;
  return out;
}

/** Yörünge modu konumu (eksen Y: düzlem XZ). out = [x,y,z] merkeze göre. */
export function orbit(out, r0, rise, phase0, omega, r1, t, life, axis = 0) {
  const u = Math.min(1, Math.max(0, t / life));
  const e = u * u * (3 - 2 * u);
  const r = r0 + (r1 - r0) * e;
  const ang = phase0 + omega * t;
  const h = rise * t;
  const c = Math.cos(ang) * r;
  const s = Math.sin(ang) * r;
  if (axis === 0) { out[0] = c; out[1] = h; out[2] = s; } else if (axis === 1) { out[0] = h; out[1] = c; out[2] = s; } else { out[0] = c; out[1] = s; out[2] = h; }
  return out;
}

/** Shader'daki solma eğrisi: girişte hızlı açılır, son %25'te söner. u = yaş/ömür. */
export function fadeCurve(u) {
  const a = Math.min(1, Math.max(0, u / 0.06));
  const b = Math.min(1, Math.max(0, (u - 0.75) / 0.25));
  return a * a * (3 - 2 * a) * (1 - b * b * (3 - 2 * b));
}

/** Eksen adı/vektörü → halka yönü kodu: 0 = Y normal (yer), 1 = X normal, 2 = Z normal, 3 = kameraya dönük. */
export function orientFromNormal(nx, ny, nz) {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ay >= ax && ay >= az) return 0;
  return ax >= az ? 1 : 2;
}

/** Yaratık/olay konumu ya da dizi → x (zero-alloc okuma). */
export const px = (p) => (p.x !== undefined ? p.x : p[0]);
export const py = (p) => (p.y !== undefined ? p.y : p[1]);
export const pz = (p) => (p.z !== undefined ? p.z : p[2]);

/** Ortam parçacığı türleri ve (yoğunluk 1, şiddet 1'de) saniyedeki doğma sayıları. */
export const AMBIENT_RATES = Object.freeze({
  fireflies: 2.4, pollen: 3.2, dust: 3.6, snow: 5.5, embers: 4.2, spores: 3.0,
  // biyom genişletmesi: düşen sonbahar yaprağı / kiraz taçyaprağı / yanardağ külü (kare parçacıklar; kalite katmanı yoğunluğu çarpar)
  leaves: 2.6, petals: 3.0, ash: 4.4,
});
export const AMBIENT_KINDS = Object.freeze(Object.keys(AMBIENT_RATES));

/** Ortam karışımını sınırlar: bilinmeyen anahtarlar atılır, değerler 0..1. */
export function sanitizeAmbient(mix) {
  const out = {};
  for (let i = 0; i < AMBIENT_KINDS.length; i++) {
    const k = AMBIENT_KINDS[i];
    const v = mix && Number(mix[k]);
    out[k] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  }
  return out;
}
