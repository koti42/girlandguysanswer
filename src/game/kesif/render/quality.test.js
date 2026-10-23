import { describe, it, expect } from 'vitest';
import {
  QUALITY, QUALITY_KEYS, PREF_KEY, pickInitialTier, loadQualityPref, saveQualityPref, createKesifQuality,
} from './quality.js';

function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    _m: m,
  };
}

/** Kare süresi besle; ilk değişim tanımlayıcısını (ya da null) döner. */
function feed(q, ms, seconds) {
  const out = [];
  const n = Math.ceil((seconds * 1000) / ms);
  for (let i = 0; i < n; i++) {
    const r = q.sample(ms);
    if (r) out.push(r);
  }
  return out;
}

describe('QUALITY tablosu', () => {
  it('kademeler artan görüş mesafesi ve dpr verir; düşükte post-fx kapalı', () => {
    expect(QUALITY.low.viewDist).toBeLessThan(QUALITY.medium.viewDist);
    expect(QUALITY.medium.viewDist).toBeLessThan(QUALITY.high.viewDist);
    expect(QUALITY.low.post).toBe(false);
    expect(QUALITY.medium.post).toBe(true);
    expect(QUALITY.high.msaa).toBeGreaterThan(0);
    expect(QUALITY.low.dprMax).toBe(1);
    expect(QUALITY_KEYS).toEqual(['low', 'medium', 'high']);
  });
});

