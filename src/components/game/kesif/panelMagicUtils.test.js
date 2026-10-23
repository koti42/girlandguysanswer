import { describe, expect, it } from 'vitest';
import {
  EFFECT_COLORS, EFFECT_ICON_PATHS, brewView, defaultTarget, effectColor, effectLabel, enchantList, enchantNames, fmtClock,
  magicLinesOf, offerState, pickableSlots, previewEnchants, shelfBooks,
} from './panelMagicUtils.js';
import { HUD_EFFECT_ICONS } from '../../../game/kesif/hudStore.js';
import { EFFECT_LIST } from '../../../game/kesif/sim/magic.js';
import { slotAriaLabel, tooltipModel, tooltipText, isUsable } from './panelUtils.js';

describe('enchantList / enchantNames', () => {
  it('ENCHANT_LIST sırasında, adıyla; geçersiz veri atılır; prototip kirletme etkisiz', () => {
    const l = enchantList({ alev: 1, keskinlik: 3, bilinmeyen: 2 });
    expect(l.map((e) => e.name)).toEqual(['Keskinlik III', 'Alev I']);
    expect(l[0].text).toMatch(/saldırı hasarı/);
    expect(enchantNames({ koruma: 2 })).toBe('Koruma II');
    expect(enchantList(null)).toEqual([]);
    expect(enchantList('x')).toEqual([]);
    expect(enchantList(JSON.parse('{"__proto__":{"keskinlik":5}}'))).toEqual([]);
  });

  it('tek seviyeli büyüde seviye yazılmaz', () => {
    expect(enchantNames({ ipek_dokunus: 1 })).toBe('İpek Dokunuş');
  });
});

describe('önizleme ve bedel', () => {
  const sword = { item: 'item:kılıç_demir', count: 1, ench: { keskinlik: 1 } };
  it('yeni / yükselir / aynı durumları', () => {
    const p = previewEnchants(sword, { enchants: { keskinlik: 3, alev: 1 } });
    const byKey = Object.fromEntries(p.map((e) => [e.key, e.state]));
    expect(byKey.keskinlik).toBe('yükselir');
    expect(byKey.alev).toBe('yeni');
    const same = previewEnchants(sword, { enchants: { keskinlik: 1 } });
    expect(same[0].state).toBe('aynı');
    expect(previewEnchants(sword, null)[0].state).toBe('aynı');
    expect(previewEnchants(null, null)).toEqual([]);
  });

  it('teklif karşılanabilirliği ve eksikler', () => {
    const o = { costDust: 8, costShard: 2 };
    expect(offerState(o, 8, 2).affordable).toBe(true);
    const s = offerState(o, 3, 0);
    expect(s.affordable).toBe(false);
    expect(s.missing).toHaveLength(2);
    expect(s.reason).toMatch(/Büyü Tozu eksik \(3\/8\)/);
    expect(s.reason).toMatch(/Kuantum Kıymığı eksik \(0\/2\)/);
    expect(offerState(null, 5, 5).affordable).toBe(false);
  });
});

describe('kitaplık göstergesi', () => {
  it('0..5+ kitaplık: kademe = kitaplık+1 (en çok V); 5 ve üstü tam çember notu', () => {
    expect(shelfBooks(0)).toMatchObject({ tier: 1, tierName: 'I', full: false });
    expect(shelfBooks(3)).toMatchObject({ tier: 4, tierName: 'IV', label: '3/5 kitaplık • Kademe IV' });
    expect(shelfBooks(3).books).toEqual(['full', 'full', 'full', 'empty', 'empty']);
    expect(shelfBooks(5)).toMatchObject({ tier: 5, full: true });
    expect(shelfBooks(5).note).toMatch(/%15/);
    expect(shelfBooks(40).label).toBe('5/5 kitaplık • Kademe V');
    expect(shelfBooks(NaN).tier).toBe(1);
    expect(shelfBooks(-3).books.every((b) => b === 'empty')).toBe(true);
  });
});

