import { describe, expect, it } from 'vitest';
import {
  AMBIENT_KEYS, INTERIOR_KINDS, LINE_KINDS, LINE_MAX, MOOD_HUES, NODE_LINE_MAX, OWNERS, OWNER_BY_ID,
  OWNER_BY_INTERIOR, getOwner, ownerForInterior, ownerLine, ownerNodeLines, splitLine,
} from './ownerData.js';
import { getBrand } from './cityBrands.js';
import { scanText } from './citySafeData.js';
import { itemByKey } from '../items.js';

describe('OWNERS — 16 iç mekân sahibi', () => {
  it('tam 16 sahip, donmuş, kimlik/ad/iç mekân benzersiz, her tür tam bir kez', () => {
    expect(OWNERS.length).toBe(16);
    expect(Object.isFrozen(OWNERS)).toBe(true);
    expect(new Set(OWNERS.map((o) => o.id)).size).toBe(16);
    expect(new Set(OWNERS.map((o) => o.name)).size).toBe(16);
    expect(OWNERS.map((o) => o.interior)).toEqual(INTERIOR_KINDS);
    OWNERS.forEach((o) => {
      expect(o.id).toMatch(/^[a-z0-9_]+$/);
      expect(Object.isFrozen(o)).toBe(true);
      expect(Object.isFrozen(o.lines)).toBe(true);
      expect(o.name.length).toBeLessThanOrEqual(16);
      expect(o.title.length).toBeGreaterThan(2);
      expect(['insan', 'robot']).toContain(o.species);
    });
    expect(OWNERS.filter((o) => o.species === 'robot').map((o) => o.id).sort()).toEqual(['cikrik', 'dr_bolt']);
  });

  it('her sahip: >= 2 huy etiketi, 6 satır, her satır <= 60 kr, noktalamayla biter', () => {
    OWNERS.forEach((o) => {
      expect(o.personality.length, o.id).toBeGreaterThanOrEqual(2);
      expect(o.lines.length, o.id).toBe(6);
      expect(LINE_KINDS.length).toBe(6);
      o.lines.forEach((l) => {
        expect(l.length, o.id + ': ' + l).toBeLessThanOrEqual(LINE_MAX);
        expect(l.length, o.id + ': ' + l).toBeGreaterThanOrEqual(10);
        expect(l, l).toMatch(/[.!?]$/);
        expect(l).toBe(l.trim());
        expect(l.indexOf('  ')).toBe(-1);
      });
    });
  });

  it('satırlar benzersiz (sahipler arası da) ve her sahibin satırları birbirinden farklı', () => {
    const all = [];
    OWNERS.forEach((o) => all.push.apply(all, o.lines));
    expect(new Set(all).size).toBe(all.length);
  });

  it('her satır diyalog düğümüne sığar: <= 2 parça, parça <= 34 kr', () => {
    OWNERS.forEach((o) => {
      LINE_KINDS.forEach((k) => {
        const parts = ownerNodeLines(o, k);
        expect(parts.length, o.id + ' ' + k).toBeLessThanOrEqual(2);
        parts.forEach((p) => expect(p.length, o.id + ': ' + p).toBeLessThanOrEqual(NODE_LINE_MAX));
        expect(parts.join(' ')).toBe(ownerLine(o, k));
      });
    });
  });

  it('satır türlerine uygun içerik: yağmur satırı yağmuru, gece satırı geceyi anar', () => {
    OWNERS.forEach((o) => {
      expect(ownerLine(o, 'yagmur').toLowerCase(), o.id).toMatch(/yağmur|[iı]slan|[iı]slak|damla/);
      expect(ownerLine(o, 'gece').toLowerCase(), o.id).toMatch(/gece/);
    });
  });

  it('mood: ışık 8–14, ton ve ortam anahtarı geçerli; imza eşya geçerli', () => {
    OWNERS.forEach((o) => {
      expect(o.mood.light).toBeGreaterThanOrEqual(8);
      expect(o.mood.light).toBeLessThanOrEqual(14);
      expect(Number.isInteger(o.mood.light)).toBe(true);
      expect(MOOD_HUES).toContain(o.mood.hue);
      expect(AMBIENT_KEYS).toContain(o.mood.ambient);
      expect(o.signature.key).toMatch(/^[a-z0-9_]+$/);
      expect(o.signature.itemKey).toMatch(/^item:[a-z0-9_çğıöşü]+$/);
      expect(o.signature.name.length).toBeGreaterThan(3);
    });
    expect(new Set(OWNERS.map((o) => o.signature.key)).size).toBe(16);
    expect(new Set(OWNERS.map((o) => o.mood.ambient)).size).toBe(16);
  });

  it('`existing:true` imzalar gerçekten oyunda tanımlı eşyalardır', () => {
    const existing = OWNERS.filter((o) => o.signature.existing);
    expect(existing.map((o) => o.id).sort()).toEqual(['hasan_amca', 'tuna']);
    existing.forEach((o) => {
      const it = itemByKey(o.signature.itemKey);
      expect(it, o.signature.itemKey).toBeTruthy();
    });
  });

  it('dükkân bağlantısı: brand kimliği var, iç mekân türü aynı', () => {
    OWNERS.forEach((o) => {
      const b = getBrand(o.brand);
      expect(b, o.id).not.toBe(null);
      expect(b.interior, o.id).toBe(o.interior);
    });
  });

  it('tüm sahip metinleri güvenli ve gerçek ad içermez', () => {
    OWNERS.forEach((o) => {
      [o.name, o.title, o.signature.name].concat(o.lines, o.personality).forEach((s) => {
        expect(scanText(s), s).toEqual([]);
      });
    });
  });

  it('erişim: getOwner / ownerForInterior / ownerLine / sahte anahtarlar güvenli', () => {
    expect(getOwner('usta_selvi').name).toBe('Usta Selvi');
    expect(getOwner('__proto__')).toBe(null);
    expect(getOwner('constructor')).toBe(null);
    expect(getOwner(undefined)).toBe(null);
    expect(ownerForInterior('ramen_bari').id).toBe('usta_selvi');
    expect(ownerForInterior('toString')).toBe(null);
    expect(OWNER_BY_ID.kemal.interior).toBe('holo_sinema');
    expect(OWNER_BY_INTERIOR.klinik.id).toBe('dr_bolt');
    const o = OWNERS[0];
    expect(ownerLine(o, 'selam')).toBe(o.lines[0]);
    expect(ownerLine(o, 'veda')).toBe(o.lines[5]);
    expect(ownerLine(o, 'bilinmeyen')).toBe(o.lines[1]);
  });
});