describe('pickInitialTier', () => {
  it('yazılım GPU her zaman düşük', () => {
    expect(pickInitialTier({ rendererString: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device)', coarse: false, deviceMemory: 16, hardwareConcurrency: 16 })).toBe('low');
  });
  it('güçlü masaüstü yüksek', () => {
    expect(pickInitialTier({ coarse: false, deviceMemory: 8, hardwareConcurrency: 12, screenW: 1920, screenH: 1080, dpr: 1, rendererString: 'NVIDIA GeForce RTX 3060' })).toBe('high');
  });
  it('zayıf masaüstü orta, çok zayıf düşük', () => {
    expect(pickInitialTier({ coarse: false, deviceMemory: 8, hardwareConcurrency: 4 })).toBe('medium');
    expect(pickInitialTier({ coarse: false, deviceMemory: 2, hardwareConcurrency: 2 })).toBe('low');
  });
  it('telefon varsayılanı orta; az bellek/çekirdek düşük; güçlü telefon orta', () => {
    expect(pickInitialTier({ coarse: true, deviceMemory: 6, hardwareConcurrency: 8, screenW: 400, screenH: 850, dpr: 3 })).toBe('medium');
    expect(pickInitialTier({ coarse: true, deviceMemory: 2, hardwareConcurrency: 4 })).toBe('low');
    expect(pickInitialTier({ coarse: true, deviceMemory: 4, hardwareConcurrency: 4 })).toBe('low');
    expect(pickInitialTier({ coarse: true })).toBe('medium');
  });
  it('veri tasarrufu düşük; bilinmeyen/boş girdi güvenli', () => {
    expect(pickInitialTier({ saveData: true, coarse: false })).toBe('low');
    expect(QUALITY_KEYS).toContain(pickInitialTier());
    expect(QUALITY_KEYS).toContain(pickInitialTier({}));
  });
});

describe('kalıcılık', () => {
  it('kaydet/yükle gidiş-dönüş; bozuk kayıt varsayılana düşer', () => {
    const st = fakeStorage();
    expect(saveQualityPref({ tier: 'medium', viewDist: 8 }, st)).toBe(true);
    expect(loadQualityPref(st)).toEqual({ tier: 'medium', viewDist: 8 });
    st._m.set(PREF_KEY, '{bozuk');
    expect(loadQualityPref(st)).toEqual({ tier: 'auto', viewDist: null });
    st._m.set(PREF_KEY, JSON.stringify({ tier: 'ultra', viewDist: 99 }));
    expect(loadQualityPref(st)).toEqual({ tier: 'auto', viewDist: 12 });
  });
  it('storage yoksa ya da atarsa hata vermez', () => {
    expect(loadQualityPref(null)).toEqual({ tier: 'auto', viewDist: null });
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    expect(loadQualityPref(bad).tier).toBe('auto');
    expect(saveQualityPref({ tier: 'low', viewDist: null }, bad)).toBe(false);
  });
});

describe('createKesifQuality', () => {
  it('elle kademe seçimi ayarları verir ve kalıcılaştırır', () => {
    const st = fakeStorage();
    const q = createKesifQuality({ dpr: 2, coarse: false, start: 'high', storage: st });
    expect(q.tier).toBe('high');
    expect(q.auto).toBe(false);
    expect(q.settings.viewDist).toBe(QUALITY.high.viewDist);
    expect(q.pixelRatio).toBe(2);
    const ch = q.setTier('low');
    expect(ch.reason).toBe('manual');
    expect(ch.changed).toContain('viewDist');
    expect(ch.atlasChanged).toBe(true);
    expect(q.pixelRatio).toBe(1);
    expect(q.settings.post).toBe(false);
    expect(loadQualityPref(st).tier).toBe('low');
  });

  it('kayıtlı tercih okunur; start verilirse o geçer', () => {
    const st = fakeStorage({ [PREF_KEY]: JSON.stringify({ tier: 'medium', viewDist: 9 }) });
    const q = createKesifQuality({ dpr: 1, coarse: false, storage: st });
    expect(q.choice).toBe('medium');
    expect(q.viewDist).toBe(9);
    const q2 = createKesifQuality({ dpr: 1, coarse: false, start: 'low', storage: st, persist: false });
    expect(q2.choice).toBe('low');
  });

  it('elle seçimde uyarlama yok (sample hep null)', () => {
    const q = createKesifQuality({ dpr: 2, start: 'high', persist: false });
    expect(feed(q, 60, 20)).toEqual([]);
  });

  it('otomatikte yavaş kareler dpr/görüş mesafesini/kademeyi düşürür, atlas değişmez', () => {
    const q = createKesifQuality({
      dpr: 2, coarse: false, start: 'auto', persist: false, hints: { deviceMemory: 16, hardwareConcurrency: 16 },
    });
    expect(q.auto).toBe(true);
    const start = q.describe();
    expect(start.tier).toBe('high');
    q.warmup(0);
    const changes = feed(q, 45, 60);
    expect(changes.length).toBeGreaterThan(1);
    const last = changes[changes.length - 1].settings;
    expect(last.pixelRatio).toBeLessThan(start.pixelRatio);
    expect(last.viewDist).toBeLessThan(start.viewDist);
    expect(last.atlas).toBe(start.atlas);
    expect(changes.every((c) => c.atlasChanged === false && c.reason === 'auto')).toBe(true);
    // çok yavaş olunca etkin kademe düşer (post-fx/msaa kapanır ya da azalır)
    expect(['low', 'medium']).toContain(last.effTier);
    expect(last.msaa).toBeLessThanOrEqual(start.msaa);
  });

  it('hızlı kareler değişiklik üretmez', () => {
    const q = createKesifQuality({ dpr: 2, start: 'auto', persist: false, hints: { deviceMemory: 16, hardwareConcurrency: 16, coarse: false } });
    q.warmup(0);
    expect(feed(q, 8, 30)).toEqual([]);
  });

  it('görüş mesafesi elle verilirse kademe varsayılanını ezer; null geri alır', () => {
    const q = createKesifQuality({ dpr: 1, start: 'medium', persist: false });
    expect(q.viewDist).toBe(QUALITY.medium.viewDist);
    const ch = q.setViewDist(11);
    expect(ch.changed).toEqual(['viewDist']);
    expect(q.viewDist).toBe(11);
    expect(q.setViewDist(99).settings.viewDist).toBe(12);
    expect(q.setViewDist(null).settings.viewDist).toBe(QUALITY.medium.viewDist);
  });

  it('geçersiz kademe adı yok sayılır', () => {
    const q = createKesifQuality({ dpr: 1, start: 'high', persist: false });
    expect(q.setTier('ultra')).toBeNull();
    expect(q.tier).toBe('high');
  });

  it('aynı kademeyi yeniden seçmek değişim üretmez', () => {
    const q = createKesifQuality({ dpr: 1, start: 'medium', persist: false });
    expect(q.setTier('medium')).toBeNull();
  });
});
