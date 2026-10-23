/*
 * skins.js testleri (saf, node): 29 Keşif görünümünün hepsi geçerli parametreye çözülür; bilinmeyen/bozuk her şey sessizce null;
 * low kademe ve kısıtlı harekette ton döngüsü kapalı; NaN yok; renk geçerli; portal çifti ayırt edilebilir; spec değişmez.
 */
import { describe, expect, it } from 'vitest';
import { KESIF } from '../../shop/designs/kesif.js';
import { itemSpec } from './itemPalette.js';
import { ITEM_LIST } from '../sim/items.js';
import {
  SKIN_SLOTS, animAllowed, applySkinToSpec, clearSkinCaches, distinguishable, emptySkinSet, hueOf, hueRotate, lerpRgb, lstar, resolveSkin, resolveSkinSet,
  skinForKind, skinKeys, validateSkinData,
} from './skins.js';

const isRgb = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffff;
function walk(v, fn) {
  if (Array.isArray(v)) v.forEach((x) => walk(x, fn));
  else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], fn));
  else fn(v);
}

describe('skins: kayıt ve çözümleme', () => {
  it('29 Keşif öğesinin HEPSİ kendi yuvasında geçerli, dondurulmuş parametreye çözülür', () => {
    expect(KESIF).toHaveLength(29);
    expect(skinKeys()).toHaveLength(29);
    KESIF.forEach((d) => {
      expect(SKIN_SLOTS, d.id).toContain(d.kind);
      const sk = resolveSkin(d.kind, d.id);
      expect(sk, d.id).not.toBeNull();
      expect(Object.isFrozen(sk), d.id).toBe(true);
      expect(sk.slot).toBe(d.kind);
      expect(sk.key).toBe(d.id);
      expect(sk.n).toBeGreaterThan(0);
      // aynı çağrı aynı nesne (önbellekli)
      expect(resolveSkin(d.kind, d.id)).toBe(sk);
    });
    // yuva başına sayılar (6/6/4/4/6/3)
    const per = {};
    KESIF.forEach((d) => { per[d.kind] = (per[d.kind] || 0) + 1; });
    expect(per).toEqual({ portal: 6, alet: 6, asa: 4, jet: 4, arac: 6, gecis: 3 });
  });

  it('renk alanları 0xRRGGBB tamsayı; hiçbir alan NaN/undefined/Infinity değil', () => {
    KESIF.forEach((d) => {
      const sk = resolveSkin(d.kind, d.id);
      walk(sk, (v) => {
        if (typeof v === 'number') expect(Number.isFinite(v), d.id).toBe(true);
        expect(v, d.id).not.toBeUndefined();
      });
      if (d.kind === 'portal') [sk.body, sk.trim, sk.a.c, sk.a.c2, sk.b.c, sk.b.c2].forEach((c) => expect(isRgb(c), d.id).toBe(true));
      if (d.kind === 'alet') ['head', 'light', 'dark', 'edge', 'handle', 'handleDark', 'wrap'].forEach((k) => expect(isRgb(sk.palette[k]), d.id + k).toBe(true));
      if (d.kind === 'asa') expect(isRgb(sk.crystal)).toBe(true);
      if (d.kind === 'jet') { sk.flame.forEach((c) => expect(isRgb(c)).toBe(true)); expect(isRgb(sk.smoke)).toBe(true); }
      if (d.kind === 'arac') { [sk.body, sk.accent, sk.neon].forEach((c) => expect(isRgb(c)).toBe(true)); expect([0, 1, 2]).toContain(sk.under); expect([0, 1, 2, 3]).toContain(sk.wheels); }
      if (d.kind === 'gecis') sk.ring.forEach((c) => expect(isRgb(c)).toBe(true));
    });
  });

  it('bilinmeyen anahtar, yanlış yuva, bozuk tür ve bayat girdi → null (sessiz, istisna yok)', () => {
    const bad = [undefined, null, 0, 1, true, {}, [], 'x', '', 'portal:yok', 'zzz:abc', '__proto__', 'constructor', 'toString', 'portal:nane-ferahi\u0000'];
    bad.forEach((k) => SKIN_SLOTS.forEach((s) => expect(resolveSkin(s, k)).toBeNull()));
    // doğru anahtar, yanlış yuva
    expect(resolveSkin('alet', 'portal:nane-ferahi')).toBeNull();
    expect(resolveSkin('portal', 'jet:gok-mavisi')).toBeNull();
    // bozuk yuva adları
    ['', 'sword', '__proto__', 'constructor', undefined, null, 5].forEach((s) => expect(resolveSkin(s, 'portal:nane-ferahi')).toBeNull());
  });

  it('bozuk skin verisi her yuvada null (hex, aralık, tür, eksik alan)', () => {
    const cases = {
      portal: [null, {}, { body: '#FFF', trim: '#000000', a: { c: '#000000', c2: '#000000' }, b: { c: '#FFFFFF', c2: '#000000' } },
        { body: '#000000', trim: '#000000', a: null, b: { c: '#FFFFFF', c2: '#000000' } }, 'x', 3],
      alet: [null, {}, { palette: null }, { palette: { head: 'kırmızı' } },
        { palette: { head: '#000000', light: '#000000', dark: '#000000', edge: '#000000', handle: '#000000', handleDark: '#000000', wrap: '#000000', glow: null, rough: 2, metal: 0 } },
        { palette: { head: '#000000', light: '#000000', dark: '#000000', edge: '#000000', handle: '#000000', handleDark: '#000000', wrap: '#000000', glow: '#GGGGGG', rough: 0.5, metal: 0 } },
        { palette: { head: '#000000', light: '#000000', dark: '#000000', edge: '#000000', handle: '#000000', handleDark: '#000000', wrap: '#000000', glow: null, rough: NaN, metal: 0 } }],
      asa: [null, {}, { crystal: 'x' }, { crystal: '#112233', ring: 12 }, { crystal: 0x112233 }],
      jet: [null, {}, { flame: ['#000000'], smoke: '#000000' }, { flame: ['#000000', '#000000', 'q'], smoke: '#000000' }, { flame: ['#000000', '#000000', '#000000'], smoke: 5 }],
      arac: [null, {}, { body: '#000000', accent: '#000000', neon: '#000000', under: 3, wheels: 0 }, { body: '#000000', accent: '#000000', neon: '#000000', under: 0, wheels: 1.5 },
        { body: '#000000', accent: '#000000', neon: '#000000', under: 0, wheels: 0, nitro: ['#000000'] }, { body: '#000000', accent: '#000000', neon: '#000000', under: 0, wheels: 0, rim: 'x' }],
      gecis: [null, {}, { ring: ['#000000'] }, { ring: ['#000000', 'x'] }, { ring: ['#000000', '#FFFFFF'], spark: 'x' }],
    };
    Object.keys(cases).forEach((slot) => cases[slot].forEach((c, i) => expect(validateSkinData(slot, c), slot + '#' + i).toBeNull()));
    // doğru veri kabul
    expect(validateSkinData('gecis', { ring: ['#000000', '#FFFFFF'], spark: '#ABCDEF' })).not.toBeNull();
    expect(validateSkinData('nope', {})).toBeNull();
    expect(validateSkinData('__proto__', {})).toBeNull();
  });

  it('portal çifti: renk körü için ayırt edilebilir olmalı; 6 portal görünümünün hepsi geçer, ayırt edilemeyen çift reddedilir', () => {
    KESIF.filter((d) => d.kind === 'portal').forEach((d) => {
      const sk = resolveSkin('portal', d.id);
      expect(distinguishable(sk.a.c, sk.b.c), d.id).toBe(true);
    });
    const same = { body: '#FFFFFF', trim: '#000000', a: { c: '#3A9BFF', c2: '#0A2A78' }, b: { c: '#3C9DFF', c2: '#0A2A78' } };
    expect(validateSkinData('portal', same)).toBeNull();
    // aynı parlaklık ama farklı ton → kabul; farklı parlaklık aynı ton → kabul
    expect(validateSkinData('portal', { ...same, b: { c: '#FF9A2E', c2: '#7A2A00' } })).not.toBeNull();
    expect(validateSkinData('portal', { ...same, b: { c: '#0C1E40', c2: '#000000' } })).not.toBeNull();
  });
});

