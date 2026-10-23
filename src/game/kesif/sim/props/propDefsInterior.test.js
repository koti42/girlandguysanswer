import { describe, expect, it } from 'vitest';
import { CATALOG, CATALOG_BY_KEY, CATALOG_FIRST_T } from './propCatalog.js';
import {
  PROP_ALL, PROP_BY_T, PROP_DEFS, PROP_LIST, getPropDef, validatePropDef,
} from './propDefs.js';
import { INTERIOR_BY_KEY, INTERIOR_BY_T, INTERIOR_DEFS, interiorDef } from './propDefsInterior.js';
import { DEFAULT_CULL, EXTRA } from './propDefsExtra.js';
import { getPropBehavior } from './propBehaviors.js';
import './propWorld.js';
import { isSafeText } from '../city/citySafeData.js';
import { PROP_AMBIENT_SOUNDS, PROP_SOUNDS } from '../../audioRecipesProps.js';

describe('iç mekân tanımları — katalog eşleşmesi', () => {
  it('her katalog anahtarının tanımı var, her tanımın katalog girişi var (bire bir), t sıralı ve benzersiz', () => {
    expect(INTERIOR_DEFS.length).toBe(CATALOG.length);
    expect(INTERIOR_DEFS.length).toBeGreaterThanOrEqual(101);
    CATALOG.forEach((c, i) => {
      const d = INTERIOR_DEFS[i];
      expect(d.key).toBe(c.key);
      expect(d.t).toBe(c.t);
      expect(d.t).toBe(CATALOG_FIRST_T + i);
      expect(INTERIOR_BY_KEY[c.key]).toBe(d);
      expect(INTERIOR_BY_T[c.t]).toBe(d);
    });
    INTERIOR_DEFS.forEach((d) => expect(CATALOG_BY_KEY[d.key], d.key).toBeTruthy());
    expect(new Set(INTERIOR_DEFS.map((d) => d.t)).size).toBe(INTERIOR_DEFS.length);
    expect(new Set(INTERIOR_DEFS.map((d) => d.key)).size).toBe(INTERIOR_DEFS.length);
  });

  it('boyut, çarpışma kutuları, etiketler ve etkileşim KATALOGLA AYNEN (iç mekân planlayıcısı aynı kutuları kullanır)', () => {
    CATALOG.forEach((c) => {
      const d = INTERIOR_BY_KEY[c.key];
      expect(d.size).toEqual(c.size);
      expect(d.colliders).toEqual(c.colliders);
      expect(d.tags).toEqual(c.tags);
      expect(d.states).toBe(c.states);
      expect(d.emissive).toBe(c.emissive);
      expect(d.mount).toBe(c.mount);
      expect(d.variants).toBe(c.variants);
      expect(d.interact).toEqual(c.interact);
      expect(d.holo).toBe(c.holo);
      expect(d.light).toEqual(c.light);
    });
  });

  it('PROP_ALL/PROP_BY_T/getPropDef sokak + iç mekânı kapsar; PROP_LIST/PROP_DEFS yalnız 12 sokak tanımı kalır', () => {
    expect(PROP_LIST.length).toBe(12);
    expect(Object.keys(PROP_DEFS).length).toBe(12);
    expect(PROP_ALL.length).toBe(12 + INTERIOR_DEFS.length);
    INTERIOR_DEFS.forEach((d) => {
      expect(PROP_BY_T[d.t]).toBe(d);
      expect(getPropDef(d.t)).toBe(d);
      expect(getPropDef(d.key)).toBe(d);
      expect(PROP_DEFS[d.key]).toBeUndefined();
    });
    ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'masa_yok', 0, 9999, -3, NaN, null, undefined].forEach((k) => expect(interiorDef(k)).toBeNull());
  });

  it('her tanım validatePropDef değişmezlerinden geçer, donuktur, sign tanımı sokak kuralından ayrıdır (isign)', () => {
    INTERIOR_DEFS.forEach((d) => {
      expect(validatePropDef(d), d.key).toEqual([]);
      expect(Object.isFrozen(d), d.key).toBe(true);
      expect(d.interior).toBe(true);
      expect(d.catalog).toBe(true);
      expect(d.sign).toBeUndefined();
      expect(d.cull).toBeGreaterThanOrEqual(20);
      expect(d.cull).toBeLessThanOrEqual(DEFAULT_CULL + 20);
      if (CATALOG_BY_KEY[d.key].sign) expect(d.isign, d.key).toBeTruthy();
      if (d.trigger) {
        expect(d.trigger[3]).toBeGreaterThan(d.trigger[0]);
        expect(d.trigger[5]).toBeGreaterThan(d.trigger[2]);
      }
    });
  });
});

