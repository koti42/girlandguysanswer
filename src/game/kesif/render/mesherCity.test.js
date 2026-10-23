import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B, BLOCKS } from '../sim/blocks.js';
import {
  CITY_BLOCK_IDS as C, NEON_HUE, WINDOW_GROUP_THRESHOLD_BYTES, windowGroup,
} from '../sim/cityData.js';
import {
  meshChunk, collectTransferables, PASS_NAMES, MESH_ATTRIBUTES, CITY_MESH_ATTRIBUTES, CITY_ATTRIBUTE, meshAttributes, CITY_FLAG,
} from './mesher.js';
import { CITY_PW, CITY_PH, CITY_MODE_LUT, CITY_MODE } from './mesherCity.js';
import { PW, PH, SY, SZ } from './mesherCore.js';
import { createCityGeometry, cityDummyAttributes } from './cityGeometry.js';
import { createChunkGeometry } from './materials.js';
import {
  emptyChunk, putBlock, kidx, randomOverworldChunk, meshHash, lcg,
} from './mesherCityKit.js';
import { bestOf } from '../../../test/perfScale.js';

/* Ana diyar mesher çıktısı DONDURULMUŞ özetleri (opts.city eklenmeden ÖNCE, orijinal mesher ile üretildi). */
const GOLDEN_A = ['00196180', '971ce051', 'a3545fcd', '73516e75', 'c533e1bf', '7c14e814', '0f3e0a53', '121e05f3', 'c923e839', 'd0be4f92',
  'e1da7420', 'e25cbcc8', 'ca54735e', '93628321', 'fb564060', '97f5e2d5', '380b14cb', '74b9ced3', '057e431d', '6fba1063'];
const GOLDEN_B = ['1e1892a3', 'fd617554', '3093dcdf', '4475afb6', '4d9584de', '2c11082e', 'afd403be', '60c154e4', 'c5d20171', '2c95c8b8',
  '9f8cbc7f', '17040034', 'beb16001', '9f096941', '9e3b1cd1', 'b37f4fa5', '7815d555', '00862eda', '02d195f6', 'b1de1066'];

function overworldCase(i) {
  const cx = (i * 3) % 7 - 3;
  const cz = (i * 5) % 9 - 4;
  const c = randomOverworldChunk(i + 1, cx, cz);
  const nb = {
    n: randomOverworldChunk(i + 1, cx, cz - 1),
    e: randomOverworldChunk(i + 1, cx + 1, cz),
    w: randomOverworldChunk(i + 1, cx - 1, cz),
    ne: randomOverworldChunk(i + 1, cx + 1, cz - 1),
  };
  return { c, nb };
}
const optsA = (extra) => Object.assign({}, extra);
const optsB = (i, extra) => Object.assign({
  mergeDark: true, darkLod: i % 3 === 0 ? 1 : 0, farFlora: i % 4 === 0, nullNeighbor: 'air', randomize: i % 5 !== 0,
}, extra);

describe('mesher opts.city: ana diyar bayt-aynı (regresyon)', () => {
  it('20 rastgele ana diyar chunk\'ı: city kapalıyken (varsayılan ve city:false) çıktı DONDURULMUŞ özetle birebir, `city` anahtarı yok', () => {
    for (let i = 0; i < 20; i++) {
      const { c, nb } = overworldCase(i);
      const nbB = i % 2 ? {} : nb;
      const a0 = meshChunk(c, nb, null, optsA({}));
      const a1 = meshChunk(c, nb, null, optsA({ city: false }));
      const b0 = meshChunk(c, nbB, null, optsB(i, {}));
      const b1 = meshChunk(c, nbB, null, optsB(i, { city: false }));
      expect(meshHash(a0), 'A ' + i).toBe(GOLDEN_A[i]);
      expect(meshHash(a1), 'A city:false ' + i).toBe(GOLDEN_A[i]);
      expect(meshHash(b0), 'B ' + i).toBe(GOLDEN_B[i]);
      expect(meshHash(b1), 'B city:false ' + i).toBe(GOLDEN_B[i]);
      PASS_NAMES.forEach((k) => {
        expect(Object.keys(a0[k]).sort()).toEqual(['color', 'flags', 'index', 'indexCount', 'light', 'normal', 'pos', 'uv', 'vertexCount'].sort());
        expect(a0[k].city).toBeUndefined();
        expect(a1[k].city).toBeUndefined();
      });
    }
  });

  it('city:true ana diyar chunk\'ında diğer TÜM tamponlar özdeş kalır; aCity yalnız eklenir (sıfır: yayıcı/pencere/ıslak yok)', () => {
    for (let i = 0; i < 20; i++) {
      const { c, nb } = overworldCase(i);
      const m = meshChunk(c, nb, null, optsA({ city: true }));
      expect(meshHash(m), 'A+city ' + i).toBe(GOLDEN_A[i]);
      PASS_NAMES.forEach((k) => {
        const p = m[k];
        expect(p.city).toBeInstanceOf(Uint8Array);
        expect(p.city.length).toBe(p.vertexCount * 4);
        for (let j = 0; j < p.city.length; j++) if (p.city[j] !== 0) throw new Error(`ana diyar aCity sıfır olmalı (${k} ${j})`);
      });
      const mb = meshChunk(c, i % 2 ? {} : nb, null, optsB(i, { city: true }));
      expect(meshHash(mb), 'B+city ' + i).toBe(GOLDEN_B[i]);
    }
  });

  it('city açık/kapalı çağrıları serpiştirilince sızıntı yok (havuzlu tamponlar)', () => {
    const { c, nb } = overworldCase(3);
    const h = [];
    for (let r = 0; r < 4; r++) {
      h.push(meshHash(meshChunk(c, nb, null, { city: r % 2 === 0 })));
      const off = meshChunk(c, nb, null, {});
      expect(off.opaque.city).toBeUndefined();
    }
    expect(new Set(h).size).toBe(1);
  });
});

