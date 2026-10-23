import { describe, expect, it } from 'vitest';
import {
  ALLRED_S, GREEN_S, MAIN_GREEN_S, PED, SIG, SIGNAL_CYCLE, YELLOW_S, armSignal, armSignalInfo, armSignalLeft, groupsConflictFree, lampInfo, makeSignalPlan, pedSignal, phaseTable, yellowLeft,
} from './trafficLights.js';
import { getCityPlan } from '../cityPlan.js';
import { makeGridNet } from './trafficTestKit.js';

const lights4 = [0, 1, 2, 3].map((d) => ({ dir: d }));
const inter = (o) => Object.assign({ id: 7, type: 'ar', lights: lights4, phase0: 0, cycle: 27 }, o || {});

describe('trafficLights: plan kipleri', () => {
  it('lambasız kavşak free, tüm kollar lambalı fixed, yalnız ana yol lambalı main', () => {
    expect(makeSignalPlan(null, 15, 1).mode).toBe('free');
    expect(makeSignalPlan(inter({ lights: [] }), 15, 1).mode).toBe('free');
    expect(makeSignalPlan(inter(), 15, 1).mode).toBe('fixed');
    // T: K, G, D kolları (1+4+2 = 7) hepsi lambalı
    expect(makeSignalPlan(inter({ lights: [{ dir: 0 }, { dir: 1 }, { dir: 2 }] }), 7, 1).mode).toBe('fixed');
    // arter K-G, sokak D-B: yalnız K-G lambalı
    const m = makeSignalPlan(inter({ lights: [{ dir: 0 }, { dir: 2 }] }), 15, 1);
    expect(m.mode).toBe('main');
    expect(m.main).toBe(0);
    expect(armSignal(m, 1, 5)).toBe(SIG.YIELD);
    expect(armSignal(m, 3, 5)).toBe(SIG.YIELD);
    // mevcut olmayan kola ait lamba yok sayılır
    expect(makeSignalPlan(inter({ lights: [{ dir: 0 }, { dir: 2 }, { dir: 3 }] }), 1 + 4 + 2, 1).lit[3]).toBe(false);
  });

  it('phase0 yoksa tohumdan belirlenimli türetilir ve [0,27) içindedir', () => {
    const a = makeSignalPlan({ id: 11, lights: lights4 }, 15, 99);
    const b = makeSignalPlan({ id: 11, lights: lights4 }, 15, 99);
    const c = makeSignalPlan({ id: 12, lights: lights4 }, 15, 99);
    expect(a.phase0).toBe(b.phase0);
    expect(a.phase0).toBeGreaterThanOrEqual(0);
    expect(a.phase0).toBeLessThan(SIGNAL_CYCLE);
    expect([a.phase0, c.phase0].length).toBe(2);
  });
});

