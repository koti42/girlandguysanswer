import { beforeAll, describe, expect, it } from 'vitest';
import { makeTestG } from './sessionTestKit.js';
import { createHudAssembler } from './sessionHud.js';
import { createBannerQueue, createHintQueue } from './sessionBanner.js';
import { sanitizeHud } from '../hudStore.js';

function clock() {
  const c = { t: 5000, now: () => c.t, adv(ms) { c.t += ms; } };
  return c;
}

function rig(G, extra) {
  const c = clock();
  const banners = createBannerQueue({ now: c.now, gapMs: 0 });
  const hints = createHintQueue({ now: c.now });
  const calls = [];
  const asm = createHudAssembler(G, Object.assign({
    banners, hints, now: c.now, epoch: () => 1700000000000 + c.t, iconFor: (k) => { calls.push(k); return k === 'item:yok' ? '' : 'data:image/png;base64,' + k; },
  }, extra || {}));
  return {
    c, banners, hints, asm, calls,
  };
}

function insaG() {
  const G = makeTestG({ mode: 'insa', base: 'düz' });
  G.worldReady = true;
  return G;
}

describe('hotbar simgeleri', () => {
  it('simge tembel üretilir, önbellekten gelir, öğe gidince silinir', () => {
    const G = insaG();
    const {
      asm, calls,
    } = rig(G);
    G.hud.hotbar[0].item = 'blok:taş';
    G.hud.hotbar[0].count = 3;
    G.hud.hotbar[2].item = 'item:yok';
    G.hud.hotbar[2].count = 1;
    asm.frame(0.016);
    asm.frame(0.016);
    asm.frame(0.016);
    expect(G.hud.hotbar[0].icon).toBe('data:image/png;base64,blok:taş');
    expect(G.hud.hotbar[2].icon).toBeUndefined(); // simge üretilemedi
    expect(calls.filter((k) => k === 'blok:taş')).toHaveLength(1);
    G.hud.hotbar[0].item = null;
    G.hud.hotbar[0].count = 0;
    asm.frame(0.016);
    expect(G.hud.hotbar[0].icon).toBeUndefined();
  });

  it('hudStore.sanitizeHud simgeyi kabul eder (veri URL\'si)', () => {
    const G = insaG();
    const { asm } = rig(G);
    G.hud.hotbar[1].item = 'blok:toprak';
    G.hud.hotbar[1].count = 5;
    asm.frame(0.016);
    const clean = sanitizeHud(G.hud);
    expect(clean.hotbar[1].icon).toBe('data:image/png;base64,blok:toprak');
  });

  it('simge işlevi hata verirse çökmez', () => {
    const G = insaG();
    const { asm } = rig(G, { iconFor: () => { throw new Error('x'); } });
    G.hud.hotbar[0].item = 'blok:taş';
    G.hud.hotbar[0].count = 1;
    expect(() => asm.frame(0.016)).not.toThrow();
    expect(G.hud.hotbar[0].icon).toBeUndefined();
  });

  it('setIconFn önbelleği sıfırlar', () => {
    const G = insaG();
    const { asm } = rig(G);
    G.hud.hotbar[0].item = 'blok:taş';
    G.hud.hotbar[0].count = 1;
    asm.frame(0.016);
    asm.setIconFn(() => 'data:image/png;base64,YENI');
    asm.frame(0.016);
    expect(G.hud.hotbar[0].icon).toBe('data:image/png;base64,YENI');
  });
});

describe('boss yedeği', () => {
  it('em.bossHud özetini yazar, boss bitince kaldırır; başka sistemin nesnesine dokunmaz', () => {
    const G = insaG();
    const { asm } = rig(G);
    let boss = { name: 'Kök Ana', hp: 50, maxHp: 100 };
    G.em.bossHud = () => boss;
    asm.frame(0.3);
    expect(G.hud.boss).toEqual({ name: 'Kök Ana', hp: 50, maxHp: 100 });
    const obj = G.hud.boss;
    boss = { name: 'Kök Ana', hp: 20, maxHp: 100 };
    asm.frame(0.3);
    expect(G.hud.boss).toBe(obj); // aynı nesne yeniden kullanılır
    expect(G.hud.boss.hp).toBe(20);
    boss = null;
    asm.frame(0.3);
    expect(G.hud.boss).toBe(null);
    const other = { name: 'Dış', hp: 1, maxHp: 2 };
    G.hud.boss = other;
    boss = { name: 'Kök Ana', hp: 5, maxHp: 100 };
    asm.frame(0.3);
    expect(G.hud.boss).toBe(other);
  });

  it('boss yokken yayın çağrılmaz', () => {
    const G = insaG();
    const { asm } = rig(G);
    G.em.bossHud = () => null;
    const n = G.published.length;
    asm.frame(0.3);
    expect(G.published.length).toBe(n);
  });
});

