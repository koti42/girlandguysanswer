import { describe, expect, it } from 'vitest';
import { syncWarmDim } from './gameWarmTiers.js';

describe('syncWarmDim — boyut değişince kademe ısınması yeniden planlanır', () => {
  const mk = () => { const w = { resets: 0, reset() { this.resets++; } }; return w; };

  it('ilk çağrı yalnız boyutu kaydeder (sıfırlamaz)', () => {
    const w = mk();
    const st = { dim: null };
    expect(syncWarmDim(w, st, 'overworld')).toBe(false);
    expect(w.resets).toBe(0);
    expect(st.dim).toBe('overworld');
  });

  it('aynı boyutta tekrar çağrı sıfırlamaz', () => {
    const w = mk();
    const st = { dim: null };
    syncWarmDim(w, st, 'overworld');
    for (let i = 0; i < 100; i++) expect(syncWarmDim(w, st, 'overworld')).toBe(false);
    expect(w.resets).toBe(0);
  });

  it('ana diyar → şehir → ana diyar: her değişimde bir kez sıfırlar', () => {
    const w = mk();
    const st = { dim: null };
    syncWarmDim(w, st, 'overworld');
    expect(syncWarmDim(w, st, 'neon')).toBe(true);
    expect(syncWarmDim(w, st, 'neon')).toBe(false);
    expect(syncWarmDim(w, st, 'overworld')).toBe(true);
    expect(w.resets).toBe(2);
  });

  it('ısıtıcı yok / bozuk girdi atmaz', () => {
    expect(syncWarmDim(null, { dim: null }, 'neon')).toBe(false);
    expect(syncWarmDim({}, { dim: 'overworld' }, 'neon')).toBe(true);
    expect(syncWarmDim(mk(), null, 'neon')).toBe(false);
  });
});