describe('trafficLights: fixed döngü (4 yön, 27 sn)', () => {
  const plan = makeSignalPlan(inter(), 15, 1);

  it('sürelere uyar: A yeşil 10 · sarı 2 · hepsi kırmızı 1,5 · B yeşil 10 · sarı 2 · hepsi kırmızı 1,5', () => {
    expect(GREEN_S + YELLOW_S + ALLRED_S).toBe(13.5);
    expect(SIGNAL_CYCLE).toBe(27);
    const rows = phaseTable(plan);
    expect(rows.length).toBe(6);
    const dur = rows.map((r) => r.to - r.from);
    expect(dur).toEqual([10, 2, 1.5, 10, 2, 1.5]);
    expect(rows[0].A).toBe(SIG.GREEN);
    expect(rows[0].B).toBe(SIG.RED);
    expect(rows[1].A).toBe(SIG.YELLOW);
    expect(rows[2].A).toBe(SIG.RED);
    expect(rows[2].B).toBe(SIG.RED);
    expect(rows[3].B).toBe(SIG.GREEN);
    expect(rows[3].A).toBe(SIG.RED);
  });

  it('karşılıklı kollar (K+G, D+B) hep aynı durumda', () => {
    for (let t = 0; t < 60; t += 0.25) {
      expect(armSignal(plan, 0, t)).toBe(armSignal(plan, 2, t));
      expect(armSignal(plan, 1, t)).toBe(armSignal(plan, 3, t));
    }
  });

  it('değişmez: çatışan gruplar aynı anda yeşil/sarı değil; her grup döngüde tam 10 sn yeşil, 2 sn sarı', () => {
    let a = 0;
    let b = 0;
    let ay = 0;
    for (let t = 0; t < SIGNAL_CYCLE * 4; t += 0.05) {
      expect(groupsConflictFree(plan, t)).toBe(true);
      if (t < SIGNAL_CYCLE) {
        if (armSignal(plan, 0, t) === SIG.GREEN) a += 0.05;
        if (armSignal(plan, 0, t) === SIG.YELLOW) ay += 0.05;
        if (armSignal(plan, 1, t) === SIG.GREEN) b += 0.05;
      }
    }
    expect(a).toBeCloseTo(10, 0);
    expect(b).toBeCloseTo(10, 0);
    expect(ay).toBeCloseTo(2, 0);
  });

  it('tüm kırmızı aralığında her iki grup kırmızı (temizlik); en az 1,5 sn', () => {
    // A sarısı bitiminden B yeşiline: 1,5 sn
    const t0 = 12 - plan.phase0;
    for (let t = t0; t < t0 + 1.49; t += 0.1) {
      expect(armSignal(plan, 0, t)).toBe(SIG.RED);
      expect(armSignal(plan, 1, t)).toBe(SIG.RED);
    }
  });

  it('armSignalLeft: kalan süre sonunda durum değişir ve öncesinde aynı kalır; yellowLeft yalnız sarıda', () => {
    for (let t = 0; t < 60; t += 0.37) {
      const s = armSignal(plan, 0, t);
      const left = armSignalLeft(plan, 0, t);
      expect(left).toBeGreaterThan(0);
      expect(armSignal(plan, 0, t + left - 0.02)).toBe(s);
      expect(armSignal(plan, 0, t + left + 0.02)).not.toBe(s);
      expect(yellowLeft(plan, 0, t) > 0).toBe(s === SIG.YELLOW);
    }
    const info = armSignalInfo(plan, 1, 3.3, {});
    expect(info.state).toBe(armSignal(plan, 1, 3.3));
  });

  it('phase0 kaydırır: aynı t farklı kavşaklarda farklı durum verebilir ama her zaman çakışmasız', () => {
    const seen = new Set();
    for (let p = 0; p < 27; p += 1) {
      const pl = makeSignalPlan(inter({ phase0: p }), 15, 1);
      seen.add(armSignal(pl, 0, 5));
      for (let t = 0; t < 27; t += 0.5) expect(groupsConflictFree(pl, t)).toBe(true);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('negatif ve çok büyük zamanda kararlı (kayıt/yükleme sonrası eşitleme: saf işlev)', () => {
    for (const t of [-100, -0.01, 0, 1e6, 1.2345e7, 3.6e9]) {
      const s = armSignal(plan, 0, t);
      expect([SIG.RED, SIG.GREEN, SIG.YELLOW]).toContain(s);
      expect(armSignal(plan, 0, t)).toBe(s);
    }
  });
});

describe('trafficLights: main kipi (arter × sokak)', () => {
  const plan = makeSignalPlan(inter({ lights: [{ dir: 0 }, { dir: 2 }] }), 15, 1);
  it('ana yol yeşil 15 · sarı 2 · kırmızı 10; yan kollar hep YIELD', () => {
    const rows = phaseTable(plan);
    expect(rows.map((r) => r.to - r.from)).toEqual([MAIN_GREEN_S, YELLOW_S, SIGNAL_CYCLE - MAIN_GREEN_S - YELLOW_S]);
    for (let t = 0; t < 54; t += 0.5) {
      expect(armSignal(plan, 1, t)).toBe(SIG.YIELD);
      expect(armSignal(plan, 3, t)).toBe(SIG.YIELD);
      expect(armSignalLeft(plan, 1, t)).toBe(Infinity);
    }
  });
  it('en az 6 sn minimum yeşil', () => {
    expect(MAIN_GREEN_S).toBeGreaterThanOrEqual(6);
    expect(GREEN_S).toBeGreaterThanOrEqual(6);
  });
});

describe('trafficLights: yaya geçidi yer tutucusu (Faz 4)', () => {
  it('fixed: zebra yalnız dik grup yeşilken WALK/FLASH; kendi grubu yeşilken DONT', () => {
    const plan = makeSignalPlan(inter(), 15, 1);
    for (let t = 0; t < 54; t += 0.1) {
      for (let arm = 0; arm < 4; arm++) {
        const ped = pedSignal(plan, arm, t);
        if (armSignal(plan, arm, t) !== SIG.RED) expect(ped).toBe(PED.DONT);
        const perp = armSignal(plan, (arm + 1) & 3, t);
        if (ped !== PED.DONT) expect(perp).toBe(SIG.GREEN);
      }
    }
    let walks = 0;
    for (let t = 0; t < 27; t += 0.1) if (pedSignal(plan, 0, t) === PED.WALK) walks++;
    expect(walks).toBeGreaterThan(40);
  });
  it('free: DONT (araçlar yol verir)', () => {
    const plan = makeSignalPlan(null, 15, 1);
    expect(pedSignal(plan, 0, 4)).toBe(PED.DONT);
  });
  it('main: ana yol zebrası yalnız ana kırmızıyken', () => {
    const plan = makeSignalPlan(inter({ lights: [{ dir: 0 }, { dir: 2 }] }), 15, 1);
    for (let t = 0; t < 27; t += 0.1) {
      if (pedSignal(plan, 0, t) !== PED.DONT) expect(armSignal(plan, 0, t)).toBe(SIG.RED);
    }
  });
});

describe('trafficLights: erişilebilirlik (renk + konum + şekil + metin)', () => {
  it('her durumun adı, lamba konumu, şekli, simgesi ve metni farklıdır', () => {
    const states = [SIG.RED, SIG.YELLOW, SIG.GREEN, SIG.YIELD];
    const names = new Set();
    const pos = new Set();
    const shapes = new Set();
    const glyphs = new Set();
    const texts = new Set();
    states.forEach((s) => {
      const l = lampInfo(s);
      names.add(l.name);
      pos.add(l.pos);
      shapes.add(l.shape);
      glyphs.add(l.glyph);
      texts.add(l.text);
      expect(l.text.length).toBeGreaterThan(1);
    });
    expect(names.size).toBe(4);
    expect(pos.size).toBe(4);
    expect(shapes.size).toBe(4);
    expect(glyphs.size).toBe(4);
    expect(texts.size).toBe(4);
    expect(lampInfo(SIG.RED).pos).toBe('üst');
    expect(lampInfo(SIG.GREEN).pos).toBe('alt');
  });
  it('durum kodları prop trafik_diregi durumlarıyla aynı (0 kırmızı, 1 yeşil, 2 sarı)', () => {
    expect([SIG.RED, SIG.GREEN, SIG.YELLOW]).toEqual([0, 1, 2]);
  });
});

describe('trafficLights: gerçek şehir kavşakları ve sentetik ızgaralar — çatışan yeşil 0', () => {
  it('şehir planı: tüm kavşaklar 3 döngü boyunca çatışmasız; kip dağılımı makul', () => {
    const plan = getCityPlan(4242);
    const modes = { fixed: 0, main: 0, free: 0 };
    plan.intersections.forEach((it) => {
      const pl = makeSignalPlan(it, it.arms, 4242);
      modes[pl.mode]++;
      for (let t = 0; t < SIGNAL_CYCLE * 3; t += 0.1) expect(groupsConflictFree(pl, t)).toBe(true);
      // lambalar yalnız mevcut kollarda
      pl.lit.forEach((l, a) => { if (l) expect(it.arms & (1 << a)).not.toBe(0); });
    });
    expect(modes.fixed).toBeGreaterThan(20);
    expect(modes.main).toBeGreaterThan(40);
  });
  it('20 ızgara × 1000 döngü: çatışan yeşil 0 (zaman adımı 0,1 sn)', () => {
    let checked = 0;
    for (let g = 0; g < 20; g++) {
      const net = makeGridNet({
        nx: 4 + (g % 4), nz: 4 + ((g >> 1) % 3), every: 2 + (g % 2), seed: 300 + g, cut: [0, 0.15, 0.3][g % 3],
      });
      net.intersections.forEach((it) => {
        const pl = makeSignalPlan(it, it.arms, g);
        for (let t = 5e5; t < 5e5 + SIGNAL_CYCLE * 1000; t += 0.9) {
          if (!groupsConflictFree(pl, t)) throw new Error('çatışan yeşil: ızgara ' + g + ' kavşak ' + it.id + ' t=' + t);
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(1e6);
  });
});
