import { describe, expect, it } from 'vitest';
import {
  FREQ_GLYPHS, arrowDeg, chargeLevel, drillView, formatEU, formatRate, freqGlyph, freqName, freqString, liftView, machineState,
  networkView, parseFreq, pingText, statusLines, teleporterView,
} from './panelTechUtils.js';

const NET = {
  id: 0, nodes: 15, machines: 4, overflow: 0, gen: 12, demand: 8, supplied: 8, stored: 1200, cap: 5000, live: true, wasted: 0,
};

describe('frekans sembolleri', () => {
  it('8 sembol: şekil + ad; parse/string gidiş-dönüş; geçersiz null', () => {
    expect(FREQ_GLYPHS.length).toBe(8);
    expect(new Set(FREQ_GLYPHS).size).toBe(8);
    expect(freqGlyph(0)).toBe('▲');
    expect(freqName(3)).toBe('yıldız');
    expect(freqGlyph(9)).toBe(freqGlyph(1));
    expect(parseFreq('0123')).toEqual([0, 1, 2, 3]);
    expect(freqString([7, 0, 3, 5])).toBe('7035');
    expect(parseFreq('012')).toBeNull();
    expect(parseFreq('0128')).toBeNull();
    expect(parseFreq(null)).toBeNull();
    expect(freqString([9, -1, 2.7, NaN])).toBe('7020');
  });
});

describe('biçimler', () => {
  it('EU ve hız metinleri Türkçe/sade', () => {
    expect(formatEU(5000)).toBe('5 000 EU');
    expect(formatEU(NaN)).toBe('0 EU');
    expect(formatRate(12)).toBe('+12 EU/sn');
    expect(formatRate(-3.26)).toBe('-3,3 EU/sn');
    expect(formatRate(0)).toBe('0 EU/sn');
  });
});

describe('enerji ağı özeti', () => {
  it('ağ yoksa uyarı; dengede/yetersiz/kaynaksız seviyeleri', () => {
    expect(networkView({ network: null }).has).toBe(false);
    expect(networkView({ network: null }).level).toBe('none');
    const ok = networkView({ network: NET });
    expect(ok.pct).toBe(24);
    expect(ok.net).toBe(4);
    expect(ok.level).toBe('ok');
    expect(networkView({ network: { ...NET, demand: 30, supplied: 12 } }).level).toBe('short');
    const dead = networkView({ network: { ...NET, live: false, gen: 0, supplied: 0 } });
    expect(dead.level).toBe('dead');
    expect(dead.text).toMatch(/kaynağı yok/);
    expect(networkView({ network: { ...NET, cap: 0, stored: 0 } }).pct).toBe(0);
  });

  it('QA5: yakıtlı ama beklemedeki jeneratör ağı "kaynak yok" DEĞİL, "hazır" der (talep yokken jeneratör yanmaz)', () => {
    const idle = networkView({ network: { ...NET, live: false, standby: true, gen: 0, supplied: 0, demand: 0 } });
    expect(idle.level).toBe('ok');
    expect(idle.text).toMatch(/hazır/);
    expect(networkView({ network: { ...NET, live: false, standby: false, gen: 0, supplied: 0 } }).level).toBe('dead');
  });
});

describe('makine durumu', () => {
  it('tür başına durum metni ve ton', () => {
    expect(machineState({ type: 'jenerator', burning: true }).text).toBe('Yanıyor');
    expect(machineState({ type: 'jenerator', burning: false, fuel: null }).key).toBe('yakit');
    expect(machineState({ type: 'gunes', sky: false }).tone).toBe('bad');
    expect(machineState({ type: 'matkap', stop: 'ana_kaya' }).key).toBe('durdu');
    expect(machineState({ type: 'matkap', wait: 'dolu' }).key).toBe('dolu');
    expect(machineState({ type: 'matkap', on: true }).key).toBe('calisiyor');
    expect(machineState({ type: 'isinlayici', freq: null }).key).toBe('ayarsiz');
    expect(machineState({ type: 'isinlayici', freq: '0123', ready: true }).key).toBe('hazir');
    expect(machineState({ type: 'isinlayici', freq: '0123', ready: false, cooldown: 2 }).text).toBe('Soğuyor');
    expect(machineState({ type: 'kapi', open: true }).text).toBe('Açık');
    expect(machineState({ type: 'ocak', on: false, inItem: 'x', powered: false }).key).toBe('enerji');
    expect(machineState(null).key).toBe('yok');
  });

  it('ekran okuyucu özeti ağı da söyler', () => {
    const lines = statusLines({ type: 'pil', name: 'Pil Bankası', stored: 10, network: NET });
    expect(lines[0]).toMatch(/Pil Bankası: Şarjlı/);
    expect(lines[1]).toMatch(/Üretim 12/);
    expect(statusLines(null)).toEqual([]);
  });
});