/* ------------------------------------------------------------------------------------------------
 * Şehir sahneleri
 * ---------------------------------------------------------------------------------------------- */
/** Hava hücrelerinin blok ışığını merkezden Manhattan uzaklığa göre ver (merkez seviyesi L, her adımda −1). */
function glow(c, x, y, z, level) {
  for (let dy = -level; dy <= level; dy++) {
    for (let dz = -level; dz <= level; dz++) {
      for (let dx = -level; dx <= level; dx++) {
        const v = level - (Math.abs(dx) + Math.abs(dy) + Math.abs(dz));
        const X = x + dx;
        const Y = y + dy;
        const Z = z + dz;
        if (v <= 0 || X < 0 || X > 15 || Z < 0 || Z > 15 || Y < 0 || Y > 127) continue;
        const i = kidx(X, Y, Z);
        if (c.blocks[i] !== 0) continue;
        const cur = c.light[i] & 15;
        if (v > cur) c.light[i] = (c.light[i] & 0xf0) | v;
      }
    }
  }
}
/** Hücrenin tüm hava komşularına sabit blok ışığı. */
function flood(c, level) {
  for (let i = 0; i < c.blocks.length; i++) if (c.blocks[i] === 0) c.light[i] = (c.light[i] & 0xf0) | level;
}

function street() {
  const c = emptyChunk(0, 0);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = 0; y <= 63; y++) putBlock(c, x, y, z, B.STONE);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) putBlock(c, x, 64, z, C.ASPHALT);
  return c;
}

const NORMALS = { px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
/** Bir bloğun bir yönündeki yüzünün köşelerinin aCity değerleri ([r,g,b,a] listesi): yüz merkezi (4 köşenin ortalaması) ile eşleşir. */
function faceCity(m, bx, by, bz, dir) {
  const n = NORMALS[dir];
  const cx = bx + 0.5 + n[0] * 0.5;
  const cy = by + 0.5 + n[1] * 0.5;
  const cz = bz + 0.5 + n[2] * 0.5;
  const out = [];
  PASS_NAMES.forEach((k) => {
    const p = m[k];
    for (let v = 0; v + 3 < p.vertexCount; v += 4) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let j = 0; j < 4; j++) {
        sx += p.pos[(v + j) * 3];
        sy += p.pos[(v + j) * 3 + 1];
        sz += p.pos[(v + j) * 3 + 2];
      }
      if (Math.abs(sx / 4 - cx) > 1e-4 || Math.abs(sy / 4 - cy) > 1e-4 || Math.abs(sz / 4 - cz) > 1e-4) continue;
      if (p.normal[v * 3] !== n[0] || p.normal[v * 3 + 1] !== n[1] || p.normal[v * 3 + 2] !== n[2]) continue;
      for (let j = 0; j < 4; j++) out.push(Array.from(p.city.subarray((v + j) * 4, (v + j) * 4 + 4)));
    }
  });
  return out;
}
const mesh = (c, nb, extra) => meshChunk(c, nb || {}, null, Object.assign({ nullNeighbor: 'air', city: true }, extra));
const allEqual = (list, v) => list.length === 4 && list.every((q) => q.every((b, i) => b === v[i]));

