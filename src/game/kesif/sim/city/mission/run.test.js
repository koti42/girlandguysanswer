import { describe, expect, it } from 'vitest';
import {
  RUN_STATUS, createRun, eventStep, gatesStep, gotoStep, holdStep, restoreRun, segCircle, validateDef, waitStep,
} from './run.js';

const def = (steps, extra) => Object.assign({ id: 'test_run', kind: 'quest', title: 'Deneme', steps }, extra || null);
const at = (x, z, extra) => Object.assign({ x, y: 64, z, speed: 0, cls: null }, extra || null);

describe('run: doğrulama ve sıralı adımlar', () => {
  it('geçersiz tanım fırlatır; geçerli tanım null döner', () => {
    expect(validateDef(null)).not.toBeNull();
    expect(validateDef({ id: 'A B', steps: [] })).not.toBeNull();
    expect(validateDef(def([{ type: 'goto', x: 1, z: 1, r: 0 }]))).not.toBeNull();
    expect(validateDef(def([{ type: 'bilinmez' }]))).not.toBeNull();
    expect(() => createRun(def([]))).toThrow();
    expect(validateDef(def([gotoStep('a', { x: 0, y: 64, z: 0 }, 5)]))).toBeNull();
  });

  it('goto adımları SIRAYLA tamamlanır; sırayı atlayan konum ikinci adımı tamamlamaz', () => {
    const r = createRun(def([gotoStep('A', { x: 0, y: 64, z: 0 }, 5), gotoStep('B', { x: 100, y: 64, z: 0 }, 5)]));
    r.start();
    r.update(1 / 60, at(100, 0)); // B'ye doğrudan git: A tamamlanmadı
    expect(r.step).toBe(0);
    r.update(1 / 60, at(1, 1));
    expect(r.step).toBe(1);
    expect(r.status).toBe(RUN_STATUS.ACTIVE);
    const ev = r.update(1 / 60, at(100, 0));
    expect(r.status).toBe(RUN_STATUS.DONE);
    expect(ev.some((e) => e.type === 'done')).toBe(true);
    expect(r.result.status).toBe('done');
  });

  it('aynı karede ardışık adımlar zincirlenir (üst üste hedef)', () => {
    const r = createRun(def([gotoStep('A', { x: 0, y: 64, z: 0 }, 5), gotoStep('B', { x: 2, y: 64, z: 0 }, 5)]));
    r.start();
    r.update(1 / 60, at(1, 0));
    expect(r.status).toBe(RUN_STATUS.DONE);
  });

  it('dikey tolerans: çok farklı yükseklikte (ör. çatı) hedef sayılmaz', () => {
    const r = createRun(def([gotoStep('A', { x: 0, y: 64, z: 0 }, 5)]));
    r.start();
    r.update(1 / 60, at(0, 0, { y: 120 }));
    expect(r.status).toBe(RUN_STATUS.ACTIVE);
    r.update(1 / 60, at(0, 0, { y: 66 }));
    expect(r.status).toBe(RUN_STATUS.DONE);
  });

  it('mode vehicle/foot ve maxSpeed (dur) kuralları', () => {
    const r = createRun(def([gotoStep('A', { x: 0, y: 64, z: 0 }, 5, { mode: 'vehicle', maxSpeed: 3 })]));
    r.start();
    r.update(1 / 60, at(0, 0, { cls: null }));
    expect(r.step).toBe(0);
    r.update(1 / 60, at(0, 0, { cls: 'taksi', speed: 9 }));
    expect(r.step).toBe(0);
    r.update(1 / 60, at(0, 0, { cls: 'taksi', speed: 1 }));
    expect(r.status).toBe(RUN_STATUS.DONE);
  });

  it('hold: yarıçaptan çıkınca sayaç sıfırlanır; wait: zamanla biter; event: notify ile ilerler', () => {
    const r = createRun(def([holdStep('Tut', { x: 0, y: 64, z: 0 }, 3, 1), waitStep('Bekle', 0.5), eventStep('Olay', 'foto', 2)]));
    r.start();
    for (let i = 0; i < 40; i++) r.update(1 / 60, at(0, 0));
    r.update(1 / 60, at(50, 0));
    expect(r.held).toBe(0);
    for (let i = 0; i < 70; i++) r.update(1 / 60, at(0, 0));
    expect(r.step).toBe(1);
    for (let i = 0; i < 40; i++) r.update(1 / 60, at(0, 0));
    expect(r.step).toBe(2);
    r.notify('baska');
    expect(r.step).toBe(2);
    r.notify('foto');
    expect(r.status).toBe(RUN_STATUS.ACTIVE);
    r.notify('foto');
    expect(r.status).toBe(RUN_STATUS.DONE);
  });

  it('süre sınırı: dolunca başarısız (sure_doldu); timeScale ×2 erişilebilirlik süreyi uzatır', () => {
    const d = def([gotoStep('A', { x: 500, y: 64, z: 0 }, 5)], { limit: 10 });
    const r = createRun(d);
    r.start();
    for (let i = 0; i < 700; i++) r.update(1 / 60, at(0, 0));
    expect(r.status).toBe(RUN_STATUS.FAILED);
    expect(r.reason).toBe('sure_doldu');
    const r2 = createRun(d, { timeScale: 2 });
    r2.start();
    for (let i = 0; i < 700; i++) r2.update(1 / 60, at(0, 0));
    expect(r2.status).toBe(RUN_STATUS.ACTIVE);
    expect(r2.view().timeLeft).toBeGreaterThan(8);
  });

  it('en kısa süre (hile): minTime altında bitiş geçersiz sayılır', () => {
    const r = createRun(def([gotoStep('A', { x: 0, y: 64, z: 0 }, 5)], { minTime: 5 }));
    r.start();
    r.update(1 / 60, at(0, 0));
    expect(r.status).toBe(RUN_STATUS.FAILED);
    expect(r.reason).toBe('sure_gecersiz');
    const r2 = createRun(def([gotoStep('A', { x: 0, y: 64, z: 0 }, 5)], { minTime: 0.05 }));
    r2.start();
    for (let i = 0; i < 10; i++) r2.update(1 / 60, at(900, 0));
    r2.update(1 / 60, at(0, 0));
    expect(r2.status).toBe(RUN_STATUS.DONE);
  });

  it('iptal her an mümkün; iptal sonrası update bir şey yapmaz; yeniden denenebilir', () => {
    const r = createRun(def([gotoStep('A', { x: 500, y: 64, z: 0 }, 5)]));
    r.start();
    r.update(0.5, at(0, 0));
    r.cancel('iptal');
    expect(r.status).toBe(RUN_STATUS.CANCELLED);
    expect(r.update(1, at(500, 0))).toHaveLength(0);
    expect(r.status).toBe(RUN_STATUS.CANCELLED);
    expect(r.retry()).toBe(true);
    expect(r.attempts).toBe(2);
    expect(r.t).toBe(0);
    r.update(1 / 60, at(500, 0));
    expect(r.status).toBe(RUN_STATUS.DONE);
  });

  it('başlamamış koşucu da iptal edilebilir (soft-lock yok)', () => {
    const r = createRun(def([gotoStep('A', { x: 5, y: 64, z: 0 }, 5)]));
    r.cancel('iptal');
    expect(r.status).toBe(RUN_STATUS.CANCELLED);
  });
});