describe('ipucu', () => {
  it('kuyruktaki ipucu hud.hint olur; süre bitince kalkar', () => {
    const G = insaG();
    const {
      asm, hints, c,
    } = rig(G);
    hints.push({ text: 'Merhaba ipucu', ttl: 2000 });
    asm.frame(0.016);
    expect(G.hud.hint).toBe('Merhaba ipucu');
    expect(G.published[G.published.length - 1]).toBe(true); // önemli değişim → anında yayın
    c.adv(2500);
    asm.frame(0.016);
    expect(G.hud.hint).toBe(null);
  });

  it('başka sistemin yazdığı ipucuna dokunmaz; o kalkınca sıra bizde', () => {
    const G = insaG();
    const { asm, hints } = rig(G);
    G.hud.hint = 'Dış ipucu';
    hints.push({ text: 'Bizim', ttl: 9000 });
    asm.frame(0.016);
    expect(G.hud.hint).toBe('Dış ipucu');
    G.hud.hint = null;
    asm.frame(0.016);
    expect(G.hud.hint).toBe('Bizim');
  });

  it('erişilebilirlik: yeni ipucu sesli okunur', () => {
    const G = insaG();
    G.accessibility = true;
    const { asm, hints } = rig(G);
    hints.push({ text: 'Sesli ipucu', ttl: 9000 });
    asm.frame(0.016);
    expect(G.spoken).toContain('Sesli ipucu');
  });
});

describe('duyuru', () => {
  it('hud.banner epoch ms ile gelir, süre dolunca kalkar, sıradaki gösterilir', () => {
    const G = insaG();
    const {
      asm, banners, c,
    } = rig(G);
    banners.push({
      text: 'Fısıldayan Ormanlar', sub: 'alt', duration: 2000, priority: 4,
    });
    banners.push({ text: 'İkinci', duration: 1500, priority: 3 });
    asm.frame(0.016);
    expect(G.hud.banner).toEqual({ text: 'Fısıldayan Ormanlar', sub: 'alt', until: 1700000000000 + 5000 + 2000 });
    expect(G.published[G.published.length - 1]).toBe(true);
    const first = G.hud.banner;
    c.adv(500);
    asm.frame(0.016);
    expect(G.hud.banner).toBe(first); // yeniden üretilmez
    c.adv(1600);
    asm.frame(0.016);
    expect(G.hud.banner.text).toBe('İkinci');
    c.adv(2000);
    asm.frame(0.016);
    expect(G.hud.banner).toBe(null);
    const clean = sanitizeHud(Object.assign({}, G.hud, { banner: { text: 'x', sub: '', until: 1 } }));
    expect(clean.banner.text).toBe('x');
  });

  it('erişilebilirlik: duyuru sesli okunur', () => {
    const G = insaG();
    G.accessibility = true;
    const { asm, banners } = rig(G);
    banners.push({ text: 'Mühür kırıldı', sub: 'Yanık Kanyonlar artık açık', duration: 3000 });
    asm.frame(0.016);
    expect(G.spoken).toContain('Mühür kırıldı. Yanık Kanyonlar artık açık');
  });
});

describe('görev ve bağlamsal ipucu (macera)', () => {
  let G;
  beforeAll(() => {
    G = makeTestG({ mode: 'macera', seed: 'HUDTEST1' });
    G.worldReady = true;
  }, 120000);

  it('ilk görev HUD\'a yazılır; değişmedikçe nesne sabit kalır', () => {
    const { asm } = rig(G);
    asm.frame(0.6);
    expect(G.hud.quest.title.length).toBeGreaterThan(0);
    expect(G.hud.quest.lines.length).toBeGreaterThan(0);
    const q = G.hud.quest;
    asm.frame(0.6);
    expect(G.hud.quest).toBe(q);
    const clean = sanitizeHud(G.hud);
    expect(clean.quest.title).toBe(q.title);
  });

  it('düşük can bağlamsal ipucu verir (cooldown\'lu)', () => {
    const { asm, hints } = rig(G);
    G.hud.hint = null;
    G.survival.hp = 3;
    G.ui = 'none';
    asm.frame(2.1);
    expect(G.hud.hint).toMatch(/Canın azaldı/);
    hints.clear();
    G.hud.hint = null;
    asm.frame(2.1);
    asm.frame(0.016);
    expect(G.hud.hint).toBe(null); // 90 sn cooldown
    G.survival.hp = G.survival.maxHp;
  });

  it('diğer modlarda görev boş', () => {
    const I = insaG();
    I.hud.quest = { title: 'eski', lines: ['x'] };
    const { asm } = rig(I);
    asm.frame(0.6);
    expect(I.hud.quest).toEqual({ title: '', lines: [] });
  });
});
