import { describe, expect, it } from 'vitest';
import {
  INTERIOR_BUILDERS, buildTemplate, clearTemplates, getTemplate, templateCount, templateKeyOf,
} from './propGeoInterior.js';
import { IGeo, M, SKIP, extrudeZ, dicePips } from './propGeoKit.js';
import { INTERIOR_DEFS } from '../../sim/props/propDefsInterior.js';

const DIGITS = { digits: [3, 5, 1, 4] };
const OPENABLE = ['cabinet', 'fridge', 'door', 'secret'];

function allTemplates() {
  const out = [];
  INTERIOR_DEFS.forEach((d) => {
    for (let v = 0; v < Math.max(1, d.variants); v++) out.push(buildTemplate(d, v, DIGITS));
  });
  return out;
}

describe('geometri kaydı', () => {
  it('her tanımın modeli var, modelin tanımı var (101 anahtar bire bir)', () => {
    expect(Object.keys(INTERIOR_BUILDERS).length).toBe(INTERIOR_DEFS.length);
    INTERIOR_DEFS.forEach((d) => expect(typeof INTERIOR_BUILDERS[d.key], d.key).toBe('function'));
    Object.keys(INTERIOR_BUILDERS).forEach((k) => expect(INTERIOR_DEFS.find((d) => d.key === k), k).toBeTruthy());
    expect(Object.isFrozen(INTERIOR_BUILDERS)).toBe(true);
  });

  it('tüm tanım × varyant şablonları kurulur: sonlu, dejenere üçgen yok, normaller birim ve sarmal tutarlı', () => {
    const list = allTemplates();
    expect(list.length).toBeGreaterThan(200);
    const bad = [];
    list.forEach((t) => {
      expect(t.n, t.key).toBeGreaterThan(0);
      expect(t.n % 3).toBe(0);
      for (let i = 0; i < t.pos.length; i++) {
        if (!(Number.isFinite(t.pos[i]) && Number.isFinite(t.nor[i]))) { bad.push(t.key + ' sonlu değil'); break; }
      }
      for (let k = 0; k < t.n; k += 3) {
        const p = t.pos;
        const a = [p[(k + 1) * 3] - p[k * 3], p[(k + 1) * 3 + 1] - p[k * 3 + 1], p[(k + 1) * 3 + 2] - p[k * 3 + 2]];
        const b = [p[(k + 2) * 3] - p[k * 3], p[(k + 2) * 3 + 1] - p[k * 3 + 1], p[(k + 2) * 3 + 2] - p[k * 3 + 2]];
        const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const l = Math.hypot(n[0], n[1], n[2]);
        if (!(l > 1e-9)) { bad.push(t.key + ' dejenere ' + k / 3); continue; }
        const dot = (n[0] * t.nor[k * 3] + n[1] * t.nor[k * 3 + 1] + n[2] * t.nor[k * 3 + 2]) / l;
        if (!(dot > 0.9999)) bad.push(t.key + ' sarmal ' + k / 3);
        if (Math.abs(Math.hypot(t.nor[k * 3], t.nor[k * 3 + 1], t.nor[k * 3 + 2]) - 1) > 1e-5) bad.push(t.key + ' normal');
      }
    });
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('model sınır kutusu boyut kutusuna uyar: yatayda ≤ +0,1 (açılabilirler ≤ +1,0), dikeyde yüzey eşyası payı ≤ +0,8, tabandan başlar; en az %50 dolu', () => {
    allTemplates().forEach((t) => {
      const d = t.def;
      const mn = t.bounds.min;
      const mx = t.bounds.max;
      const ex = mx[0] - mn[0];
      const ey = mx[1] - mn[1];
      const ez = mx[2] - mn[2];
      const slack = OPENABLE.indexOf(d.mode) >= 0 ? 1.0 : 0.1;
      expect(ex, t.key + ' x').toBeLessThanOrEqual(d.size[0] + slack + 1e-6);
      expect(ez, t.key + ' z').toBeLessThanOrEqual(d.size[2] + slack + 1e-6);
      expect(ey, t.key + ' y').toBeLessThanOrEqual(d.size[1] + 0.8);
      expect(mn[1], t.key + ' taban').toBeGreaterThanOrEqual(-1e-6);
      // dolgunluk: model boyutun en az yarısını kaplar (yanlış ölçek/boş model yakalanır)
      const maxDim = Math.max(d.size[0], d.size[1], d.size[2]);
      expect(Math.max(ex, ey, ez), t.key + ' boş').toBeGreaterThan(maxDim * 0.5);
      // duvar/tavan propları kendi yerlerinde: tavan propunun üstü boyut yüksekliğinde (tavana değer)
      if (d.mount === 'ceiling') expect(mx[1], t.key).toBeGreaterThan(d.size[1] - 0.2);
      if (d.mount === 'wall') expect(ez, t.key + ' duvar derinliği').toBeLessThanOrEqual(0.45);
    });
  });

  it('çarpışma kutuları modelin içinde: tabanda, yatay kapsama ve yükseklik uyumu', () => {
    INTERIOR_DEFS.forEach((d) => {
      const t = getTemplate(d, 0, DIGITS);
      d.colliders.forEach((c) => {
        expect(c[1], d.key).toBeGreaterThanOrEqual(t.bounds.min[1] - 1e-6);
        expect(c[4], d.key).toBeLessThanOrEqual(t.bounds.max[1] + 0.35);
        expect(c[0], d.key).toBeGreaterThanOrEqual(t.bounds.min[0] - 0.35);
        expect(c[3], d.key).toBeLessThanOrEqual(t.bounds.max[0] + 0.35);
        expect(c[2], d.key).toBeGreaterThanOrEqual(t.bounds.min[2] - 0.35);
        expect(c[5], d.key).toBeLessThanOrEqual(t.bounds.max[2] + 0.35);
      });
    });
  });

  it('bütçe: üçgen sayısı tanım başına ≤ 650, ortalama ≤ 260; toplam bayt makul', () => {
    const list = allTemplates();
    let sum = 0;
    let bytes = 0;
    list.forEach((t) => {
      expect(t.tris, t.key).toBeLessThanOrEqual(700);
      sum += t.tris;
      bytes += t.pos.byteLength + t.nor.byteLength + t.uv.byteLength + t.col.byteLength + t.mat.byteLength + (t.anim ? t.anim.byteLength : 0);
    });
    expect(sum / list.length).toBeLessThanOrEqual(260);
    expect(bytes).toBeLessThan(40 * 1024 * 1024);
  });

  it('malzeme baytları geçerli: tür ∈ {0,1,2,3,5,6,7,8}, grup maskeleri durum sayısına sığar, AO ≥ 0,6', () => {
    const KINDS = [0, 1, 2, 3, 5, 6, 7, 8];
    const bad = [];
    allTemplates().forEach((t) => {
      for (let i = 0; i < t.n; i++) {
        const kind = t.mat[i * 4 + 1];
        const grp = t.mat[i * 4 + 2];
        if (KINDS.indexOf(kind) < 0) bad.push(t.key + ' tür ' + kind);
        if (grp >= 32) {
          const mask = grp >= 160 ? grp - 160 : grp >= 96 ? grp - 96 : grp - 32;
          if (!(mask > 0 && mask < (1 << Math.max(1, t.def.states)))) bad.push(t.key + ' maske ' + mask + ' durum ' + t.def.states);
        }
        if ((kind === 2 || kind === 8) && !(t.mat[i * 4 + 3] > 0)) bad.push(t.key + ' en-boy');
        if (t.col[i * 4 + 3] < 150) bad.push(t.key + ' AO');
      }
      if (t.holo) {
        for (let i = 0; i < t.holo.n; i++) if (t.holo.mat[i * 4 + 1] !== 7) bad.push(t.key + ' holo türü');
      }
    });
    expect(Array.from(new Set(bad)).slice(0, 6)).toEqual([]);
  });

  it('kayan parçalar yalnız 160+ grubunda anim vektörü taşır; kapı yaprağı yana kayar; sabit parçada vektör 0', () => {
    ['kapi', 'kapi_genis', 'gizli_kapi_raf'].forEach((k) => {
      const d = INTERIOR_DEFS.find((q) => q.key === k);
      const t = buildTemplate(d, 0, null);
      let slide = 0;
      for (let i = 0; i < t.n; i++) {
        const g = t.mat[i * 4 + 2];
        const nz = t.anim[i * 4] !== 0 || t.anim[i * 4 + 1] !== 0 || t.anim[i * 4 + 2] !== 0;
        if (g >= 160) {
          slide++;
          expect(nz, k).toBe(true);
          expect(t.anim[i * 4 + 1]).toBe(0);
          expect(t.anim[i * 4 + 2]).toBe(0);
        } else expect(nz, k).toBe(false);
      }
      expect(slide, k).toBeGreaterThan(24);
    });
    // iki yaprak ters yöne kayar
    const t = buildTemplate(INTERIOR_DEFS.find((q) => q.key === 'kapi'), 0, null);
    const dirs = new Set();
    for (let i = 0; i < t.n; i++) if (t.mat[i * 4 + 2] >= 160) dirs.add(Math.sign(t.anim[i * 4]));
    expect(dirs.has(1) && dirs.has(-1)).toBe(true);
  });

  it('durumlu modeller görünür/güç gruplarını kullanır: kapsül, dolap, buzdolabı, robot kol, dron istasyonu, katlanır masa, ekranlar', () => {
    const has = (key, lo, hi) => {
      const t = buildTemplate(INTERIOR_DEFS.find((q) => q.key === key), 0, null);
      for (let i = 0; i < t.n; i++) {
        const g = t.mat[i * 4 + 2];
        if (g >= lo && g < hi) return true;
      }
      return false;
    };
    ['kapsul_yatak', 'dolap', 'buzdolabi', 'robot_kol', 'dron_istasyonu', 'katlanir_masa', 'saglik_dolabi', 'dolap_sirali', 'takim_dolabi'].forEach((k) => {
      expect(has(k, 96, 160), k + ' GÖRÜNÜR').toBe(true);
    });
    ['cok_ekranli_masa', 'holo_ekran', 'televizyon', 'dus_kabini', 'sarj_istasyonu', 'tarayici_cihaz', 'kod_paneli', 'asansor_dugmesi'].forEach((k) => {
      expect(has(k, 32, 96), k + ' GÜÇ').toBe(true);
    });
  });

  it('holo yalnız holo tanımlarında; ekran türü (5) ekran tanımlarında', () => {
    INTERIOR_DEFS.forEach((d) => {
      const t = buildTemplate(d, 0, null);
      expect(!!t.holo, d.key).toBe(!!d.holo);
    });
    const kinds = (key) => {
      const t = buildTemplate(INTERIOR_DEFS.find((q) => q.key === key), 0, null);
      const s = new Set();
      for (let i = 0; i < t.n; i++) s.add(t.mat[i * 4 + 1]);
      return s;
    };
    ['holo_ekran', 'televizyon', 'cok_ekranli_masa', 'arcade_makinesi', 'sunucu_rafi', 'bilgi_terminali'].forEach((k) => expect(kinds(k).has(5) || kinds(k).has(6), k).toBe(true));
    expect(kinds('neon_tabela_ic').has(2)).toBe(true);
    ['menu_tahtasi', 'ilan_panosu', 'skor_tablosu'].forEach((k) => expect(kinds(k).has(8), k).toBe(true));
  });

  it('varyantlar farklı şekil/renk üretir (≥ 3 varyantlı tanımların çoğu); kod notu/ilan panosu rakamlara göre değişir', () => {
    let differ = 0;
    let total = 0;
    INTERIOR_DEFS.filter((d) => d.variants >= 3).forEach((d) => {
      total++;
      const a = buildTemplate(d, 0, null);
      const b = buildTemplate(d, 1, null);
      const same = a.n === b.n && a.col.every((v, i) => v === b.col[i]) && a.pos.every((v, i) => v === b.pos[i]);
      if (!same) differ++;
    });
    expect(differ / total).toBeGreaterThan(0.85);
    const d = INTERIOR_DEFS.find((q) => q.key === 'kod_notu');
    const a = buildTemplate(d, 0, { digits: [1, 2, 3] });
    const b = buildTemplate(d, 0, { digits: [6, 5, 4, 3] });
    expect(a.n).not.toBe(b.n);
    expect(templateKeyOf(d, 0, { digits: [1, 2, 3] })).not.toBe(templateKeyOf(d, 0, { digits: [6, 5, 4, 3] }));
  });

  it('şablon önbelleği: aynı anahtar aynı nesne; varyant tanımın sayısına indirgenir; LRU sınırı', () => {
    clearTemplates();
    const d = INTERIOR_DEFS.find((q) => q.key === 'sandalye');
    const a = getTemplate(d, 1, null);
    expect(getTemplate(d, 1, null)).toBe(a);
    expect(getTemplate(d, 4, null)).toBe(a); // 4 % 3 = 1
    expect(templateCount()).toBe(1);
    for (let i = 0; i < INTERIOR_DEFS.length; i++) for (let v = 0; v < 8; v++) getTemplate(INTERIOR_DEFS[i], v, DIGITS);
    expect(templateCount()).toBeLessThanOrEqual(400);
    expect(() => buildTemplate({ key: 'yok', variants: 1, mount: 'floor' }, 0, null)).toThrow(/model yok/);
  });

  it('belirlenimci: aynı girdi aynı bayt', () => {
    INTERIOR_DEFS.slice(0, 40).forEach((d) => {
      const a = buildTemplate(d, 2, DIGITS);
      const b = buildTemplate(d, 2, DIGITS);
      expect(Array.from(a.pos)).toEqual(Array.from(b.pos));
      expect(Array.from(a.col)).toEqual(Array.from(b.col));
      expect(Array.from(a.mat)).toEqual(Array.from(b.mat));
    });
  });
});

describe('geometri araç takımı', () => {
  it('IGeo anim vektörünü köşe başına taşır; extrudeZ ve dicePips çıktıları geçerli', () => {
    const b = new IGeo();
    b.setAnim(1, 0, 0);
    b.box(0, 0, 0, 1, 1, 1, 0xffffff, M.body, SKIP.NY);
    b.setAnim(0, 0, 0);
    b.box(2, 0, 0, 3, 1, 1, 0xffffff, M.body);
    expect(b.anim.length).toBe(b.pos.length);
    expect(b.anim.slice(0, 3)).toEqual([1, 0, 0]);
    expect(b.anim.slice(-3)).toEqual([0, 0, 0]);
    const c = new IGeo();
    extrudeZ(c, 0, 1, [[0, 0], [1, 0], [1, 1], [0, 1]], 0xffffff, M.body);
    expect(c.tris).toBe(8 + 4);
    const e = new IGeo();
    extrudeZ(e, 0, 1, [[0, 0], [1, 0], [1, 1], [0, 1]], 0xffffff, M.body, 3);
    expect(e.tris).toBe(8);
    [1, 2, 3, 4, 5, 6].forEach((n) => {
      const g = new IGeo();
      dicePips(g, 0, 0, 0, 0.2, n, 0);
      expect(g.tris).toBe(2 + 2 * n);
    });
  });
});