describe('iç mekân tanımları — işlevsel ekler', () => {
  it('EXTRA yalnız bilinen anahtarlara yazılır; her etkileşim türünün davranışı kayıtlı', () => {
    Object.keys(EXTRA).forEach((k) => expect(INTERIOR_BY_KEY[k], k).toBeTruthy());
    INTERIOR_DEFS.forEach((d) => {
      if (d.interact) expect(getPropBehavior(d.interact.kind), d.key + ':' + d.interact.kind).not.toBeNull();
    });
    ['sit', 'open', 'toggle', 'read', 'buy', 'lockpad', 'elevator', 'dialog', 'pickup'].forEach((k) => expect(getPropBehavior(k), k).not.toBeNull());
  });

  it('oturma tanımları: etkileşim sit ⇔ seat; yükseklik/göz/ayak izi mantıklı; kapsül kapağı durumlu', () => {
    INTERIOR_DEFS.forEach((d) => {
      const sit = !!d.interact && d.interact.kind === 'sit';
      expect(!!d.seat, d.key).toBe(sit);
      if (!sit) return;
      expect(['sit', 'lie']).toContain(d.seat.pose);
      expect(d.seat.h).toBeGreaterThan(0.2);
      expect(d.seat.h).toBeLessThanOrEqual(d.size[1] + 0.01);
      expect(d.seat.eye).toBeGreaterThan(0.2);
      expect(d.seat.eye).toBeLessThan(1.0);
      d.seat.spots.forEach((s) => expect(Math.abs(s)).toBeLessThanOrEqual(d.size[0] / 2));
      if (d.seat.closes) expect(d.states).toBeGreaterThan(1);
    });
    expect(INTERIOR_BY_KEY.kapsul_yatak.seat.closes).toBe(true);
    expect(INTERIOR_BY_KEY.kanepe.seat.spots.length).toBe(3);
  });

  it('açılır/kapanır tanımlar: openFree çarpışmalıdır ve durumlu; güç maskeleri durum sayısıyla uyumlu; zamanlı tanımlar transient', () => {
    INTERIOR_DEFS.forEach((d) => {
      if (d.openFree) {
        expect(d.colliders.length, d.key).toBeGreaterThan(0);
        expect(d.states, d.key).toBeGreaterThan(1);
      }
      if (d.power !== undefined) {
        expect(d.power).toBeGreaterThan(0);
        expect(d.power, d.key).toBeLessThan(1 << d.states);
      }
      if (d.mode === 'timed') {
        expect(d.transient, d.key).toBe(true);
        expect(d.timed).toBeGreaterThan(0);
        expect(d.states).toBeGreaterThan(1);
      }
      if (d.transient) expect(d.mode, d.key).toBe('timed');
    });
    ['kapi', 'kapi_genis', 'gizli_kapi_raf', 'katlanir_masa'].forEach((k) => expect(INTERIOR_BY_KEY[k].openFree, k).toBe(true));
    expect(INTERIOR_BY_KEY.kapi.states).toBeGreaterThanOrEqual(3);
  });

  it('ortam sesleri tanımlı ses adlarıdır; menzil/aralık sınırlı', () => {
    const names = PROP_SOUNDS.map((m) => m[0]);
    INTERIOR_DEFS.forEach((d) => {
      if (!d.amb) return;
      expect(names, d.key).toContain(d.amb.sound);
      expect(PROP_AMBIENT_SOUNDS, d.key).toContain(d.amb.sound);
      expect(d.amb.range).toBeGreaterThan(3);
      expect(d.amb.range).toBeLessThanOrEqual(12);
      expect(d.amb.period).toBeGreaterThan(1);
      if (d.amb.on !== undefined) expect(d.amb.on).toBeLessThan(d.states);
    });
    ['buzdolabi', 'arcade_makinesi', 'akvaryum'].forEach((k) => expect(INTERIOR_BY_KEY[k].amb, k).toBeTruthy());
  });

  it('kip alanı: etkileşim türüyle uyumlu', () => {
    const modes = {
      open: ['door', 'secret', 'cabinet', 'fridge'], toggle: ['fold', 'power', 'timed', 'cycle'],
      read: ['kitap', 'vitrin', 'sunucu', 'bilgi', 'sign', 'sanat', 'posta', 'clue'], dialog: ['owner', 'pet'], buy: ['counter', 'vending'],
      lockpad: ['pad'], elevator: ['elevator'],
    };
    INTERIOR_DEFS.forEach((d) => {
      if (!d.interact) return;
      const allowed = modes[d.interact.kind];
      if (allowed) expect(allowed, d.key + ' ' + d.mode).toContain(d.mode);
    });
  });

  it('adlar ve istemler güvenli Türkçe', () => {
    INTERIOR_DEFS.forEach((d) => {
      expect(isSafeText(d.name)).toBe(true);
      if (d.interact) expect(isSafeText(d.interact.prompt)).toBe(true);
    });
  });
});