describe('skins: ortam kuralları (low kademe, kısıtlı hareket)', () => {
  const lo = { portal: 'portal:nane-ferahi', alet: 'alet:buz-mavisi', asa: 'asa:gokkusagi-isigi', jet: 'jet:yildiz-izi', arac: 'arac:holo-kristal', gecis: 'gecis:neon-dalga' };

  it('ton döngüsü/nabız yalnız low-dışı kademede ve kısıtlı hareket kapalıyken', () => {
    expect(animAllowed('high', false)).toBe(true);
    expect(animAllowed('medium', false)).toBe(true);
    expect(animAllowed('low', false)).toBe(false);
    expect(animAllowed('high', true)).toBe(false);
    expect(animAllowed('medium', true)).toBe(false);
    expect(animAllowed(undefined, false)).toBe(true);
    expect(resolveSkinSet(lo, { tier: 'low' }).anim).toBe(false);
    expect(resolveSkinSet(lo, { tier: 'high', reduced: true }).anim).toBe(false);
    expect(resolveSkinSet(lo, { tier: 'high' }).anim).toBe(true);
    // anim farkı önbellek anahtarına yansır (model yeniden kurulsun)
    expect(resolveSkinSet(lo, { tier: 'high' }).key).not.toBe(resolveSkinSet(lo, { tier: 'low' }).key);
    // low/kısıtlı hareketin kendi arasında aynı anahtar
    expect(resolveSkinSet(lo, { tier: 'low' }).key).toBe(resolveSkinSet(lo, { tier: 'high', reduced: true }).key);
  });

  it('küme: 6 yuva, donmuş, boş/bozuk girdi → boş küme (key "")', () => {
    const s = resolveSkinSet(lo, { tier: 'high' });
    expect(Object.isFrozen(s)).toBe(true);
    SKIN_SLOTS.forEach((k) => expect(s[k]).not.toBeNull());
    [undefined, null, 5, 'x', [], {}, { portal: 1 }, { loadout: null }, { portal: 'yok:yok' }].forEach((x) => {
      const e = resolveSkinSet(x, { tier: 'high' });
      expect(e.key).toBe('');
      SKIN_SLOTS.forEach((k) => expect(e[k]).toBeNull());
    });
    expect(resolveSkinSet({ loadout: lo }, { tier: 'high' }).key).toBe(s.key); // zarf kabul
    expect(emptySkinSet().key).toBe('');
    expect(resolveSkinSet(lo).anim).toBe(true); // env yok → yüksek kabul
  });

  it('kısmi yük: yalnız geçerli yuvalar dolar', () => {
    const s = resolveSkinSet({ portal: 'portal:nane-ferahi', alet: 'bozuk', jet: 'portal:nane-ferahi' }, { tier: 'high' });
    expect(s.portal.key).toBe('portal:nane-ferahi');
    expect(s.alet).toBeNull();
    expect(s.jet).toBeNull();
  });
});