describe('mesherCity: ıslak yüzey bayrağı', () => {
  it('ıslak blokların ÜST yüzü bit7; yan/alt yüz ve taş üstü bayraksız; yayıcı yokken şiddet 0', () => {
    const c = street();
    putBlock(c, 3, 64, 3, C.LANE_X);
    putBlock(c, 4, 64, 3, C.ZEBRA_X);
    putBlock(c, 5, 64, 3, C.SIDEWALK);
    putBlock(c, 6, 64, 3, C.LANE_Z);
    putBlock(c, 7, 64, 3, C.ZEBRA_Z);
    putBlock(c, 12, 65, 12, C.ASPHALT); // üstte tek blok: yan yüzleri açık
    putBlock(c, 9, 65, 9, B.STONE);
    const m = mesh(c);
    [[3, 64, 3], [4, 64, 3], [5, 64, 3], [6, 64, 3], [7, 64, 3], [1, 64, 1], [12, 65, 12]].forEach(([x, y, z]) => {
      expect(allEqual(faceCity(m, x, y, z, 'py'), [0, 0, 0, CITY_FLAG.WET]), `üst ${x},${y},${z}`).toBe(true);
    });
    ['px', 'nx', 'pz', 'nz', 'py'].forEach((d) => {
      const f = faceCity(m, 12, 65, 12, d);
      expect(f.length, d).toBe(4);
      f.forEach((q) => expect(q[3] & CITY_FLAG.WET).toBe(d === 'py' ? CITY_FLAG.WET : 0));
    });
    // taş üstü ıslak değil
    expect(allEqual(faceCity(m, 9, 65, 9, 'py'), [0, 0, 0, 0])).toBe(true);
    // yan yüz: düzlemden 4 yüz; asfalt kenar yüzü (chunk dışı hava): bit7 yok
    faceCity(m, 0, 64, 5, 'nx').forEach((q) => expect(q[3]).toBe(0));
    expect(CITY_MODE_LUT[C.ASPHALT]).toBe(CITY_MODE.WET);
    expect(CITY_MODE_LUT[B.STONE]).toBe(CITY_MODE.NONE);
  });

  it('neon 3×3 sütun × 6 yukarı: ton = neon tonu, şiddet yakınlıkla düşer; 7 yukarı ve yanal 2 blok bulunmaz', () => {
    const q = (k, id = C.NEON_CYAN) => {
      const c = street();
      putBlock(c, 5, 64 + k, 4, id); // yanal +1: k=1'de de üst yüz örtülmez
      const m = mesh(c);
      return faceCity(m, 4, 64, 4, 'py');
    };
    const hue = NEON_HUE[C.NEON_CYAN];
    const expectK = (k) => Math.round((12 / 15) * (1 - (k - 1) / 7) * 63);
    for (let k = 1; k <= 6; k++) {
      const f = q(k);
      expect(allEqual(f, [hue[0], hue[1], hue[2], CITY_FLAG.WET | expectK(k)]), 'k=' + k).toBe(true);
    }
    // 7 yukarı: bulunmaz → ton yok; ışık ≥8 de olmadığı için yalnız bayrak
    const far = q(7);
    expect(allEqual(far, [0, 0, 0, CITY_FLAG.WET])).toBe(true);
    // şiddet yakınlıkla monoton azalır
    const ints = [1, 2, 3, 4, 5, 6].map((k) => q(k)[0][3] & 63);
    for (let i = 1; i < ints.length; i++) expect(ints[i]).toBeLessThan(ints[i - 1]);
    // her neon rengi kendi tonunu verir
    [C.NEON_PINK, C.NEON_AMBER, C.NEON_LIME].forEach((id) => {
      const f = q(2, id);
      expect(allEqual(f, [NEON_HUE[id][0], NEON_HUE[id][1], NEON_HUE[id][2], CITY_FLAG.WET | expectK(2)]), 'id ' + id).toBe(true);
    });
  });

  it('3×3 sütun: yanal ±1 bulunur, ±2 bulunmaz', () => {
    const at = (dx, dz) => {
      const c = street();
      putBlock(c, 8 + dx, 66, 8 + dz, C.NEON_PINK);
      return faceCity(mesh(c), 8, 64, 8, 'py');
    };
    const hue = NEON_HUE[C.NEON_PINK];
    [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].forEach(([dx, dz]) => {
      expect(at(dx, dz)[0].slice(0, 3), `${dx},${dz}`).toEqual(hue);
    });
    [[2, 0], [0, 2], [-2, 1], [2, 2]].forEach(([dx, dz]) => {
      expect(at(dx, dz).every((v) => v[0] === 0 && v[3] === CITY_FLAG.WET), `${dx},${dz}`).toBe(true);
    });
  });

  it('holo paneli de bir ton yayıcıdır (daha zayıf: emisyon 8)', () => {
    const c = street();
    putBlock(c, 8, 66, 8, C.HOLO_PANEL);
    const f = faceCity(mesh(c), 8, 64, 8, 'py');
    const hue = NEON_HUE[C.HOLO_PANEL];
    expect(f[0].slice(0, 3)).toEqual(hue);
    expect(f[0][3] & 63).toBe(Math.round((8 / 15) * (1 - 1 / 7) * 63));
  });

  it('sütunda yayıcı yoksa ama köşe ışığı ≥ 8 ve 3×3×3 içinde neon varsa (yüzey hizası) neon boyası ıslak yüze uygulanır', () => {
    const c = street();
    putBlock(c, 9, 64, 8, C.NEON_PINK); // asfalt satırında yanal komşu: sütun taraması (y65+) bulamaz, 3×3×3 bulur
    glow(c, 9, 65, 8, 12);
    const m = mesh(c);
    const f = faceCity(m, 8, 64, 8, 'py');
    expect(f).toHaveLength(4);
    f.forEach((q) => {
      expect(q.slice(0, 3)).toEqual(NEON_HUE[C.NEON_PINK]);
      expect(q[3] & CITY_FLAG.WET).toBe(CITY_FLAG.WET);
      expect(q[3] & 63).toBeGreaterThan(0);
    });
    // ışık yoksa aynı yerleşimde yalnız bayrak
    const c2 = street();
    putBlock(c2, 9, 64, 8, C.NEON_PINK);
    expect(allEqual(faceCity(mesh(c2), 8, 64, 8, 'py'), [0, 0, 0, CITY_FLAG.WET])).toBe(true);
  });
});

