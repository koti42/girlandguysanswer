import { describe, expect, it } from 'vitest';
import { pickHiddenBands } from './chunkMgrWarm.js';

const mesh = (id) => ({ id, geometry: { id } });
function band(x, z, over) {
  return Object.assign({
    hasMesh: true, visible: false, sphere: { x, y: 64, z, r: 8 }, meshes: [mesh('o' + x + ':' + z), null, null],
  }, over || {});
}
function recsOf(bands) {
  const m = new Map();
  bands.forEach((b, i) => m.set(i, { bands: [b] }));
  return m;
}

describe('pickHiddenBands', () => {
  it('yalnız görünmeyen + mesh\'i olan + sis mesafesi içindeki bantları, en yakından başlayarak seçer', () => {
    const bands = [
      band(100, 0), // uzak
      band(20, 0), // yakın
      band(40, 0), // orta
      band(10, 0, { visible: true }), // görünür → atla
      band(30, 0, { hasMesh: false }), // mesh yok → atla
      band(500, 0), // sis dışı
    ];
    const out = [];
    pickHiddenBands(recsOf(bands), 0, 64, 0, 130, 10, () => false, out);
    expect(out.map((m) => m.id)).toEqual(['o20:0', 'o40:0', 'o100:0']);
  });

  it('max ile sınırlanır; yüklenmiş (isDone) mesh\'ler atlanır; bir bant tek adımda bir geçiş', () => {
    const bands = [band(10, 0), band(20, 0), band(30, 0)];
    const done = new Set(['o10:0']);
    const out = [];
    pickHiddenBands(recsOf(bands), 0, 64, 0, 200, 1, (m) => done.has(m.id), out);
    expect(out.map((m) => m.id)).toEqual(['o20:0']);
    // bir bantın üç geçişi: her çağrıda yalnız ilk yüklenmemiş olan
    const multi = band(5, 0, { meshes: [mesh('a'), mesh('b'), mesh('c')] });
    pickHiddenBands(recsOf([multi]), 0, 64, 0, 200, 5, () => false, out);
    expect(out.map((m) => m.id)).toEqual(['a']);
    pickHiddenBands(recsOf([multi]), 0, 64, 0, 200, 5, (m) => m.id === 'a', out);
    expect(out.map((m) => m.id)).toEqual(['b']);
  });

  it('boş giriş, max<=0, bantsız sütun ve geometrisiz mesh güvenli', () => {
    const out = [1, 2, 3];
    expect(pickHiddenBands(new Map(), 0, 0, 0, 100, 4, () => false, out)).toBe(out);
    expect(out.length).toBe(0);
    const m = new Map([[1, { bands: null }], [2, { bands: [null, band(5, 0, { meshes: [{ id: 'x', geometry: null }, null, null] })] }]]);
    pickHiddenBands(m, 0, 0, 0, 100, 4, () => false, out);
    expect(out.length).toBe(0);
    pickHiddenBands(recsOf([band(5, 0)]), 0, 64, 0, 100, 0, () => false, out);
    expect(out.length).toBe(0);
  });
});