describe('skins: eşya tarifine uygulama', () => {
  const find = (kind) => ITEM_LIST.map((i) => itemSpec(i)).filter((s) => s.kind === kind);

  it('önbellekli itemSpec nesnesi DEĞİŞMEZ; skin uygulanan yeni, donmuş ve aynı (ck) çağrıda aynı nesne', () => {
    const sk = resolveSkin('alet', 'alet:buz-mavisi');
    const base = find('pick')[0];
    const before = JSON.stringify(base);
    const out = applySkinToSpec(base, sk);
    expect(out).not.toBe(base);
    expect(JSON.stringify(base)).toBe(before);
    expect(Object.isFrozen(out)).toBe(true);
    expect(out.palette).toBe(sk.palette);
    expect(out.skin).toBe(sk);
    expect(applySkinToSpec(base, sk)).toBe(out);
    expect(Object.isFrozen(base)).toBe(true);
  });

  it('yalnız portal tabancası, kazma/balta/kürek, asa ve jetpack skinlenir; kılıç/yay/ışın tüfeği/kalkan HİÇ', () => {
    const set = resolveSkinSet({ portal: 'portal:nane-ferahi', alet: 'alet:buz-mavisi', asa: 'asa:mercan', jet: 'jet:gok-mavisi' }, { tier: 'high' });
    ['portalgun', 'pick', 'axe', 'shovel', 'staff', 'jetpack'].forEach((k) => {
      const spec = find(k)[0];
      expect(spec, k).toBeTruthy();
      const sk = skinForKind(set, k);
      expect(sk, k).not.toBeNull();
      expect(applySkinToSpec(spec, sk), k).not.toBe(spec);
    });
    ['sword', 'bow', 'gun', 'shield', 'torch', 'block', 'flat', 'hook'].forEach((k) => {
      const spec = find(k)[0];
      if (!spec) return;
      expect(skinForKind(set, k), k).toBeNull();
      // yanlış yuvadan zorla verilse bile aynı spec döner
      expect(applySkinToSpec(spec, set.alet), k).toBe(spec);
    });
    // yuva/tür uyumsuzluğu: portal skin'i kazmaya uygulanmaz
    expect(applySkinToSpec(find('pick')[0], set.portal)).toBe(find('pick')[0]);
    expect(applySkinToSpec(find('pick')[0], null)).toBe(find('pick')[0]);
    expect(applySkinToSpec(null, set.alet)).toBeNull();
  });

  it('asa: kristal rengi; jetpack: tank rengi spec.color olur', () => {
    const a = applySkinToSpec(find('staff')[0], resolveSkin('asa', 'asa:mercan'));
    expect(a.color).toBe(resolveSkin('asa', 'asa:mercan').crystal);
    const j = applySkinToSpec(find('jetpack')[0], resolveSkin('jet', 'jet:gok-mavisi'));
    expect(j.color).toBe(resolveSkin('jet', 'jet:gok-mavisi').tank);
  });

  it('önbellek sınırlı: 29 skin × tüm eşyalar uygulandıktan sonra da çalışır (taşınca temizlenir)', () => {
    clearSkinCaches();
    const specs = ITEM_LIST.map((i) => itemSpec(i));
    for (let r = 0; r < 3; r++) {
      KESIF.forEach((d) => {
        const sk = resolveSkin(d.kind, d.id);
        specs.forEach((s) => { const o = applySkinToSpec(s, sk); expect(o).toBeTruthy(); });
      });
    }
  });
});