describe('mesherCity: pencere grubu', () => {
  it('yanık pencerenin 6 yüzü: bit6 + grup + eşik baytı; sönük pencere/diğer bloklar bayraksız', () => {
    const c = street();
    const cells = [];
    for (let i = 0; i < 12; i++) {
      const x = 1 + (i % 4) * 3;
      const z = 1 + Math.floor(i / 4) * 3;
      const id = i % 3 === 0 ? C.WINDOW_DARK : i % 3 === 1 ? C.WINDOW_WARM : C.WINDOW_COOL;
      putBlock(c, x, 70, z, id);
      cells.push([x, 70, z, id]);
    }
    const m = mesh(c);
    const groups = new Set();
    cells.forEach(([x, y, z, id]) => {
      ['px', 'nx', 'py', 'ny', 'pz', 'nz'].forEach((d) => {
        const f = faceCity(m, x, y, z, d);
        expect(f.length, `${id}@${x},${z} ${d}`).toBe(4);
        if (id === C.WINDOW_DARK) {
          expect(allEqual(f, [0, 0, 0, 0])).toBe(true);
        } else {
          const g = windowGroup(x, y, z); // chunk (0,0): dünya = yerel
          groups.add(g);
          expect(allEqual(f, [WINDOW_GROUP_THRESHOLD_BYTES[g], 0, 0, CITY_FLAG.WINDOW | g]), `${id}@${x},${z} ${d}`).toBe(true);
        }
      });
    });
    expect(groups.size).toBeGreaterThanOrEqual(2);
  });

  it('dünya koordinatı kullanılır: komşu chunk\'ta aynı yerel konum farklı grup verebilir; chunk (cx,cz) ofseti hesaba girer', () => {
    const c = emptyChunk(5, -3);
    putBlock(c, 4, 80, 9, C.WINDOW_WARM);
    const m = mesh(c);
    const g = windowGroup(5 * 16 + 4, 80, -3 * 16 + 9);
    expect(allEqual(faceCity(m, 4, 80, 9, 'px'), [WINDOW_GROUP_THRESHOLD_BYTES[g], 0, 0, CITY_FLAG.WINDOW | g])).toBe(true);
  });

  it('mesh bandı bölümlemesinden bağımsız: kesit-bantlı (işçi) çıktıda aynı mutlak y için aynı grup ve ton', () => {
    const c = emptyChunk(1, 2);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) putBlock(c, x, 20, z, B.STONE);
    putBlock(c, 3, 40, 3, C.WINDOW_COOL);
    putBlock(c, 5, 100, 6, C.WINDOW_WARM);
    putBlock(c, 9, 100, 9, C.NEON_AMBER);
    putBlock(c, 11, 100, 9, C.FACADE_DARK); // neon ile aradaki hücre hava: duvarın −X yüzü o hücreye bakar
    flood(c, 12);
    // düz → kesit telli biçim (yMin 0, 8 kesit)
    const wire = { cx: 1, cz: 2, yMin: 0, sectionCount: 8, s0: 0, sb: [], sl: [], biomeMap: c.biomeMap };
    for (let si = 0; si < 8; si++) {
      wire.sb.push(c.blocks.slice(si * 4096, si * 4096 + 4096));
      wire.sl.push(c.light.slice(si * 4096, si * 4096 + 4096));
    }
    const all = meshChunk(wire, {}, null, { nullNeighbor: 'air', city: true, band: { s0: 0, ns: 8 } });
    const hi = meshChunk(wire, {}, null, { nullNeighbor: 'air', city: true, band: { s0: 5, ns: 2 } });
    const lo = meshChunk(wire, {}, null, { nullNeighbor: 'air', city: true, band: { s0: 1, ns: 3 } });
    const at = (m, x, y, z, d) => faceCity(m, x, y - m.baseY, z, d);
    const g = windowGroup(16 + 5, 100, 32 + 6);
    expect(at(all, 5, 100, 6, 'py')[0]).toEqual([WINDOW_GROUP_THRESHOLD_BYTES[g], 0, 0, CITY_FLAG.WINDOW | g]);
    expect(at(hi, 5, 100, 6, 'py')).toEqual(at(all, 5, 100, 6, 'py'));
    const g2 = windowGroup(16 + 3, 40, 32 + 3);
    expect(at(lo, 3, 40, 3, 'nz')).toEqual(at(all, 3, 40, 3, 'nz'));
    expect(at(lo, 3, 40, 3, 'nz')[0][3]).toBe(CITY_FLAG.WINDOW | g2);
    // neon boyası da bant bağımsız
    expect(at(hi, 11, 100, 9, 'nx')).toEqual(at(all, 11, 100, 9, 'nx'));
    expect(at(all, 11, 100, 9, 'nx')[0].slice(0, 3)).toEqual(NEON_HUE[C.NEON_AMBER]);
  });

  it('şehir modunda pencere dokusu hash\'e göre yatay aynalanır (2 iç mekân varyantı); city kapalıyken aynalanmaz', () => {
    const c = street();
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) putBlock(c, x, 66, z, C.WINDOW_WARM);
    // ayna: 4 köşenin u kümesi aynı ama sıra farklı → köşe-0 u'su 2 değer alır
    const firstU = (m) => {
      const set = new Set();
      const p = m.opaque;
      for (let v = 0; v < p.vertexCount; v += 4) {
        if (p.normal[v * 3 + 1] === 1 && p.pos[v * 3 + 1] === 67) set.add(p.uv[v * 2].toFixed(6));
      }
      return set;
    };
    expect(firstU(mesh(c)).size).toBe(2);
    expect(firstU(mesh(c, null, { city: false })).size).toBe(1);
  });
});

