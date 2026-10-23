import { afterEach, describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { World } from '../world.js';
import { editBudget } from './dimRules.js';
import { installFlatCity, makeCityWorld } from './dimTestKit.js';
import { unregisterDimGen } from './genRegistry.js';

afterEach(() => unregisterDimGen('city'));

function cityWorld() {
  const w = makeCityWorld(7);
  w.ensureChunk(0, 0);
  w.ensureChunk(1, 0);
  return w;
}

/**
 * qa_p1 G5: şehirde oyuncunun koyup sonra kırdığı blok düzenleme kaydından silinir → düzenleme bütçesi (250 KB, %90'da "Şehirde yer doldu")
 * yıkınca boşalır. Ana diyar davranışı aynı (kırılan hücre 0 olarak kaydedilir).
 */
describe('şehir: yerleştir → kır = kayıt silinir', () => {
  it('koy: edits +1; kır: edits −1 ve _editsByChunk temiz; hücre hava', () => {
    const off = installFlatCity();
    try {
      const w = cityWorld();
      const n0 = w.edits.size;
      expect(w.setBlock(7, 64, 7, B.DIRT)).toBe(true);
      expect(w.edits.size).toBe(n0 + 1);
      expect(w.setBlock(7, 64, 7, 0)).toBe(true);
      expect(w.getBlock(7, 64, 7)).toBe(0);
      expect(w.edits.size).toBe(n0);
      expect(w.edits.has('7,64,7')).toBe(false);
      let inChunk = 0;
      w._editsByChunk.forEach((m) => { inChunk += m.size; });
      expect(inChunk).toBe(n0);
    } finally {
      off();
    }
  });

  it('doğal dolgu kırıldıktan sonra oyuncu koyup yine kırarsa kayıt DURUR (özgün taş geri gelmesin): y<64', () => {
    const off = installFlatCity();
    try {
      const w = cityWorld();
      expect(w.setBlock(5, 62, 5, 0)).toBe(true); // doğal dolgu kırılır
      expect(w.edits.get('5,62,5')).toBe(0);
      expect(w.setBlock(5, 62, 5, B.DIRT)).toBe(true);
      expect(w.setBlock(5, 62, 5, 0)).toBe(true);
      expect(w.edits.get('5,62,5')).toBe(0);
      expect(w.getBlock(5, 62, 5)).toBe(0);
    } finally {
      off();
    }
  });

  it('bütçe boşalır: çok sayıda koy → kır sonrası editBudget.bytes başa döner', () => {
    const off = installFlatCity();
    try {
      const w = cityWorld();
      const b0 = editBudget(w).bytes;
      const cells = [];
      for (let z = 6; z < 40; z++) for (let x = 6; x < 40; x++) cells.push([x, z]);
      for (let i = 0; i < cells.length; i++) w.setBlock(cells[i][0], 64 + (i % 5), cells[i][1], 1 + (i % 7));
      expect(editBudget(w).bytes).toBeGreaterThan(b0);
      for (let i = 0; i < cells.length; i++) w.setBlock(cells[i][0], 64 + (i % 5), cells[i][1], 0);
      expect(w.edits.size).toBe(0);
      expect(editBudget(w).bytes).toBe(b0);
    } finally {
      off();
    }
  });

  it('ana diyar: kırma 0 olarak KAYDEDİLİR (davranış değişmez)', () => {
    const w = new World({ seed: 77, mode: 'macera' });
    w.ensureChunk(0, 0);
    expect(w.setBlock(3, 90, 3, B.STONE)).toBe(true);
    expect(w.setBlock(3, 90, 3, 0)).toBe(true);
    expect(w.edits.get('3,90,3')).toBe(0);
  });
});
