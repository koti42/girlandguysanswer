import { afterEach, describe, expect, it } from 'vitest';
import { INTERIOR_KINDS as OWNER_KINDS } from '../ownerData.js';
import {
  INTERIOR_KINDS, getInterior, isInteriorImpl, listInteriors, registerInterior, unregisterInterior,
} from './registry.js';
import * as index from './index.js';

const fake = (kind) => ({
  kind, name: 'Sahte ' + kind, footprint: () => ({ w: 8, d: 6, h: 4 }), plan: () => null, emit: () => {},
});

describe('interior/registry', () => {
  afterEach(() => {
    unregisterInterior('test_tur');
    unregisterInterior('test_iki');
  });

  it('16 tür ownerData ile aynı sıra ve içerikte', () => {
    expect(INTERIOR_KINDS.length).toBe(16);
    expect(Array.from(INTERIOR_KINDS)).toEqual(Array.from(OWNER_KINDS));
    expect(Object.isFrozen(INTERIOR_KINDS)).toBe(true);
    expect(index.INTERIOR_KINDS).toBe(INTERIOR_KINDS);
  });

  it('kaydet / al / değiştir / sil', () => {
    expect(getInterior('test_tur')).toBeNull();
    const a = registerInterior('test_tur', fake('test_tur'));
    expect(getInterior('test_tur')).toBe(a);
    expect(a.kind).toBe('test_tur');
    expect(Object.isFrozen(a)).toBe(true);
    expect(listInteriors()).toContain('test_tur');
    const b = registerInterior('test_tur', { ...fake('test_tur'), name: 'Yeni' });
    expect(getInterior('test_tur')).toBe(b);
    expect(b.name).toBe('Yeni');
    expect(unregisterInterior('test_tur')).toBe(true);
    expect(unregisterInterior('test_tur')).toBe(false);
    expect(getInterior('test_tur')).toBeNull();
  });

  it('geçersiz tür/impl reddedilir, prototip anahtarları sızmaz', () => {
    expect(() => registerInterior('', fake('x'))).toThrow();
    expect(() => registerInterior('Büyük', fake('Büyük'))).toThrow();
    expect(() => registerInterior('__proto__', fake('__proto__'))).toThrow();
    expect(() => registerInterior('test_tur', {})).toThrow();
    expect(() => registerInterior('test_tur', { ...fake('baska') })).toThrow(/uyuşmuyor/);
    expect(() => registerInterior(5, fake('test_tur'))).toThrow();
    expect(getInterior('constructor')).toBeNull();
    expect(getInterior('toString')).toBeNull();
    expect(getInterior(undefined)).toBeNull();
    expect(getInterior(null)).toBeNull();
    expect(isInteriorImpl(fake('a'))).toBe(true);
    expect(isInteriorImpl(null)).toBe(false);
    expect(isInteriorImpl({ plan() {}, emit() {} })).toBe(false);
  });

  it('impl.kind yoksa anahtar kullanılır; ad varsayılanı tür adı', () => {
    const impl = { footprint: () => ({ w: 1, d: 1, h: 3 }), plan: () => null, emit: () => {} };
    const r = registerInterior('test_iki', impl);
    expect(r.kind).toBe('test_iki');
    expect(r.name).toBe('test_iki');
  });

  it('index.getInterior kayıt defterini görür; otomatik keşif kayıtlı türü ezmez', () => {
    const a = registerInterior('test_tur', fake('test_tur'));
    expect(index.getInterior('test_tur')).toBe(a);
    expect(index.listInteriors()).toContain('test_tur');
  });
});