describe('mesherCity: döşeme tekrarını kıran yönelim (yalnız şehir modunda)', () => {
  const orient = (m, y) => {
    const set = new Set();
    const p = m.opaque;
    for (let v = 0; v + 3 < p.vertexCount; v += 4) {
      if (p.normal[v * 3 + 1] !== 1 || p.pos[v * 3 + 1] !== y) continue;
      // köşe-0 → köşe-1 uv yönü: dört döndürme × ayna = 8 farklı yönelim
      const sg = (d) => (d > 1e-7 ? 1 : d < -1e-7 ? -1 : 0);
      set.add([sg(p.uv[(v + 1) * 2] - p.uv[v * 2]), sg(p.uv[(v + 1) * 2 + 1] - p.uv[v * 2 + 1]),
        sg(p.uv[(v + 3) * 2] - p.uv[v * 2]), sg(p.uv[(v + 3) * 2 + 1] - p.uv[v * 2 + 1])].join(','));
    }
    return set;
  };
  const flat = (id) => {
    const c = emptyChunk(0, 0);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) putBlock(c, x, 64, z, id);
    return c;
  };
  it('asfalt ve kaldırım üst yüzü 8 yönelime dağılır; şerit/zebra yönlü kalır; city kapalıyken hiç dönmez', () => {
    expect(orient(mesh(flat(C.ASPHALT)), 65).size).toBe(8);
    expect(orient(mesh(flat(C.SIDEWALK)), 65).size).toBe(8);
    [C.LANE_X, C.LANE_Z, C.ZEBRA_X, C.ZEBRA_Z, C.FACADE_DARK, C.HOLO_PANEL].forEach((id) => expect(orient(mesh(flat(id)), 65).size, 'id ' + id).toBe(1));
    expect(orient(mesh(flat(C.ASPHALT), null, { city: false }), 65).size).toBe(1);
  });

  it('yönelim dünya konumuna bağlı ve belirlenimci (komşu chunk aynı hücre için aynı yönelimi verir)', () => {
    const a = mesh(flat(C.ASPHALT));
    const b = mesh(flat(C.ASPHALT));
    expect(Array.from(a.opaque.uv)).toEqual(Array.from(b.opaque.uv));
  });
});

