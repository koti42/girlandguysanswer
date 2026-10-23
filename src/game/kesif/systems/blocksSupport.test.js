import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { events, makeG } from './blocksTestKit.js';
import {
  enqueueFall, isSupported, removeUnsupportedAround, supportKind,
} from './blocksSupport.js';

describe('destek türleri', () => {
  it('bitki/meşale/kaktüs/sarmaşık sınıflanır; sistem blokları ve düz bloklar hariç', () => {
    expect(supportKind(B.FLOWER_RED)).toBe('plant');
    expect(supportKind(B.TALL_GRASS)).toBe('plant');
    expect(supportKind(B.MUSHROOM)).toBe('mushroom');
    expect(supportKind(B.TORCH)).toBe('torch');
    expect(supportKind(B.LANTERN)).toBe('torch');
    expect(supportKind(B.CACTUS)).toBe('cactus');
    expect(supportKind(B.VINE)).toBe('vine');
    expect(supportKind(B.STONE)).toBeNull();
    expect(supportKind(B.LEVER)).toBeNull(); // sistem bloğu patlamaz
    expect(supportKind(B.PRESSURE_PLATE)).toBeNull();
  });
});

describe('destek kaldırılınca bağımlılar düşer', () => {
  it('zeminin altı kırılınca üstündeki çiçek eşya olarak düşer; olay by:support', () => {
    const g = makeG();
    const { G } = g;
    G.world.setBlock(5, 41, 5, B.FLOWER_RED);
    expect(isSupported(G.world, 'plant', B.FLOWER_RED, 5, 41, 5)).toBe(true);
    G.world.setBlock(5, 40, 5, B.AIR);
    const n = removeUnsupportedAround(G, g.S, 5, 40, 5);
    expect(n).toBe(1);
    expect(G.world.getBlock(5, 41, 5)).toBe(B.AIR);
    expect(events(G, 'blockBroken')[0]).toMatchObject({ by: 'support', id: B.FLOWER_RED });
    expect(G.items.map((i) => i.item)).toContain('blok:gelincik');
  });

  it('zincir: toprak kırılınca üstündeki çiçek ve onun üstündeki meşale düşer', () => {
    const g = makeG();
    const { G } = g;
    G.world.setBlock(5, 41, 5, B.TALL_GRASS);
    // meşale çiçeğin üstünde desteksiz kalmalı (çiçek katı değil)
    G.world.setBlock(5, 42, 5, B.TORCH);
    G.world.setBlock(5, 40, 5, B.AIR);
    removeUnsupportedAround(G, g.S, 5, 40, 5);
    expect(G.world.getBlock(5, 41, 5)).toBe(B.AIR);
    expect(G.world.getBlock(5, 42, 5)).toBe(B.AIR);
  });

  it('yan duvara yaslanan meşale duvar gidince düşer, zeminde duran düşmez', () => {
    const g = makeG();
    const { G } = g;
    G.world.setBlock(5, 50, 5, B.STONE);
    G.world.setBlock(6, 50, 5, B.TORCH);
    G.world.setBlock(5, 50, 5, B.AIR);
    removeUnsupportedAround(G, g.S, 5, 50, 5);
    expect(G.world.getBlock(6, 50, 5)).toBe(B.AIR);
    G.world.setBlock(7, 41, 7, B.TORCH); // çimen üstünde
    G.world.setBlock(8, 41, 7, B.STONE);
    G.world.setBlock(8, 41, 7, B.AIR);
    removeUnsupportedAround(G, g.S, 8, 41, 7);
    expect(G.world.getBlock(7, 41, 7)).toBe(B.TORCH);
  });

  it('oyuncu desteği kırınca (gerçek kırma yolu) bitki düşer ve blockBroken iki kez yayılır', () => {
    const g = makeG();
    const { G } = g;
    G.world.setBlock(8, 41, 6, B.FLOWER_YELLOW);
    g.aim(8, 40, 6);
    for (let i = 0; i < 80 && G.world.getBlock(8, 40, 6) !== B.AIR; i++) g.step(1, { breakHeld: true });
    expect(G.world.getBlock(8, 40, 6)).toBe(B.AIR);
    expect(G.world.getBlock(8, 41, 6)).toBe(B.AIR);
    const ev = events(G, 'blockBroken');
    expect(ev.map((e) => e.by).sort()).toEqual(['player', 'support']);
  });

  it('kaktüs kumdan ayrılınca düşer', () => {
    const g = makeG();
    const { G } = g;
    G.world.setBlock(5, 40, 5, B.SAND);
    G.world.setBlock(5, 41, 5, B.CACTUS);
    expect(isSupported(G.world, 'cactus', B.CACTUS, 5, 41, 5)).toBe(true);
    G.world.setBlock(5, 40, 5, B.AIR);
    removeUnsupportedAround(G, g.S, 5, 40, 5);
    expect(G.world.getBlock(5, 41, 5)).toBe(B.AIR);
  });

  it('inşa modunda düşen bitki eşya bırakmaz', () => {
    const g = makeG({ mode: 'insa' });
    const { G } = g;
    G.world.setBlock(5, 41, 5, B.FLOWER_RED);
    G.world.setBlock(5, 40, 5, B.AIR);
    removeUnsupportedAround(G, g.S, 5, 40, 5);
    expect(G.items.length).toBe(0);
  });

  it('ışın tüfeğiyle kırılan blok (blockBroken by:beam) komşu bağımlıları düşürür', () => {
    const g = makeG();
    const { G } = g;
    G.world.setBlock(5, 41, 5, B.FLOWER_RED);
    G.world.setBlock(5, 40, 5, B.AIR);
    G.emit({ type: 'blockBroken', x: 5, y: 40, z: 5, id: B.GRASS, by: 'beam' });
    expect(G.world.getBlock(5, 41, 5)).toBe(B.AIR);
  });
});