describe('run: kapılar, ışınlanma, araç değişimi', () => {
  const gates = [0, 1, 2, 3].map((i) => ({ x: i * 60, y: 64, z: 0, r: 7 }));

  it('kapılar sırayla; atlanan kapı sayılmaz; yüksek hızda parça-doğru geçiş', () => {
    const r = createRun(def([gatesStep('Kapılar', gates, 1)]));
    r.start();
    r.update(1 / 60, at(0, 0, { cls: 'spor' }));
    expect(r.passed).toBe(1);
    // kapı 1'i (x=60) 50 m yandan atla: 2. ve 3. kapıya doğru git → sayılmaz
    r.update(1 / 60, at(60, 50, { cls: 'spor' }));
    r.update(1 / 60, at(120, 50, { cls: 'spor' }));
    r.update(1 / 60, at(180, 50, { cls: 'spor' }));
    expect(r.passed).toBe(1);
    // büyük adım: 40 m'lik örneklemede kapıyı kesen parça yine sayılır (x 40 → 80 ⊃ 60)
    r.update(1 / 60, at(40, 0, { cls: 'spor' }));
    r.update(1 / 60, at(80, 0, { cls: 'spor' }));
    expect(r.passed).toBe(2);
    // kapı 2 (x=120) ve 3 (x=180) sırayla
    r.update(1 / 60, at(140, 0, { cls: 'spor' }));
    expect(r.passed).toBe(3);
    r.update(1 / 60, at(200, 0, { cls: 'spor' }));
    expect(r.status).toBe(RUN_STATUS.DONE);
  });

  it('tur sayısı: closed pist 2 tur → 2×kapı', () => {
    const r = createRun(def([gatesStep('Kapılar', gates, 2)]));
    r.start();
    expect(r.total).toBe(8);
    for (let lap = 0; lap < 2; lap++) {
      for (let i = 0; i < 4; i++) r.update(1 / 60, at(i * 60, 0));
    }
    expect(r.status).toBe(RUN_STATUS.DONE);
    expect(r.passed).toBe(8);
  });

  it('noTeleport: büyük konum sıçraması iptal eder; yavaşça gidenler etkilenmez', () => {
    const r = createRun(def([gotoStep('A', { x: 900, y: 64, z: 0 }, 5)], { noTeleport: true }));
    r.start();
    r.update(1 / 60, at(0, 0));
    for (let i = 1; i <= 100; i++) r.update(1 / 60, at(i * 0.85, 0));
    expect(r.status).toBe(RUN_STATUS.ACTIVE);
    r.update(1 / 60, at(600, 0));
    expect(r.status).toBe(RUN_STATUS.CANCELLED);
    expect(r.reason).toBe('ışınlanma');
  });

  it('def.cls: araç değişince iptal', () => {
    const r = createRun(def([gotoStep('A', { x: 900, y: 64, z: 0 }, 5)], { cls: 'spor' }));
    r.start();
    r.update(1 / 60, at(0, 0, { cls: 'spor' }));
    expect(r.status).toBe(RUN_STATUS.ACTIVE);
    r.update(1 / 60, at(0, 0, { cls: 'taksi' }));
    expect(r.status).toBe(RUN_STATUS.CANCELLED);
    expect(r.reason).toBe('arac_degisti');
  });

  it('erişilebilirlik radiusScale ×2 kapı/hedef yarıçapını büyütür', () => {
    const r = createRun(def([gotoStep('A', { x: 0, y: 64, z: 0 }, 5)]), { radiusScale: 2 });
    r.start();
    r.update(1 / 60, at(9, 0));
    expect(r.status).toBe(RUN_STATUS.DONE);
  });

  it('kırılgan paket: şiddetli çarpma başarısız; hafif çarpma sayılır ama sürer', () => {
    const r = createRun(def([gotoStep('A', { x: 900, y: 64, z: 0 }, 5)], { fragile: true }));
    r.start();
    r.notify('bump', { impact: 3 });
    expect(r.status).toBe(RUN_STATUS.ACTIVE);
    expect(r.bumps).toBe(1);
    r.notify('bump', { impact: 9 });
    expect(r.status).toBe(RUN_STATUS.FAILED);
    expect(r.reason).toBe('kirildi');
  });

  it('NaN/bozuk bağlam güvenli', () => {
    const r = createRun(def([gotoStep('A', { x: 0, y: 64, z: 0 }, 5)]));
    r.start();
    expect(r.update(NaN, at(NaN, 0))).toHaveLength(0);
    expect(r.update(1 / 60, null)).toHaveLength(0);
    expect(r.status).toBe(RUN_STATUS.ACTIVE);
  });
});