describe('madenci / ışınlayıcı / asansör görünümleri', () => {
  it('madenci: durma nedeni, bekleme, tampon toplamı', () => {
    const v = drillView({
      mode: 'alan', cells: 25, depth: 12, mined: 80, stop: 'ana_kaya', wait: null, buffer: [{ item: 'item:kömür', count: 5 }, { item: 'blok:taş', count: 20 }], on: false, powered: true,
    });
    expect(v.stopped).toBe(true);
    expect(v.stopText).toMatch(/Ana kaya/);
    expect(v.total).toBe(25);
    expect(v.status).toBe(v.stopText);
    expect(drillView({ wait: 'yuk', buffer: [] }).waitText).toMatch(/yükleniyor/);
    expect(drillView({ wait: 'dolu', buffer: [] }).waitText).toMatch(/dolu/);
    expect(drillView(null).total).toBe(0);
  });

  it('ışınlayıcı: hazır değilken neden', () => {
    const base = {
      freq: '0123', partner: { x: 1, y: 2, z: 3 }, cooldown: 0, cost: 61, buf: 240, cap: 240, onPad: true,
    };
    expect(teleporterView(base).ready).toBe(true);
    expect(teleporterView({ ...base, freq: null }).reason).toMatch(/frekans/);
    expect(teleporterView({ ...base, partner: null }).reason).toMatch(/eş platform/);
    expect(teleporterView({ ...base, cooldown: 2.1 }).reason).toMatch(/3 sn/);
    expect(teleporterView({ ...base, buf: 10 }).reason).toMatch(/Enerji yetersiz/);
    expect(teleporterView({ ...base, onPad: false }).reason).toMatch(/üstüne çık/);
  });

  it('asansör: yön düğmeleri hedefe ve platform üstüne bağlı', () => {
    const base = {
      up: 47, down: null, buf: 80, cap: 80, cooldown: 0, onPad: true,
    };
    const v = liftView(base);
    expect(v.up).toBe(true);
    expect(v.down).toBe(false);
    expect(liftView({ ...base, onPad: false }).up).toBe(false);
    expect(liftView({ ...base, buf: 1 }).reason).toMatch(/Enerji/);
  });
});

describe('tarayıcı okları', () => {
  it('ok açısı: hedef solda → ok sola (negatif CSS dönüşü); karşıda 0; arkada ±180', () => {
    expect(arrowDeg({ yaw: 0 }, 0)).toBe(0);
    // yaw + sola: hedef yaw 0.5 rad, oyuncu 0 → hedef solda → CSS saat yönü ters (negatif)
    expect(arrowDeg({ yaw: 0.5 }, 0)).toBeLessThan(0);
    expect(arrowDeg({ yaw: -0.5 }, 0)).toBeGreaterThan(0);
    expect(Math.abs(arrowDeg({ yaw: Math.PI }, 0))).toBeCloseTo(180, 0);
    // sarma: 3.1 − (−3.1) farkı küçük açıya döner
    expect(Math.abs(arrowDeg({ yaw: 3.1 }, -3.1))).toBeLessThan(15);
    expect(arrowDeg(null, 1)).toBe(0);
  });

  it('ping metni mesafe ve dikey yön; şarj seviyesi', () => {
    expect(pingText({ name: 'Elmas Cevheri', dist: 13.6, dy: -10 })).toBe('Elmas Cevheri · 14 m · aşağıda');
    expect(pingText({ name: 'Kule', dist: 5, dy: 8 })).toMatch(/yukarıda/);
    expect(pingText({ name: 'Ceylan', dist: 5, dy: 0 })).toMatch(/aynı hizada/);
    expect(chargeLevel(0.05)).toBe('crit');
    expect(chargeLevel(0.25)).toBe('low');
    expect(chargeLevel(0.9)).toBe('ok');
  });
});
