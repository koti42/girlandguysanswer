import { describe, expect, it } from 'vitest';
import {
  effectiveViewDist, planQualityChange, createFrameSampler, createViewBudget, triangleBudget, DRAW_BUDGET, DRAW_BUDGET_DESKTOP, drawBudgetFor,
} from './gameQuality.js';
import { createKesifQuality } from './render/quality.js';

describe('effectiveViewDist', () => {
  it('kullanıcı üst sınırı ile kademe görüş mesafesinin küçüğü; sınırlara sıkışır', () => {
    expect(effectiveViewDist(null, 10)).toBe(10);
    expect(effectiveViewDist(7, 10)).toBe(7);
    expect(effectiveViewDist(10, 5)).toBe(5);
    expect(effectiveViewDist(undefined, 7)).toBe(7);
    expect(effectiveViewDist(1, 7)).toBe(3);
    expect(effectiveViewDist(99, 99)).toBe(12);
    expect(effectiveViewDist(NaN, 6)).toBe(6);
  });
});

describe('planQualityChange', () => {
  it('boş/null değişim → işlem yok', () => {
    expect(planQualityChange(null, 7)).toEqual([]);
    expect(planQualityChange({}, 7)).toEqual([]);
  });

  it('otomatik uyarlama: dpr + görüş mesafesi, atlas ASLA', () => {
    const q = createKesifQuality({
      dpr: 2, coarse: false, start: 'auto', hints: { deviceMemory: 8, hardwareConcurrency: 8, screenW: 1920, screenH: 1080, dpr: 2 }, persist: false,
    });
    expect(q.tier).toBe('high');
    let change = null;
    for (let i = 0; i < 400 && !change; i++) change = q.sample(60);
    expect(change).not.toBeNull();
    const ops = planQualityChange(change, null);
    const names = ops.map((o) => o.op);
    expect(names).toContain('pixelRatio');
    expect(names).not.toContain('atlas');
    const vd = ops.find((o) => o.op === 'viewDist');
    if (vd) expect(vd.value).toBeLessThanOrEqual(10);
  });

  it('elle kademe değişimi: atlas + malzeme + post-fx + parçacık + chunk ayarı', () => {
    const q = createKesifQuality({ dpr: 1, coarse: false, start: 'high', persist: false });
    const ch = q.setTier('low');
    const ops = planQualityChange(ch, null);
    const names = ops.map((o) => o.op);
    ['viewDist', 'postfx', 'materials', 'sky', 'weather', 'particles', 'chunks', 'atlas'].forEach((n) => expect(names).toContain(n));
    expect(ops.find((o) => o.op === 'atlas').tier).toBe('low');
    expect(ops.find((o) => o.op === 'viewDist').value).toBe(5);
    expect(ops.find((o) => o.op === 'particles').tier).toBe('low');
  });

  it('kullanıcı görüş mesafesi kademeyi aşamaz', () => {
    const q = createKesifQuality({ dpr: 1, coarse: false, start: 'high', persist: false });
    const ch = q.setTier('low');
    expect(planQualityChange(ch, 9).find((o) => o.op === 'viewDist').value).toBe(5);
    const ch2 = q.setTier('high');
    expect(planQualityChange(ch2, 6).find((o) => o.op === 'viewDist').value).toBe(6);
  });
});

describe('createFrameSampler', () => {
  it('ısınma karelerini ve tek seferlik uzun kareyi atlar; art arda uzun kareyi sayar', () => {
    const s = createFrameSampler({ warmupFrames: 3, spikeMs: 100 });
    expect(s.sample(16)).toBe(-1);
    expect(s.sample(16)).toBe(-1);
    expect(s.sample(16)).toBe(-1);
    expect(s.sample(16)).toBe(16);
    expect(s.sample(400)).toBe(-1); // tek sıçrama (shader derlemesi)
    expect(s.sample(16)).toBe(16);
    expect(s.sample(400)).toBe(-1);
    expect(s.sample(300)).toBe(300); // art arda: gerçek yavaşlık
    expect(s.sample(NaN)).toBe(-1);
    expect(s.sample(0)).toBe(-1);
  });

  it('rewarm: duraklatma sonrası yeniden ısınır', () => {
    const s = createFrameSampler({ warmupFrames: 10 });
    for (let i = 0; i < 30; i++) s.sample(16);
    expect(s.sample(16)).toBe(16);
    s.rewarm(5);
    expect(s.sample(16)).toBe(-1);
  });
});

describe('üçgen bütçesi denetleyicisi', () => {
  it('bütçe kademeye göre', () => {
    expect(triangleBudget('low')).toBe(150000);
    expect(triangleBudget('medium')).toBe(300000);
    expect(triangleBudget('high')).toBe(400000);
  });
  it('bütçe aşılınca görüş mesafesini kısar (bekleme süresiyle), düşünce geri verir; tavanı vardır', () => {
    const b = createViewBudget({ maxCut: 2, cooldown: 1 });
    // bekleme süresi dolmadan değişmez
    expect(b.update(0.5, 400000, 'low')).toBe(0);
    let cut = 0;
    for (let i = 0; i < 40; i++) cut = b.update(0.25, 400000, 'low');
    expect(cut).toBe(2);
    // bütçenin altına inince geri verir (en çok 2 kez)
    for (let i = 0; i < 200; i++) cut = b.update(0.25, 20000, 'low');
    expect(cut).toBe(0);
  });
  it('çizim çağrısı bütçesi aşılınca (üçgen düşük olsa da) görüş mesafesi kısılır', () => {
    expect(DRAW_BUDGET).toBe(250);
    const b = createViewBudget({ maxCut: 2, cooldown: 1 });
    let cut = 0;
    for (let i = 0; i < 40; i++) cut = b.update(0.25, 100000, 'high', 330);
    expect(cut).toBe(2);
    // çizim çağrısı bütçe içindeyse yalnız üçgenler belirleyici (eski davranış)
    const b2 = createViewBudget({ maxCut: 2, cooldown: 1 });
    for (let i = 0; i < 40; i++) cut = b2.update(0.25, 300000, 'high', 120);
    expect(cut).toBe(0);
  });
  it('çizim bütçesi cihaz sınıfına göre: telefon 250, masaüstü 520 (aynı sahne yalnız telefonda kısılır)', () => {
    expect(drawBudgetFor(true)).toBe(DRAW_BUDGET);
    expect(drawBudgetFor(false)).toBe(DRAW_BUDGET_DESKTOP);
    const phone = createViewBudget({ maxCut: 3, cooldown: 1, drawBudget: drawBudgetFor(true) });
    const desk = createViewBudget({ maxCut: 3, cooldown: 1, drawBudget: drawBudgetFor(false) });
    let cp = 0;
    let cd = 0;
    for (let i = 0; i < 80; i++) {
      cp = phone.update(0.25, 150000, 'high', 360); // yaratıklarla birlikte 360 toplam çağrı
      cd = desk.update(0.25, 150000, 'high', 360);
    }
    expect(cp).toBeGreaterThan(0);
    expect(cd).toBe(0);
  });
  it('gürültüye dayanıklı: tek yüksek kare kırpma yapmaz; NaN yok sayılır', () => {
    const b = createViewBudget({ cooldown: 0.1 });
    for (let i = 0; i < 30; i++) b.update(0.1, 100000, 'low');
    b.update(0.016, 900000, 'low');
    expect(b.cut).toBe(0);
    expect(b.update(0.1, NaN, 'low')).toBe(0);
    b.reset();
    expect(b.cut).toBe(0);
  });
});
