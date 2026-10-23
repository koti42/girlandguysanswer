import { describe, expect, it } from 'vitest';
import { INTERIOR_KINDS, MOOD_HUES } from '../city/ownerData.js';
import { findBrandCollision, isSafeText } from '../city/citySafeData.js';
import {
  CATALOG, CATALOG_BY_KEY, CATALOG_FIRST_T, CATALOG_INTERACT, CATALOG_MOUNTS, CATALOG_TAGS, catalogKeysFor, getCatalogDef,
} from './propCatalog.js';
import { PROP_ALIASES, PROP_DEFS, PROP_LIST, validatePropDef } from './propDefs.js';

const FURNITURE_EXCLUDE = ['door', 'lockpad', 'clue', 'elevator_button'];

describe('propCatalog — değişmezler', () => {
  it('en az 78 yeni anahtar; sıralı t (13…); anahtarlar benzersiz ASCII snake_case ve sokak tanımlarıyla çakışmaz', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(78);
    const keys = new Set();
    CATALOG.forEach((d, i) => {
      expect(d.t).toBe(CATALOG_FIRST_T + i);
      expect(d.key).toMatch(/^[a-z][a-z0-9_]{1,31}$/);
      expect(keys.has(d.key)).toBe(false);
      keys.add(d.key);
      expect(PROP_DEFS[d.key]).toBeUndefined();
      expect(PROP_ALIASES[d.key]).toBeUndefined();
      expect(d.t).toBeGreaterThan(PROP_LIST.length);
      expect(d.model.meshKey).toBe(d.key);
    });
    expect(CATALOG_FIRST_T).toBe(PROP_LIST.length + 1);
    expect(Object.isFrozen(CATALOG)).toBe(true);
    expect(Object.isFrozen(CATALOG[0])).toBe(true);
    expect(Object.isFrozen(CATALOG[0].colliders)).toBe(true);
  });

  it('her giriş propDefs.validatePropDef değişmezlerinden geçer; boyut ≤ 3 ve 1/8 katı; colliders ≤ 4 ve ayak izi içinde', () => {
    CATALOG.forEach((d) => {
      expect(validatePropDef(d), d.key).toEqual([]);
      d.size.forEach((v) => {
        expect(v, d.key).toBeGreaterThan(0);
        expect(v, d.key).toBeLessThanOrEqual(3);
        expect(Math.abs(v * 8 - Math.round(v * 8)), d.key + ' 1/8').toBeLessThan(1e-9);
      });
      expect(d.colliders.length).toBeLessThanOrEqual(4);
      d.colliders.forEach((b) => {
        expect(b[0], d.key).toBeGreaterThanOrEqual(-d.size[0] / 2 - 1e-9);
        expect(b[3], d.key).toBeLessThanOrEqual(d.size[0] / 2 + 1e-9);
        expect(b[2], d.key).toBeGreaterThanOrEqual(-d.size[2] / 2 - 1e-9);
        expect(b[5], d.key).toBeLessThanOrEqual(d.size[2] / 2 + 1e-9);
        expect(b[4], d.key).toBeLessThanOrEqual(d.size[1] + 1e-9);
      });
    });
  });

  it('etiket, etkileşim, bağ, ışık tonu, durum/varyant sayıları geçerli', () => {
    CATALOG.forEach((d) => {
      expect(d.tags.length, d.key).toBeGreaterThan(0);
      d.tags.forEach((t) => expect(CATALOG_TAGS, d.key + ':' + t).toContain(t));
      expect(CATALOG_MOUNTS).toContain(d.mount);
      if (d.interact) {
        expect(CATALOG_INTERACT, d.key).toContain(d.interact.kind);
        expect(d.interact.kind).not.toBe('none');
        expect(d.interact.prompt.length).toBeGreaterThan(2);
        expect(d.interact.prompt.length).toBeLessThanOrEqual(40);
      }
      if (d.light) expect(MOOD_HUES, d.key).toContain(d.light.hue);
      expect(d.states).toBeGreaterThanOrEqual(1);
      expect(d.variants).toBeGreaterThanOrEqual(1);
      expect(d.variants).toBeLessThanOrEqual(8);
      expect(d.uses.length, d.key).toBeGreaterThan(0);
      d.uses.forEach((k) => expect(INTERIOR_KINDS, d.key).toContain(k));
      // duvar/tavan propu kolliderlı değildir (kapı ve gizli kapı hariç) — oda içi dolaşımı engellemesin
      if (d.mount === 'wall' || d.mount === 'ceiling' || d.mount === 'surface') expect(d.colliders.length, d.key).toBe(0);
    });
  });

  it('etiket ↔ etkileşim tutarlılığı (kapı=open, kilit=lockpad, asansör=elevator, otomat=buy, yatak/oturma=sit)', () => {
    CATALOG.forEach((d) => {
      if (d.tags.indexOf('door') >= 0) expect(d.interact && d.interact.kind, d.key).toBe('open');
      if (d.tags.indexOf('lockpad') >= 0) expect(d.interact && d.interact.kind, d.key).toBe('lockpad');
      if (d.tags.indexOf('elevator_button') >= 0) expect(d.interact && d.interact.kind, d.key).toBe('elevator');
      if (d.tags.indexOf('vending') >= 0) expect(d.interact && d.interact.kind, d.key).toBe('buy');
      if (d.tags.indexOf('sit') >= 0) expect(d.interact && d.interact.kind, d.key).toBe('sit');
      if (d.tags.indexOf('door') >= 0 || d.tags.indexOf('lockpad') >= 0 || d.tags.indexOf('elevator_button') >= 0) expect(d.tags, d.key).toContain('zorunlu');
    });
  });

  it('görev listesindeki tüm kategoriler en az bir girişle temsil edilir', () => {
    const need = [
      'bed', 'sit', 'table', 'shelf', 'screen', 'light', 'holo', 'plant', 'appliance', 'decor', 'vending', 'door', 'terminal', 'elevator_button',
      'locker', 'crate', 'art', 'instrument', 'tool', 'robot_prop', 'lockpad', 'counter', 'rug', 'pet', 'vehicle', 'medical', 'music', 'server', 'arcade',
    ];
    need.forEach((t) => expect(CATALOG.some((d) => d.tags.indexOf(t) >= 0), t).toBe(true));
    // kapı varyantları (kilit durumları): serbest/kod/kart/çözme düzenekleri var
    ['kapi', 'kapi_genis', 'gizli_kapi_raf', 'kod_paneli', 'kart_okuyucu', 'hack_terminali', 'asansor_dugmesi', 'posta_kutusu'].forEach((k) => expect(getCatalogDef(k), k).not.toBeNull());
    expect(getCatalogDef('kapi').states).toBeGreaterThanOrEqual(3);
  });

  it('her iç mekân türü: ≥ 12 katalog anahtarı, ≥ 8 mobilya anahtarı (kapı/kilit/ipucu hariç) ve tür etiketleri', () => {
    const req = {
      kapsul_daire: ['bed', 'table', 'appliance'], loft: ['sit', 'screen', 'plant'], hacker_odasi: ['server', 'screen', 'desk'],
      oyuncu_odasi: ['screen', 'sit', 'light'], ramen_bari: ['counter', 'food', 'sit'], klinik: ['medical', 'bed', 'terminal'],
      garaj_atolyesi: ['vehicle', 'tool', 'locker'], kulup: ['music', 'instrument', 'light'], market: ['shelf', 'vending', 'counter'],
      cati_bahcesi: ['plant', 'sit', 'decor'], kitap_kafe: ['shelf', 'table', 'food'], sanat_studyosu: ['art', 'decor', 'shelf'],
      robot_tamirhanesi: ['robot_prop', 'tool', 'table'], arcade: ['arcade', 'counter', 'screen'], dron_kurye: ['robot_prop', 'crate', 'counter'],
      holo_sinema: ['sit', 'screen', 'holo'],
    };
    INTERIOR_KINDS.forEach((kind) => {
      const keys = catalogKeysFor(kind);
      expect(keys.length, kind).toBeGreaterThanOrEqual(12);
      const furn = keys.filter((k) => !CATALOG_BY_KEY[k].tags.some((t) => FURNITURE_EXCLUDE.indexOf(t) >= 0));
      expect(furn.length, kind + ' mobilya').toBeGreaterThanOrEqual(8);
      req[kind].forEach((t) => expect(keys.some((k) => CATALOG_BY_KEY[k].tags.indexOf(t) >= 0), kind + ':' + t).toBe(true));
      // kapı ve kilit düzenekleri her türde
      ['kapi', 'kod_paneli', 'kart_okuyucu', 'hack_terminali'].forEach((k) => expect(keys, kind).toContain(k));
    });
  });

  it('aile dostu: ad, istem ve anahtar yasak sözcük/gerçek ad taramasından temiz', () => {
    CATALOG.forEach((d) => {
      expect(isSafeText(d.name), d.key + ' ad').toBe(true);
      expect(isSafeText(d.key.replace(/_/g, ' ')), d.key + ' anahtar').toBe(true);
      if (d.interact) expect(isSafeText(d.interact.prompt), d.key + ' istem').toBe(true);
      expect(findBrandCollision(d.name), d.key).toBeNull();
    });
  });

  it('getCatalogDef güvenli (prototip/geçersiz anahtar → null); anahtar listesi sıralı', () => {
    expect(getCatalogDef('constructor')).toBeNull();
    expect(getCatalogDef('__proto__')).toBeNull();
    expect(getCatalogDef(5)).toBeNull();
    expect(getCatalogDef(undefined)).toBeNull();
    expect(getCatalogDef('masa')).toBe(CATALOG_BY_KEY.masa);
    expect(catalogKeysFor('olmayan')).toEqual([]);
  });
});