describe('skins: renk yardımcıları', () => {
  it('hueRotate/lerpRgb/lstar/hueOf sonlu ve aralıkta; turn 0 ve 1 ≈ aynı', () => {
    const cols = [0x000000, 0xffffff, 0x808080, 0xff0000, 0x00ff00, 0x0000ff, 0x3a9bff, 0xffe27a, 0x123456];
    cols.forEach((c) => {
      [-2.5, -1, 0, 0.25, 0.5, 1, 7.3].forEach((t) => {
        const r = hueRotate(c, t);
        expect(isRgb(r)).toBe(true);
      });
      expect(hueRotate(c, 0)).toBe(c);
      const full = hueRotate(c, 1);
      [16, 8, 0].forEach((sh) => expect(Math.abs(((full >> sh) & 255) - ((c >> sh) & 255))).toBeLessThanOrEqual(1));
      expect(lstar(c)).toBeGreaterThanOrEqual(-0.001);
      expect(lstar(c)).toBeLessThanOrEqual(100.001);
      const h = hueOf(c);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360.001);
      expect(lerpRgb(c, 0xffffff, 0)).toBe(c);
      expect(lerpRgb(c, 0xffffff, 1)).toBe(0xffffff);
      expect(isRgb(lerpRgb(c, 0x000000, 0.37))).toBe(true);
      expect(lerpRgb(c, 0x000000, -5)).toBe(c);
      expect(lerpRgb(c, 0x000000, 9)).toBe(0x000000);
    });
    expect(hueOf(0xff0000)).toBeCloseTo(0, 5);
    expect(hueOf(0x00ff00)).toBeCloseTo(120, 5);
    expect(hueOf(0x0000ff)).toBeCloseTo(240, 5);
    expect(lstar(0xffffff)).toBeCloseTo(100, 0);
  });
});
