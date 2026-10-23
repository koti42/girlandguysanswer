import { describe, expect, it } from 'vitest';
import { createFloaterSync, createFreeList, createKeyedSlots } from './mobsPool.js';

describe('createKeyedSlots', () => {
  it('yeni anahtar yuva alır (fresh), tekrar aynı yuvayı verir, görülmeyen serbest kalır', () => {
    const ks = createKeyedSlots(3, 2);
    const a = { n: 'a' };
    const b = { n: 'b' };
    ks.begin();
    const sa = ks.use(a, 0);
    const sb = ks.use(b, 0);
    expect(sa.fresh).toBe(true);
    expect(sb.idx).not.toBe(sa.idx);
    ks.end();
    expect(ks.active).toBe(2);
    ks.begin();
    const sa2 = ks.use(a, 0);
    expect(sa2).toBe(sa);
    expect(sa2.fresh).toBe(false);
    const freed = [];
    ks.end((s) => freed.push(s.src));
    expect(freed).toEqual([b]);
    expect(ks.active).toBe(1);
    expect(ks.has(b, 0)).toBe(false);
    expect(ks.has(a, 0)).toBe(true);
  });

  it('alt yuva: aynı nesne iki ayrı yuva; dolu havuz null döner; yuva yeniden kullanılır', () => {
    const ks = createKeyedSlots(2, 2);
    const h = {};
    ks.begin();
    const s0 = ks.use(h, 0);
    const s1 = ks.use(h, 1);
    expect(s0.idx).not.toBe(s1.idx);
    expect(ks.use({}, 0)).toBeNull();
    ks.end();
    ks.begin();
    ks.use(h, 0);
    const freed = [];
    ks.end((s) => freed.push(s.idx));
    expect(freed).toEqual([s1.idx]);
    ks.begin();
    const x = ks.use({}, 1);
    expect(x.idx).toBe(s1.idx);
    expect(x.fresh).toBe(true);
    ks.end();
    ks.releaseAll();
    expect(ks.active).toBe(0);
  });
});

describe('createFloaterSync', () => {
  const num = (text, t, kind) => ({
    text, t: t || 0, kind: kind || 'hit', life: 1,
  });

  it('yeni sayılar yuva alır; fresh yalnızca ilk karede', () => {
    const sync = createFloaterSync(4);
    const list = [num('3'), num('7', 0, 'crit')];
    expect(sync.update(list)).toBe(2);
    const fresh = sync.slots.filter((s) => s.used && s.fresh);
    expect(fresh).toHaveLength(2);
    list[0].t = 0.1;
    list[1].t = 0.1;
    sync.update(list);
    expect(sync.slots.filter((s) => s.fresh)).toHaveLength(0);
  });

  it('biten sayı yuvasını bırakır; en yeniler öncelikli (yuva az)', () => {
    const sync = createFloaterSync(2);
    const list = [num('1'), num('2'), num('3'), num('4')];
    sync.update(list);
    const texts = sync.slots.filter((s) => s.used).map((s) => s.src.text).sort();
    expect(texts).toEqual(['3', '4']);
    list.splice(2, 2); // 3,4 bitti
    sync.update(list);
    expect(sync.slots.filter((s) => s.used).map((s) => s.src.text).sort()).toEqual(['1', '2']);
  });

  it('yeniden kullanılan nesne (t geri sarar) ya da metni değişen yeniden çizilir', () => {
    const sync = createFloaterSync(3);
    const n = num('5', 0.5);
    sync.update([n]);
    sync.update([n]);
    expect(sync.slots[0].fresh).toBe(false);
    n.t = 0;
    sync.update([n]);
    expect(sync.slots.find((s) => s.used).fresh).toBe(true);
    n.text = '9';
    sync.update([n]);
    expect(sync.slots.find((s) => s.used).fresh).toBe(true);
    sync.clear();
    expect(sync.active).toBe(0);
  });
});

describe('createFreeList', () => {
  it('havuzdan al/geri ver, kapasite aşımı reddedilir', () => {
    let made = 0;
    const fl = createFreeList(() => ({ id: ++made }), 2);
    const a = fl.acquire();
    const b = fl.acquire();
    const c = fl.acquire();
    expect(made).toBe(3);
    expect(fl.release(a)).toBe(true);
    expect(fl.release(b)).toBe(true);
    expect(fl.release(c)).toBe(false);
    expect(fl.size).toBe(2);
    expect(fl.acquire()).toBe(b);
    const seen = [];
    fl.drain((x) => seen.push(x));
    expect(seen).toEqual([a]);
  });
});
