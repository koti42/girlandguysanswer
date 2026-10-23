/*
 * content sistemi — ipucu kuralları: BEKLEMEYLE tetiklenen ipucu yoktur; acil ipucu bir bölümde en çok ~8 sn görünür,
 * durum sürse de tekrar etmez; durum bitip yeniden başlayınca yeni bölüm açılır.
 */
import { describe, expect, it } from 'vitest';
import { makeContentG } from './contentTestKit.js';

const SEED = 12345;
const sec = (n) => n * 60;

describe('content: ipuçları durup beklemekle geri gelmez', () => {
  it('uzun süre ipucu yokken "Hedef: …" gibi bekleme ipucu çıkmaz', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G } = kit;
    kit.step(sec(20)); // açılış + ilk görev ipucu bitsin
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      kit.step(sec(10));
      if (G.hud.hint) seen.add(G.hud.hint);
    }
    // 300 sn durdu: hiçbir "Hedef:" satırı yok
    expect(Array.from(seen).filter((t) => /^Hedef:/.test(t))).toEqual([]);
  });

  it('düşük can ipucu bir bölümde ~8 sn görünür; durum sürse de geri gelmez; durum bitip başlayınca yeniden çıkar', () => {
    const kit = makeContentG({ seed: SEED, pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    const { G } = kit;
    kit.step(sec(20));
    G.survival.hp = 3;
    kit.step(sec(2));
    expect(G.hud.hint).toContain('Canın azaldı');
    kit.step(sec(10)); // hâlâ düşük can ama pencere doldu
    expect(G.hud.hint === null || G.hud.hint.indexOf('Canın azaldı') < 0).toBe(true);
    kit.step(sec(60)); // durup beklemek geri getirmez
    expect(G.hud.hint === null || G.hud.hint.indexOf('Canın azaldı') < 0).toBe(true);
    G.survival.hp = G.survival.maxHp;
    kit.step(sec(2));
    G.survival.hp = 2; // yeni olay: yeniden can düştü
    kit.step(sec(2));
    expect(G.hud.hint).toContain('Canın azaldı');
  });
});