describe('seçilebilir yuvalar', () => {
  const inv = {
    selected: 1,
    slots: [
      { item: 'blok:taş', count: 4 }, { item: 'item:kazma_demir', count: 1 }, null, { item: 'item:asa_buz', count: 1 }, { item: 'item:elma', count: 2 },
    ],
    armor: [{ item: 'item:miğfer_demir', count: 1 }, null, null, null],
  };
  it('yalnız büyülenebilir eşyalar; hotbar → çanta → zırh sırası', () => {
    const l = pickableSlots(inv);
    expect(l.map((p) => p.addr)).toEqual(['s1', 's3', 'a0'].filter((a) => l.some((p) => p.addr === a)));
    expect(l.some((p) => p.addr === 's0')).toBe(false);
    expect(l.some((p) => p.addr === 's4')).toBe(false);
  });
  it('varsayılan hedef: eldeki uygunsa o, değilse ilk', () => {
    const l = pickableSlots(inv);
    expect(defaultTarget(inv, l)).toBe('s1');
    expect(defaultTarget({ ...inv, selected: 7 }, l)).toBe(l[0].addr);
    expect(defaultTarget(inv, [])).toBe(null);
    expect(pickableSlots(null)).toEqual([]);
  });
});

describe('kazan görünümü ve biçimler', () => {
  it('bos / demleniyor / hazir', () => {
    expect(brewView(null)).toBe('bos');
    expect(brewView({ cauldron: null })).toBe('bos');
    expect(brewView({ cauldron: { done: false } })).toBe('demleniyor');
    expect(brewView({ cauldron: { done: true } })).toBe('hazir');
  });
  it('süre biçimi', () => {
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(125)).toBe('2:05');
    expect(fmtClock(-4)).toBe('0:00');
    expect(fmtClock(59.6)).toBe('1:00');
  });
});

describe('durum etkisi simgeleri', () => {
  it('HUD simge listesinin her elemanı için yol ve renk vardır; sim etkilerinin simgeleri listede', () => {
    HUD_EFFECT_ICONS.forEach((k) => {
      expect(typeof EFFECT_ICON_PATHS[k], k).toBe('string');
      expect(EFFECT_COLORS[k], k).toMatch(/^#[0-9a-f]{6}$/);
    });
    EFFECT_LIST.forEach((e) => expect(HUD_EFFECT_ICONS, e.key).toContain(e.icon));
    // her simgenin yolu benzersiz: renk körlüğünde ayırt etmek için şekil
    const paths = HUD_EFFECT_ICONS.map((k) => EFFECT_ICON_PATHS[k]);
    expect(new Set(paths).size).toBe(paths.length);
    expect(effectColor('yok')).toMatch(/^#/);
  });
  it('etiket seviye ve kalan süre taşır', () => {
    expect(effectLabel({ name: 'Hız 2', level: 2, secondsLeft: 61 })).toBe('Hız II, 1:01 kaldı');
    expect(effectLabel({ name: 'Güç', level: 1, secondsLeft: 9 })).toBe('Güç, 0:09 kaldı');
    expect(effectLabel(null)).toBe('');
  });
});

describe('ipucu modeli: büyü', () => {
  it('büyülü eşya: mor satırlar, ad ve etiket; büyüsüzde boş', () => {
    const slot = { item: 'item:kılıç_demir', count: 1, dur: 200, ench: { keskinlik: 2, alev: 1 } };
    const m = tooltipModel(slot);
    expect(m.enchanted).toBe(true);
    expect(m.enchants.map((e) => e.name)).toEqual(['Keskinlik II', 'Alev I']);
    expect(tooltipText(slot)).toMatch(/büyülü: Keskinlik II ve Alev I/);
    expect(slotAriaLabel('s3', slot)).toMatch(/büyülü: Keskinlik II, Alev I/);
    const plain = tooltipModel({ item: 'item:kılıç_demir', count: 1, dur: 200 });
    expect(plain.enchanted).toBe(false);
    expect(plain.enchants).toEqual([]);
  });
  it('asa/iksir/mana kristali satırları ve "Kullan" düğmesi uygunluğu', () => {
    expect(magicLinesOf('item:asa_ates').join(' ')).toMatch(/Ateş Topu/);
    expect(tooltipModel({ item: 'item:iksir_hiz', count: 2 }).magicLines.join(' ')).toMatch(/Hız/);
    expect(isUsable({ item: 'item:iksir_hiz', count: 1 })).toBe(true);
    expect(isUsable({ item: 'item:mana_kristali', count: 1 })).toBe(true);
    expect(isUsable({ item: 'item:asa_ates', count: 1 })).toBe(false);
    expect(magicLinesOf(null)).toEqual([]);
  });
  it('bozuk ench verisi tooltipi bozmaz', () => {
    expect(() => tooltipModel({ item: 'item:kılıç_demir', count: 1, ench: 'x' })).not.toThrow();
    expect(tooltipModel({ item: 'item:kılıç_demir', count: 1, ench: { keskinlik: 'çok', ...{ alev: 99 } } }).enchants.length).toBeGreaterThanOrEqual(0);
  });
});