describe('splitLine', () => {
  it('kısa metin tek parça, uzun metin dengeli iki parça, sığmayan çok uzun sözcük çökertmez', () => {
    expect(splitLine('Merhaba')).toEqual(['Merhaba']);
    const two = splitLine('Hoş geldin evladım, oturuver. Çorba hazır.');
    expect(two.length).toBe(2);
    expect(two.join(' ')).toBe('Hoş geldin evladım, oturuver. Çorba hazır.');
    two.forEach((p) => expect(p.length).toBeLessThanOrEqual(34));
    expect(splitLine('a b c d e f g h', 8)).toEqual(['a b c d', 'e f g h']);
    const long = 'x'.repeat(50) + ' kısa';
    expect(splitLine(long).length).toBeLessThanOrEqual(2);
    expect(splitLine('x'.repeat(80)).length).toBe(1);
    expect(splitLine('')).toEqual(['']);
    expect(splitLine(null)).toEqual(['null']);
  });

  it('rastgele metinlerde parçalar birleşince özgün metin, parça sayısı <= 2 (sığıyorsa her parça <= max)', () => {
    let seed = 12345;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    for (let n = 0; n < 400; n++) {
      const words = [];
      const wc = 1 + Math.floor(rnd() * 9);
      for (let i = 0; i < wc; i++) words.push('x'.repeat(1 + Math.floor(rnd() * 12)));
      const text = words.join(' ');
      const parts = splitLine(text, 34);
      expect(parts.join(' ')).toBe(text);
      expect(parts.length).toBeLessThanOrEqual(2);
      let feasible = text.length <= 34;
      for (let c = 1; c < words.length; c++) {
        if (words.slice(0, c).join(' ').length <= 34 && words.slice(c).join(' ').length <= 34) feasible = true;
      }
      if (feasible) parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(34));
    }
  });
});