describe('run: anlık görüntü ve geri yükleme', () => {
  it('snapshot → restoreRun aynı adımdan sürer; kimlik uyuşmazlığı reddedilir', () => {
    const d = def([gotoStep('A', { x: 0, y: 64, z: 0 }, 5), gatesStep('K', [0, 1, 2].map((i) => ({ x: 100 + i * 60, y: 64, z: 0, r: 7 })), 1), gotoStep('B', { x: 400, y: 64, z: 0 }, 5)], { limit: 600 });
    const r = createRun(d);
    r.start();
    r.update(1 / 60, at(0, 0));
    r.update(1 / 60, at(100, 0));
    r.update(1 / 60, at(160, 0));
    const snap = JSON.parse(JSON.stringify(r.snapshot()));
    expect(snap.s).toBe(1);
    expect(snap.p).toBe(2);
    const r2 = restoreRun(d, snap);
    expect(r2).not.toBeNull();
    expect(r2.step).toBe(1);
    expect(r2.passed).toBe(2);
    r2.update(1 / 60, at(220, 0));
    expect(r2.step).toBe(2);
    expect(restoreRun(Object.assign({}, d, { id: 'baska' }), snap)).toBeNull();
    // bozuk anlık görüntü sınırlanır
    const r3 = restoreRun(d, { id: 'test_run', s: 999, p: -4, t: -1, a: 0 });
    expect(r3.step).toBe(0);
    expect(r3.t).toBe(0);
    expect(r3.attempts).toBe(1);
  });

  it('view: HUD alanları sonlu; hedef mesafesi güncellenir', () => {
    const r = createRun(def([gotoStep('A', { x: 300, y: 64, z: 400 }, 5)], { limit: 120 }));
    r.start();
    r.update(1 / 60, at(0, 0));
    const v = r.view();
    expect(v.dist).toBe(500);
    expect(v.timeLeft).toBe(120);
    expect(v.target.x).toBe(300);
    expect(Number.isFinite(v.t)).toBe(true);
  });

  it('segCircle: parça-daire kesişimi', () => {
    expect(segCircle(0, 0, 10, 0, 5, 3, 4)).toBe(true);
    expect(segCircle(0, 0, 10, 0, 5, 5, 4)).toBe(false);
    expect(segCircle(0, 0, 0, 0, 1, 1, 2)).toBe(true);
  });
});