describe('mesherCity: neon boyası', () => {
  /** Duvar x=8 (z=5..7, y=66) + neon x=6 z=6; duvarın −X yüzleri x=7 hücresine bakar. */
  function scene(extra) {
    const c = street();
    for (let z = 5; z <= 7; z++) putBlock(c, 8, 66, z, C.FACADE_DARK);
    putBlock(c, 6, 66, 6, C.NEON_PINK);
    if (extra) extra(c);
    return c;
  }
  const wallFace = (m, z = 6) => faceCity(m, 8, 66, z, 'nx');

  it('ışık ≥ 8 ve 3×3×3\'te neon: duvar yüzü neon tonuyla boyanır; uzak duvar boyanmaz', () => {
    const c = scene((cc) => {
      glow(cc, 6, 66, 6, 12);
      putBlock(cc, 13, 66, 6, C.FACADE_DARK);
    });
    const m = mesh(c);
    const f = wallFace(m);
    expect(f).toHaveLength(4);
    f.forEach((q) => {
      expect(q.slice(0, 3)).toEqual(NEON_HUE[C.NEON_PINK]);
      expect(q[3] & CITY_FLAG.WET).toBe(0);
      expect(q[3] & CITY_FLAG.WINDOW).toBe(0);
      expect(q[3] & 63).toBeGreaterThan(0);
    });
    // uzak duvar: ışık < 8 → ton yok
    expect(allEqual(faceCity(m, 13, 66, 6, 'nx'), [0, 0, 0, 0])).toBe(true);
  });

  it('eşik: köşe ışığı 7 → boyama yok; 8 → şiddet (8−7)/8; 15 → tam', () => {
    const lvl = (n) => {
      const c = scene((cc) => flood(cc, n));
      return wallFace(mesh(c), 6);
    };
    expect(allEqual(lvl(7), [0, 0, 0, 0])).toBe(true);
    const q8 = lvl(8);
    q8.forEach((q) => {
      expect(q.slice(0, 3)).toEqual(NEON_HUE[C.NEON_PINK]);
      expect(q[3]).toBe(Math.round(((8 - 7) / 8) * 63));
    });
    lvl(15).forEach((q) => expect(q[3]).toBe(63));
    // aradaki seviyeler monoton
    let prev = -1;
    for (let n = 7; n <= 15; n++) {
      const v = lvl(n)[0][3] & 63;
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('en güçlü yayıcı kazanır: ışık bloğu (15, tonsuz) neonu bastırır; neon (12) holo\'yu (8) bastırır; eşitlikte tarama sırası kazanır', () => {
    const base = (cc) => flood(cc, 12);
    const withLamp = mesh(scene((cc) => { base(cc); putBlock(cc, 7, 67, 6, B.LIGHT_BLOCK); }));
    expect(allEqual(wallFace(withLamp), [0, 0, 0, 0])).toBe(true);

    const neonVsHolo = mesh(scene((cc) => { base(cc); putBlock(cc, 7, 65, 6, C.HOLO_PANEL); }));
    wallFace(neonVsHolo).forEach((q) => expect(q.slice(0, 3)).toEqual(NEON_HUE[C.NEON_PINK]));

    const holoOnly = mesh(scene((cc) => { base(cc); putBlock(cc, 6, 66, 6, 0); putBlock(cc, 7, 65, 6, C.HOLO_PANEL); }));
    wallFace(holoOnly).forEach((q) => expect(q.slice(0, 3)).toEqual(NEON_HUE[C.HOLO_PANEL]));

    // eşitlik: pembe (z=6) ve camgöbeği (z=7) → düşük z önce taranır → pembe; yer değişince camgöbeği
    const tieA = mesh(scene((cc) => { base(cc); putBlock(cc, 6, 66, 7, C.NEON_CYAN); }));
    wallFace(tieA).forEach((q) => expect(q.slice(0, 3)).toEqual(NEON_HUE[C.NEON_PINK]));
    const tieB = mesh(scene((cc) => { base(cc); putBlock(cc, 6, 66, 6, C.NEON_CYAN); putBlock(cc, 6, 66, 7, C.NEON_PINK); }));
    wallFace(tieB).forEach((q) => expect(q.slice(0, 3)).toEqual(NEON_HUE[C.NEON_CYAN]));
  });

  it('chunk sınırı: komşu chunk\'taki neon bu chunk\'ın kenar yüzünü boyar (dolgu); komşu yoksa boyamaz', () => {
    const c = emptyChunk(0, 0);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) putBlock(c, x, 64, z, B.STONE);
    putBlock(c, 15, 66, 6, C.FACADE_LIGHT);
    const e = emptyChunk(1, 0);
    putBlock(e, 0, 66, 6, C.NEON_LIME);
    flood(c, 12);
    flood(e, 12);
    const withNb = meshChunk(c, { e }, null, { nullNeighbor: 'air', city: true });
    faceCity(withNb, 15, 66, 6, 'px').forEach((q) => expect(q.slice(0, 3)).toEqual(NEON_HUE[C.NEON_LIME]));
    const e2 = emptyChunk(1, 0);
    flood(e2, 12);
    const noNeon = meshChunk(c, { e: e2 }, null, { nullNeighbor: 'air', city: true });
    expect(allEqual(faceCity(noNeon, 15, 66, 6, 'px'), [0, 0, 0, 0])).toBe(true);
  });

  it('serbest dörtgenler (çapraz bitki, meşale) ve diğer şekiller aCity = 0, tampon boyu tutarlı', () => {
    const c = scene((cc) => {
      flood(cc, 12);
      putBlock(cc, 7, 65, 6, B.TALL_GRASS);
      putBlock(cc, 7, 65, 5, B.TORCH);
      putBlock(cc, 7, 65, 7, B.STAIRS);
    });
    const m = mesh(c);
    PASS_NAMES.forEach((k) => expect(m[k].city.length).toBe(m[k].vertexCount * 4));
    // çapraz bitki: yalnız cutout geçişinde ve sıfır
    const cut = m.cutout;
    for (let v = 0; v < cut.vertexCount; v++) {
      const x = cut.pos[v * 3];
      const z = cut.pos[v * 3 + 2];
      if (x >= 7 && x <= 8 && z >= 6 && z <= 7 && cut.pos[v * 3 + 1] <= 66) {
        expect(Array.from(cut.city.subarray(v * 4, v * 4 + 4))).toEqual([0, 0, 0, 0]);
      }
    }
  });

  it('belirlenimci ve durumsuz: aynı sahne iki kez + araya başka chunk → aynı aCity', () => {
    const mk = () => scene((cc) => { flood(cc, 11); putBlock(cc, 3, 66, 3, C.WINDOW_WARM); });
    const a = mesh(mk());
    mesh(randomOverworldChunk(9), {}, {});
    const b = mesh(mk());
    PASS_NAMES.forEach((k) => {
      expect(Array.from(a[k].city)).toEqual(Array.from(b[k].city));
      expect(Array.from(a[k].pos)).toEqual(Array.from(b[k].pos));
    });
  });
});

describe('mesherCity: öznitelikler, aktarım, geometri', () => {
  it('CITY_MESH_ATTRIBUTES = MESH_ATTRIBUTES + aCity (Uint8×4 normalized); meshAttributes(city) seçer', () => {
    expect(CITY_MESH_ATTRIBUTES).toHaveLength(MESH_ATTRIBUTES.length + 1);
    expect(CITY_MESH_ATTRIBUTES.slice(0, MESH_ATTRIBUTES.length)).toEqual(Array.from(MESH_ATTRIBUTES));
    expect(CITY_ATTRIBUTE).toEqual({
      key: 'city', name: 'aCity', itemSize: 4, normalized: true, type: 'uint8',
    });
    expect(meshAttributes(true)).toBe(CITY_MESH_ATTRIBUTES);
    expect(meshAttributes(false)).toBe(MESH_ATTRIBUTES);
    expect(Object.isFrozen(CITY_MESH_ATTRIBUTES)).toBe(true);
  });

  it('collectTransferables: city açıkken geçiş başına 8, kapalıyken 7 tampon; hepsi ArrayBuffer ve benzersiz', () => {
    const c = scene0();
    const on = collectTransferables(mesh(c));
    const off = collectTransferables(mesh(c, null, { city: false }));
    expect(on).toHaveLength(24);
    expect(off).toHaveLength(21);
    expect(new Set(on).size).toBe(on.length);
    on.forEach((b) => expect(b).toBeInstanceOf(ArrayBuffer));
  });

  it('createCityGeometry: aCity normalized Uint8×4, köşe sayısı = vertexCount; city yoksa eklenmez; boş geçiş null', () => {
    const m = mesh(scene0());
    const g = createCityGeometry(THREE, m.opaque, m.bounds);
    const a = g.getAttribute('aCity');
    expect(a.itemSize).toBe(4);
    expect(a.normalized).toBe(true);
    expect(a.array).toBeInstanceOf(Uint8Array);
    expect(a.count).toBe(m.opaque.vertexCount);
    ['position', 'normal', 'uv', 'aColor', 'aLight', 'aFlags'].forEach((n) => expect(g.getAttribute(n)).toBeTruthy());
    const off = mesh(scene0(), null, { city: false });
    expect(createCityGeometry(THREE, off.opaque, off.bounds).getAttribute('aCity')).toBeUndefined();
    expect(createCityGeometry(THREE, { vertexCount: 0 }, null)).toBeNull();
    // createChunkGeometry (ana diyar yolu) aCity eklemez
    expect(createChunkGeometry(THREE, m.opaque, m.bounds).getAttribute('aCity')).toBeUndefined();
    const dummy = cityDummyAttributes(THREE, new THREE.BufferGeometry(), 3);
    expect(dummy.getAttribute('aCity').normalized).toBe(true);
    g.dispose();
  });

  it('mesherCore ölçüleri mesherCity ile aynı (dolgulu kopya 18×146×18)', () => {
    expect(CITY_PW).toBe(PW);
    expect(CITY_PH).toBe(PH);
    expect(SZ).toBe(CITY_PW);
    expect(SY).toBe(CITY_PW * CITY_PW);
  });

  it('18 şehir bloğu bir arada meshlenir: indeksler geçerli, aCity baytları sınırlı, WET yalnız +Y yüzlerde', () => {
    const c = street();
    const ids = Object.values(C);
    ids.forEach((id, i) => putBlock(c, 1 + (i % 6) * 2, 66, 1 + Math.floor(i / 6) * 2, id));
    flood(c, 12);
    const m = mesh(c);
    PASS_NAMES.forEach((k) => {
      const p = m[k];
      for (let v = 0; v < p.vertexCount; v++) {
        const a = p.city[v * 4 + 3];
        if (a & CITY_FLAG.WET) expect(p.normal[v * 3 + 1]).toBe(1);
        if (a & CITY_FLAG.WINDOW) expect((a & 63)).toBeLessThanOrEqual(2);
      }
      for (let i = 0; i < p.indexCount; i++) expect(p.index[i]).toBeLessThan(p.vertexCount);
    });
    expect(BLOCKS[C.NEON_CYAN].emission).toBe(12);
  });
});

function scene0() {
  const c = street();
  putBlock(c, 4, 66, 4, C.NEON_CYAN);
  putBlock(c, 8, 66, 8, C.WINDOW_WARM);
  flood(c, 11);
  return c;
}

/** Yoğun şehir chunk'ı: yol, 40 neon, ışıklı cephe/pencere kulesi, kaldırım. */
function denseCity() {
  const rnd = lcg(77);
  const c = emptyChunk(2, 3);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = 0; y <= 63; y++) putBlock(c, x, y, z, B.STONE);
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      const road = x < 7 || x > 10;
      putBlock(c, x, 64, z, road ? (x === 3 ? C.LANE_Z : C.ASPHALT) : C.SIDEWALK);
    }
  }
  const ids = [C.FACADE_DARK, C.FACADE_LIGHT, C.WINDOW_DARK, C.WINDOW_WARM, C.WINDOW_COOL, C.WINDOW_WARM, C.WINDOW_COOL];
  for (let y = 65; y < 110; y++) {
    for (let z = 7; z <= 10; z++) {
      for (let x = 7; x <= 10; x++) {
        const edge = x === 7 || x === 10 || z === 7 || z === 10;
        if (!edge) continue;
        putBlock(c, x, y, z, y % 8 === 0 ? C[['NEON_CYAN', 'NEON_PINK', 'NEON_AMBER', 'NEON_LIME'][(x + z) % 4]] : ids[Math.floor(rnd() * ids.length)]);
      }
    }
  }
  for (let i = 0; i < 40; i++) putBlock(c, Math.floor(rnd() * 16), 66 + Math.floor(rnd() * 3), Math.floor(rnd() * 16), C.NEON_PINK + (i % 4));
  for (let i = 0; i < 40; i++) glow(c, Math.floor(rnd() * 16), 66 + Math.floor(rnd() * 3), Math.floor(rnd() * 16), 11);
  return c;
}

