import { describe, expect, it } from 'vitest';
import {
  PHOTO_DEFAULTS, PHOTO_FILTERS, PHOTO_FRAMES, PHOTO_LIMITS, PHOTO_RAINS, PHOTO_TIMES, basis, captureDims, defaultPhotoSettings, filterIndex, frameLayout,
  initialOrbit, orbitTarget, phaseOf, photoFileName, projectPoint, rainOf, sanitizePhotoPatch, solveOrbit, stepOrbit, subjectInFrame, tuneFor, wrapAngle, zoomOrbit,
} from './photoMath.js';
import { lookDir } from '../../physics.js';
import { PHOTO_FILTERS as NAMES } from '../cityNames.js';
import { scanText } from '../citySafeData.js';
import { mulberry32 } from '../../rng.js';

describe('foto matematiği: ayarlar', () => {
  it('varsayılanlar sınır içinde; filtre listesi cityNames ile uyumlu (yok + 6)', () => {
    const d = defaultPhotoSettings();
    expect(d.fov).toBeGreaterThanOrEqual(PHOTO_LIMITS.fovMin);
    expect(d.fov).toBeLessThanOrEqual(PHOTO_LIMITS.fovMax);
    expect(PHOTO_FILTERS.length).toBe(NAMES.length + 1);
    expect(PHOTO_FILTERS[0].id).toBe('yok');
    expect(PHOTO_FILTERS.map((f) => f.id).slice(1)).toEqual(NAMES.map((f) => f.id));
    expect(filterIndex('neon')).toBe(1);
    expect(filterIndex('yagmur')).toBe(6);
    expect(filterIndex('yok')).toBe(0);
    expect(filterIndex('__proto__')).toBe(0);
    expect(filterIndex(5)).toBe(0);
  });

  it('yama: sayılar sınırlanır, bilinmeyen anahtar/NaN/enum yok sayılır, girdi değişmez', () => {
    const cur = defaultPhotoSettings();
    const frozen = JSON.stringify(cur);
    const p = sanitizePhotoPatch(cur, {
      fov: 500, dist: -3, exposure: 99, grain: -1, bloom: 'x', vignette: NaN, filter: 'siyah_beyaz', frame: 'sinema', time: 'gece', rain: 'yagmurlu', freeze: true, mark: 'evet', evil: 1,
    });
    expect(JSON.stringify(cur)).toBe(frozen);
    expect(p.fov).toBe(PHOTO_LIMITS.fovMax);
    expect(p.dist).toBe(PHOTO_LIMITS.distMin);
    expect(p.exposure).toBe(PHOTO_LIMITS.exposureMax);
    expect(p.grain).toBe(0);
    expect(p.bloom).toBe(cur.bloom);
    expect(p.vignette).toBe(cur.vignette);
    expect(p.filter).toBe('siyah_beyaz');
    expect(p.frame).toBe('sinema');
    expect(p.time).toBe('gece');
    expect(p.rain).toBe('yagmurlu');
    expect(p.freeze).toBe(true);
    expect(p.mark).toBe(true);
    expect('evil' in p).toBe(false);
    const q = sanitizePhotoPatch(p, { filter: 'yok_boyle', frame: 3, time: 'sabaha', rain: null });
    expect(q.filter).toBe('siyah_beyaz');
    expect(q.frame).toBe('sinema');
  });

  it('fuzz: rastgele yama her zaman sınır içi ve sonlu ayar üretir', () => {
    const r = mulberry32(5);
    const junk = [NaN, Infinity, -Infinity, 1e30, -1e30, 0, '1', null, undefined, {}, [], true, '__proto__', 'constructor'];
    let s = defaultPhotoSettings();
    for (let i = 0; i < 400; i++) {
      const patch = {};
      ['fov', 'dist', 'height', 'exposure', 'bloom', 'vignette', 'grain', 'filterAmount', 'filter', 'frame', 'time', 'rain', 'freeze', 'mark', 'hideSelf', '__proto__', 'x'].forEach((k) => {
        if (r() < 0.5) patch[k] = r() < 0.5 ? junk[Math.floor(r() * junk.length)] : (r() - 0.5) * 400;
      });
      s = sanitizePhotoPatch(s, patch);
      expect(s.fov).toBeGreaterThanOrEqual(PHOTO_LIMITS.fovMin);
      expect(s.fov).toBeLessThanOrEqual(PHOTO_LIMITS.fovMax);
      expect(s.dist).toBeGreaterThanOrEqual(PHOTO_LIMITS.distMin);
      expect(s.dist).toBeLessThanOrEqual(PHOTO_LIMITS.distMax);
      ['exposure', 'bloom', 'vignette', 'grain', 'height', 'filterAmount'].forEach((k) => expect(Number.isFinite(s[k])).toBe(true));
      expect(PHOTO_FILTERS.some((f) => f.id === s.filter)).toBe(true);
      expect(PHOTO_FRAMES.some((f) => f.id === s.frame)).toBe(true);
      expect(PHOTO_TIMES.some((f) => f.id === s.time)).toBe(true);
      expect(PHOTO_RAINS.some((f) => f.id === s.rain)).toBe(true);
      expect(Object.keys(s).sort()).toEqual(Object.keys(defaultPhotoSettings()).sort());
    }
  });

  it('saat ve yağmur ön ayarları: gerçek = null, diğerleri 0..1', () => {
    expect(phaseOf('gercek')).toBeNull();
    expect(phaseOf('bilinmez')).toBeNull();
    PHOTO_TIMES.slice(1).forEach((t) => {
      expect(t.phase).toBeGreaterThan(0);
      expect(t.phase).toBeLessThan(1);
      expect(phaseOf(t.id)).toBe(t.phase);
    });
    expect(rainOf('gercek')).toBeNull();
    expect(rainOf('kuru')).toBe(0);
    expect(rainOf('yagmurlu')).toBeGreaterThan(0.5);
  });

  it('görünen adlar aile dostu ve marka içermez (citySafe)', () => {
    const all = [].concat(PHOTO_FILTERS.map((f) => f.name), PHOTO_FRAMES.map((f) => f.name), PHOTO_TIMES.map((f) => f.name), PHOTO_RAINS.map((f) => f.name), ['Neon Meridyen']);
    all.forEach((t) => expect(scanText(t)).toEqual([]));
  });
});

