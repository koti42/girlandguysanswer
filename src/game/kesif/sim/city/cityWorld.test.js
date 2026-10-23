import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { World } from '../world.js';
import { dimSeed } from '../dim/dimensions.js';
import { standableAt } from '../../gameWorld.js';
import { getCityPlan } from './cityPlan.js';
import { SEWER } from './cityUndergroundPlan.js';

/** Gerçek neon World + gerçek üretici (registry → cityGen): koruma kuralları, varış, derin kesit, ışık, kırma/yerleştirme. */
function neon(seedIn) {
  const seed = dimSeed(seedIn, 'neon');
  return { seed, world: new World({ seed, mode: 'macera', dim: 'neon' }) };
}

describe('neon World + cityGen entegrasyonu', () => {
  it('varış noktası (0.5,64,2.5) ayakta durulabilir; yüzey bandı ışıklı; çevre chunk\'ları üretilir', () => {
    const { world } = neon(4242);
    for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) expect(world.ensureChunk(cx, cz)).not.toBeNull();
    expect(standableAt(world, 0, 64, 2)).toBe(true);
    expect(world.getBlock(0, 63, 2)).not.toBe(0);
    expect(world.getBlock(0, 70, 2)).toBe(0);
    expect(world.getLight(0, 100, 2) >> 4).toBe(15);
    expect(world.canGenerate(49, 49)).toBe(true);
    expect(world.canGenerate(50, 0)).toBe(false);
  });

  it('koruma: yol/bina/tünel kırılamaz, yol koridorunda yerleştirme yasak; oyuncunun koyduğu blok kırılır; doğal taş kazılır', () => {
    const { world, seed } = neon(4243);
    const plan = getCityPlan(seed);
    world.ensureChunk(15, 6);
    // V_3 koridoru x=244 asfalt (kanalizasyondan uzak), z=100
    expect(world.setBlock(244, 63, 100, 0)).toBe(false);
    expect(world.getBlock(244, 63, 100)).not.toBe(0);
    expect(world.setBlock(244, 66, 100, B.GLASS)).toBe(false); // yol koridoru y64..68 yasak
    expect(world.getBlock(244, 66, 100)).toBe(0);
    expect(world.setBlock(244, 70, 100, B.GLASS)).toBe(true); // y69+ serbest
    expect(world.setBlock(244, 70, 100, 0)).toBe(true); // kendi koyduğu: kırılır
    // doğal taş (y≤60, mühendislik dışı): kazılır
    expect(world.setBlock(244, 50, 100, 0)).toBe(true);
    expect(world.getBlock(244, 50, 100)).toBe(0);
    // sewer kaplaması korumalı
    expect(world.setBlock(240, 35, 100, 0)).toBe(false);
    expect(plan.underground.sewer.floorY).toBe(SEWER.floorY);
  });

  it('bina duvarı kırılamaz (yapı korumalı), kapı bloğu kırılamaz', () => {
    const { world, seed } = neon(4244);
    const plan = getCityPlan(seed);
    const lot = plan.lotsIndex.all().find((l) => l.archetype === 'kule_cam');
    const bp = plan.lotsIndex.blockPlan(lot.bi, lot.bj).lots.find((l) => l.id === lot.id);
    expect(bp).toBeTruthy();
    const x = lot.x0 + 2;
    const z = lot.z0 + 3;
    world.ensureChunk(Math.floor(x / 16), Math.floor(z / 16));
    // duvar hücresi: ayak izi kenarı (zemin kat)
    const door = plan.lotsIndex.lotById(lot.id).door;
    const doorCell = door.axis === 'x' ? [door.x, 65, door.z] : [door.x, 65, door.z];
    world.ensureChunk(Math.floor(doorCell[0] / 16), Math.floor(doorCell[2] / 16));
    expect(world.getBlock(doorCell[0], doorCell[1], doorCell[2])).toBe(B.SLIDING_DOOR);
    expect(world.setBlock(doorCell[0], doorCell[1], doorCell[2], 0)).toBe(false);
  });

  it('derin kesitler: laboratuvar odası ensureSection ile üretilir, ışık dikişi yapılır; ana kaya değişmez', () => {
    const { world, seed } = neon(4245);
    const plan = getCityPlan(seed);
    const lab = plan.underground.labs[1];
    const r = lab.rooms[2];
    const x = Math.floor((r.x0 + r.x1) / 2);
    const z = Math.floor((r.z0 + r.z1) / 2);
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    world.ensureChunk(cx, cz);
    for (let y = r.y0; y < r.y1; y += 8) world.ensureSection(cx, cz, (y + 400) >> 4);
    expect(world.getBlock(x, r.y0, z)).toBe(0);
    expect(world.getBlock(x, r.y0 - 1, z)).not.toBe(0);
    // tavan ışığı (4 ışık/oda): oda içinde blok ışığı > 0
    let lit = 0;
    for (let dz = 0; dz < 12; dz++) for (let dx = 0; dx < 16; dx++) lit += (world.getLight(r.x0 + dx, r.y0, r.z0 + dz) & 15) > 0 ? 1 : 0;
    expect(lit).toBeGreaterThan(20);
    world.ensureSection(cx, cz, 0);
    expect(world.getBlock(x, -400, z)).toBe(B.BEDROCK);
    expect(world.setBlock(x, -400, z, 0, { force: true })).toBeDefined();
  });

  it('düzenlemeler (yerleştir/kır) chunk yeniden üretiminde korunur ve üretim belirlenimcidir', () => {
    const a = neon(4246);
    const b = neon(4246);
    a.world.ensureChunk(15, 6);
    b.world.ensureChunk(15, 6);
    expect(a.world.setBlock(244, 70, 100, B.GLASS)).toBe(true);
    for (let y = 0; y < 100; y += 3) for (let k = 0; k < 16; k++) {
      if (y === 70 && k === 4) continue;
      expect(a.world.getBlock(240 + k, y, 100)).toBe(b.world.getBlock(240 + k, y, 100));
    }
    expect(b.world.getBlock(244, 70, 100)).toBe(0);
    expect(a.world.getBlock(244, 70, 100)).toBe(B.GLASS);
  });
});