describe('düşen bloklar (kum, çakıl)', () => {
  it('havaya konan kum aşağı iner ve zemine oturur; sütun sıkışık kalır', () => {
    const g = makeG();
    const { G } = g;
    expect(g.G.blocks.placeBlockAt(5, 46, 5, B.SAND)).toBe(true);
    expect(g.G.blocks.placeBlockAt(5, 47, 5, B.GRAVEL)).toBe(true);
    g.step(200);
    expect(G.world.getBlock(5, 41, 5)).toBe(B.SAND);
    expect(G.world.getBlock(5, 42, 5)).toBe(B.GRAVEL);
    expect(G.world.getBlock(5, 46, 5)).toBe(B.AIR);
    expect(G.world.getBlock(5, 47, 5)).toBe(B.AIR);
    expect(events(G, 'blockLanded').length).toBeGreaterThan(0);
  });

  it('altı kırılan kum oyuncu kırınca düşer (gerçek yol)', () => {
    const g = makeG();
    const { G } = g;
    G.eye.y = 45.62; G.eyeSim.y = 45.62;
    G.world.setBlock(8, 46, 6, B.SAND);
    G.world.setBlock(8, 45, 6, B.DIRT);
    g.aim(8, 45, 6);
    for (let i = 0; i < 60 && G.world.getBlock(8, 45, 6) !== B.AIR; i++) g.step(1, { breakHeld: true });
    g.step(200);
    expect(G.world.getBlock(8, 46, 6)).toBe(B.AIR);
    expect(G.world.getBlock(8, 45, 6)).toBe(B.AIR);
    expect(G.world.getBlock(8, 41, 6)).toBe(B.SAND);
  });

  it('düşeceği hücrede oyuncu varsa bekler, çıkınca düşer', () => {
    const g = makeG();
    const { G } = g;
    expect(g.G.blocks.placeBlockAt(8, 44, 8, B.SAND)).toBe(true);
    g.step(40);
    expect(G.world.getBlock(8, 43, 8)).toBe(B.SAND); // başının üstünde durdu
    expect(G.world.getBlock(8, 42, 8)).toBe(B.AIR);
    G.body.x = 12.5;
    g.step(120);
    expect(G.world.getBlock(8, 41, 8)).toBe(B.SAND);
  });

  it('suyun üstündeki kum batmaz (sıvı boşluğu bırakmamak için yüzer)', () => {
    const g = makeG();
    const { G } = g;
    G.world.setBlock(14, 41, 14, B.WATER);
    expect(g.G.blocks.placeBlockAt(14, 44, 14, B.SAND)).toBe(true);
    g.step(160);
    expect(G.world.getBlock(14, 41, 14)).toBe(B.WATER);
    expect(G.world.getBlock(14, 42, 14)).toBe(B.SAND);
  });

  it('kuyruk sınırlı kalır ve tekrarları yutar', () => {
    const g = makeG();
    for (let i = 0; i < 700; i++) enqueueFall(g.S, i, 60, 3);
    expect(g.S.fall.xs.length).toBeLessThanOrEqual(256);
    const n = g.S.fall.xs.length;
    enqueueFall(g.S, 699, 60, 3);
    expect(g.S.fall.xs.length).toBe(n);
  });
});