describe('mesherCity: başarım (≤ 0.3 ms/chunk ek maliyet)', () => {
  // Not: vitest (vite-node) içe aktarılan bağlamaları nesne özelliği olarak okur → sıcak döngüler düz node'a göre ~3 kat yavaştır; mutlak ms
  // yerine ORAN denetlenir. Düz node'da (_kesifHarness/city_mesher_bench.mjs) aynı chunk: kapalı ≈ 2.2 ms, ek ≈ 0.15 ms (≤ 0.3 ms bütçe = %13).
  it('yoğun şehir chunk: city açık/kapalı süre oranı ≤ 1.13 (≈ ek ≤ 0.29 ms @ 2.2 ms)', () => {
    const c = denseCity();
    const run = (city) => bestOf(4, () => {
      for (let i = 0; i < 6; i++) meshChunk(c, {}, null, { nullNeighbor: 'air', city }); // ısınma
      const N = 12;
      const t0 = performance.now();
      for (let i = 0; i < N; i++) meshChunk(c, {}, null, { nullNeighbor: 'air', city });
      return (performance.now() - t0) / N;
    });
    // serpiştirilmiş ölçüm: JIT/frekans kayması iki tarafa da eşit etkilesin. Yoğun paylaşımlı makinede bir deneme gürültüye düşebilir:
    // gerçek bir regresyon TÜM denemelerde başarısız olur (en iyi deneme geçerli sayılır).
    let bestRatio = Infinity;
    let last = null;
    // qa5: yoğun paylaşımlı makinede (başka işlemler CPU'yu doyururken) tek deneme oranı ±%8 oynayabiliyor; deneme sayısı 4 → 10 (eşik AYNI, geçer geçmez durur)
    for (let attempt = 0; attempt < 10 && bestRatio >= 1.13; attempt++) {
      let off = Infinity;
      let on = Infinity;
      for (let r = 0; r < 2; r++) {
        off = Math.min(off, run(false));
        on = Math.min(on, run(true));
      }
      last = { off, on };
      if (on / off < bestRatio) {
        bestRatio = on / off;
      }
    }
    const m = meshChunk(c, {}, null, { nullNeighbor: 'air', city: true });
    console.log(`[city mesher] kapalı ${last.off.toFixed(3)} ms, açık ${last.on.toFixed(3)} ms, en iyi oran ${bestRatio.toFixed(3)}, ${m.stats.faces} yüz`);
    expect(m.stats.faces).toBeGreaterThan(600);
    expect(bestRatio).toBeLessThan(1.13);
  });
});