describe('foto matematiği: yörünge', () => {
  it('basis ileri vektörü physics.lookDir ile aynı; sağ/yukarı dik ve birim', () => {
    const r = mulberry32(9);
    for (let i = 0; i < 100; i++) {
      const yaw = (r() - 0.5) * 12;
      const pitch = (r() - 0.5) * 2.6;
      const b = basis(yaw, pitch, null);
      const ld = lookDir(yaw, pitch, { x: 0, y: 0, z: 0 });
      expect(b.fx).toBeCloseTo(ld.x, 9);
      expect(b.fy).toBeCloseTo(ld.y, 9);
      expect(b.fz).toBeCloseTo(ld.z, 9);
      expect(b.fx * b.rx + b.fy * b.ry + b.fz * b.rz).toBeCloseTo(0, 9);
      expect(b.fx * b.ux + b.fy * b.uy + b.fz * b.uz).toBeCloseTo(0, 9);
      expect(Math.hypot(b.ux, b.uy, b.uz)).toBeCloseTo(1, 9);
      expect(b.uy).toBeGreaterThan(0);
    }
  });

  it('kamera hedefin arkasında dist kadar; bakış hedefe', () => {
    const target = orbitTarget({ x: 10, y: 64, z: -4 }, false, 0, null);
    expect(target.y).toBeCloseTo(65.4, 6);
    const o = solveOrbit({ yaw: 0.7, pitch: -0.2, dist: 6 }, target, null, null);
    expect(Math.hypot(o.x - target.x, o.y - target.y, o.z - target.z)).toBeCloseTo(6, 6);
    const b = basis(o.yaw, o.pitch, null);
    expect(target.x - o.x).toBeCloseTo(b.fx * 6, 6);
    expect(target.y - o.y).toBeCloseTo(b.fy * 6, 6);
    expect(target.z - o.z).toBeCloseTo(b.fz * 6, 6);
    const pt = projectPoint({ x: o.x, y: o.y, z: o.z, yaw: o.yaw, pitch: o.pitch, fov: 62 }, 16 / 9, target, null);
    expect(pt.x).toBeCloseTo(0, 6);
    expect(pt.y).toBeCloseTo(0, 6);
    expect(pt.depth).toBeCloseTo(6, 6);
  });

  it('blok ışını kamerayı engelin önünde durdurur (≥ minBoom) ve 25 m aşılmaz', () => {
    const target = { x: 0, y: 65, z: 0 };
    const wall = (ox, oy, oz, dx, dy, dz, max) => (2.5 <= max ? 2.5 : null);
    const o = solveOrbit({ yaw: 0, pitch: 0, dist: 12 }, target, wall, null);
    expect(o.blocked).toBe(true);
    expect(o.dist).toBeCloseTo(2.5 - PHOTO_LIMITS.margin, 6);
    const tight = solveOrbit({ yaw: 0, pitch: 0, dist: 12 }, target, () => 0.1, null);
    expect(tight.dist).toBeGreaterThanOrEqual(PHOTO_LIMITS.minBoom - 1e-9);
    const far = solveOrbit({ yaw: 0, pitch: 0, dist: 500 }, target, null, null);
    expect(far.dist).toBe(PHOTO_LIMITS.distMax);
    const free = solveOrbit({ yaw: 0, pitch: 0, dist: 4 }, target, () => null, null);
    expect(free.blocked).toBe(false);
    expect(free.dist).toBe(4);
  });

  it('adım/yakınlaştırma sınırlı; NaN güvenli; yaw sarılır', () => {
    const s = { yaw: 3.0, pitch: 0, dist: 5 };
    stepOrbit(s, 1, 99);
    expect(s.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(s.yaw).toBeLessThanOrEqual(Math.PI);
    expect(s.pitch).toBe(PHOTO_LIMITS.pitchMax);
    stepOrbit(s, NaN, NaN);
    expect(Number.isFinite(s.yaw) && Number.isFinite(s.pitch)).toBe(true);
    zoomOrbit(s, 1000);
    expect(s.dist).toBe(PHOTO_LIMITS.distMax);
    zoomOrbit(s, -1000);
    expect(s.dist).toBe(PHOTO_LIMITS.distMin);
    zoomOrbit(s, NaN);
    expect(s.dist).toBe(PHOTO_LIMITS.distMin);
    expect(Math.abs(wrapAngle(7 * Math.PI))).toBeCloseTo(Math.PI, 5);
    expect(Math.abs(wrapAngle(1e9))).toBeLessThanOrEqual(Math.PI);
    expect(wrapAngle(Infinity)).toBe(0);
    const o = solveOrbit({ yaw: NaN, pitch: NaN, dist: NaN }, { x: 0, y: 0, z: 0 }, null, null);
    ['x', 'y', 'z', 'dist'].forEach((k) => expect(Number.isFinite(o[k])).toBe(true));
    expect(initialOrbit(2).yaw).toBe(2);
  });

  it('aynı girdi aynı çıktı (belirlenimci)', () => {
    const a = solveOrbit({ yaw: 1.1, pitch: 0.3, dist: 7 }, { x: 3, y: 70, z: 9 }, () => 4, null);
    const b = solveOrbit({ yaw: 1.1, pitch: 0.3, dist: 7 }, { x: 3, y: 70, z: 9 }, () => 4, null);
    expect(a).toEqual(b);
  });
});

describe('foto matematiği: kadraj testi', () => {
  const cam = {
    x: 0, y: 66, z: 0, yaw: 0, pitch: 0, fov: 62,
  };
  const subj = (x, y, z, r) => ({ x, y, z, r });

  it('önündeki nesne kadrajda; arkadaki değil; kenar dışı ve küçük/uzak ayrılır', () => {
    expect(subjectInFrame(cam, 16 / 9, subj(0, 66, -10, 1.5), null).ok).toBe(true);
    expect(subjectInFrame(cam, 16 / 9, subj(0, 66, 10, 1.5), null).why).toBe('arka');
    expect(subjectInFrame(cam, 16 / 9, subj(40, 66, -10, 1.5), null).why).toBe('kenar');
    expect(subjectInFrame(cam, 16 / 9, subj(0, 66, -55, 0.4), null).why).toBe('kucuk');
    expect(subjectInFrame(cam, 16 / 9, subj(0, 66, -80, 30), null).why).toBe('uzak');
  });

  it('görüş hattı: aradaki katı konuyu perdeler; konunun hemen önündeki yüzey saymaz', () => {
    const wallAt = (d) => (ox, oy, oz, dx, dy, dz, max) => (d <= max ? d : null);
    expect(subjectInFrame(cam, 16 / 9, subj(0, 66, -20, 2), wallAt(8)).why).toBe('engel');
    expect(subjectInFrame(cam, 16 / 9, subj(0, 66, -20, 2), wallAt(19)).ok).toBe(true); // terminal gövdesinin ön yüzü
  });

  it('projectPoint: sağdaki nesne NDC x>0, üstteki y>0; geniş FOV merkeze yaklaştırır', () => {
    const right = projectPoint(cam, 1, { x: 5, y: 66, z: -10 }, null);
    const up = projectPoint(cam, 1, { x: 0, y: 70, z: -10 }, null);
    expect(right.x).toBeGreaterThan(0);
    expect(up.y).toBeGreaterThan(0);
    const wide = projectPoint(Object.assign({}, cam, { fov: 90 }), 1, { x: 5, y: 66, z: -10 }, null);
    expect(wide.x).toBeLessThan(right.x);
  });

  it('fuzz: sonlu girdiler sonlu çıktı; bozuk girdi atmaz', () => {
    const r = mulberry32(21);
    for (let i = 0; i < 300; i++) {
      const c = {
        x: (r() - 0.5) * 100, y: 40 + r() * 80, z: (r() - 0.5) * 100, yaw: (r() - 0.5) * 20, pitch: (r() - 0.5) * 3, fov: 20 + r() * 70,
      };
      const res = subjectInFrame(c, 0.5 + r() * 2, subj((r() - 0.5) * 100, 40 + r() * 80, (r() - 0.5) * 100, r() * 4), null);
      expect(typeof res.ok).toBe('boolean');
      expect(Number.isFinite(res.x) && Number.isFinite(res.y) && Number.isFinite(res.size)).toBe(true);
    }
    expect(() => subjectInFrame({ x: NaN, y: 0, z: 0, yaw: 0, pitch: 0 }, NaN, { x: 0, y: 0, z: -3 }, null)).not.toThrow();
  });
});

describe('foto matematiği: kayıt', () => {
  it('captureDims: uzun kenar ≤ 1920, en-boy korunur, büyütme yok', () => {
    expect(captureDims(3840, 2160)).toEqual({ w: 1920, h: 1080, scale: 0.5 });
    expect(captureDims(1280, 720)).toEqual({ w: 1280, h: 720, scale: 1 });
    const t = captureDims(844 * 3, 390 * 3);
    expect(Math.max(t.w, t.h)).toBeLessThanOrEqual(1920);
    expect(captureDims(0, 0).w).toBe(1);
    expect(captureDims(NaN, 10).w).toBe(1);
    const r = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const w = 16 + Math.floor(r() * 6000);
      const h = 16 + Math.floor(r() * 4000);
      const d = captureDims(w, h);
      expect(Math.max(d.w, d.h)).toBeLessThanOrEqual(1920);
      expect(Math.abs(d.w / d.h - w / h) / (w / h)).toBeLessThan(0.08);
    }
  });

  it('çerçeve yerleşimi: yok → hiçbir şey; sinema: görüntü çok genişse bant yok; anlık alt şerit', () => {
    expect(frameLayout(1280, 720, 'yok')).toMatchObject({ bars: 0, border: 0, caption: 0 });
    expect(frameLayout(1280, 720, 'sinema').bars).toBeGreaterThan(0);
    expect(frameLayout(2400, 900, 'sinema').bars).toBe(0);
    expect(frameLayout(1280, 720, 'anlik').caption).toBeGreaterThan(frameLayout(1280, 720, 'anlik').border);
    expect(frameLayout(1280, 720, 'neon').corner).toBeGreaterThan(0);
    expect(frameLayout(1280, 720, 'bilinmez').border).toBe(0);
  });

  it('dosya adı kararlı ve güvenli', () => {
    expect(photoFileName({ y: 2026, mo: 10, d: 5, h: 7, mi: 8, s: 9 })).toBe('neon-meridyen-20261005-070809.jpg');
    expect(photoFileName(null)).toMatch(/^neon-meridyen-\d{8}-\d{6}\.jpg$/);
    expect(photoFileName({ y: NaN, mo: 99, d: -1, h: 1e9, mi: 'x', s: null })).toMatch(/^neon-meridyen-\d{8}-\d{6}\.jpg$/);
  });

  it('tuneFor postfx.tune alanlarını verir', () => {
    expect(tuneFor({ bloom: 1.2, exposure: 0.9, vignette: 0.5, grain: 0.2 })).toEqual({ bloom: 1.2, exposure: 0.9, vignette: 0.5 });
    expect(PHOTO_DEFAULTS.fov).toBe(62);
  });
});
