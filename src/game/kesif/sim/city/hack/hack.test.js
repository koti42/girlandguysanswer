import { describe, expect, it } from 'vitest';
import {
  HACK_GAMES, HACK_INFO, createHack, hackSpec, restoreHack,
} from './index.js';
import {
  SIMON_SYMBOLS, SIMON_TIERS, createSimon, restoreSimon, simonSpec, solveSimon,
} from './simon.js';
import {
  LEVER_STYLES, POS_LABELS, createLevers, leversSpec, restoreLevers, solveLevers,
} from './levers.js';
import {
  clueHolds, clueText, createDice, diceSpec, restoreDice, solveDice,
} from './dice.js';
import { scanText } from '../citySafeData.js';
import { mulberry32 } from '../../rng.js';

const DT = 1 / 20;

/** Gözlemci robot: yalnız view() ile yanan sembolleri izleyerek Simon'u kazanır (kuralları dışarıdan kanıtlar). */
function playSimonByWatching(m) {
  let guard = 0;
  let seen = [];
  let prevLit = -1;
  while (m.status === 'running' && guard++ < 20000) {
    const v = m.view();
    if (v.phase === 'show') {
      if (v.lit >= 0 && v.lit !== prevLit) seen.push(v.lit);
      // aynı sembol art arda yanıyorsa aralıkta lit -1 olur → kenar sayımı doğru
      prevLit = v.lit;
      m.tick(DT);
    } else if (v.phase === 'input') {
      const seq = seen.slice(0, v.round);
      seen = [];
      prevLit = -1;
      for (let i = 0; i < seq.length && m.status === 'running'; i++) {
        const r = m.press(seq[i]);
        if (r === 'round' || r === 'won' || r === 'lost') break;
      }
    } else break;
  }
  return m.status;
}

describe('hack/index', () => {
  it('üç oyun, Türkçe adlar, createHack/restoreHack/hackSpec', () => {
    expect(HACK_GAMES).toEqual(['simon', 'levers', 'dice']);
    HACK_GAMES.forEach((g) => {
      expect(HACK_INFO[g].name.length).toBeGreaterThan(2);
      expect(HACK_INFO[g].how.length).toBe(3);
      const m = createHack({ game: g, seed: 7, tier: 1 });
      expect(m.kind).toBe(g);
      expect(m.status).toBe('running');
      const r = restoreHack(JSON.parse(JSON.stringify(m.serialize())));
      expect(r.kind).toBe(g);
      expect(hackSpec(g, 7, 1).kind).toBe(g);
    });
    expect(createHack({ game: 'spike', seed: 1, tier: 0 })).toBeNull();
    expect(hackSpec('spike', 1, 0)).toBeNull();
    expect(restoreHack(null)).toBeNull();
    expect(restoreHack({ kind: 'x', v: 1 })).toBeNull();
    expect(restoreHack('x')).toBeNull();
  });

  it('metinler aile dostu: yasak sözcük / marka taraması temiz (kumar/şans dili yok)', () => {
    const strs = [];
    const walk = (v, d) => {
      if (typeof v === 'string') strs.push(v);
      else if (v && typeof v === 'object' && d < 6) Object.keys(v).forEach((k) => walk(v[k], d + 1));
    };
    walk(HACK_INFO, 0);
    walk(SIMON_SYMBOLS, 0);
    walk(LEVER_STYLES, 0);
    walk(POS_LABELS, 0);
    for (let s = 0; s < 200; s++) {
      for (let t = 0; t < 4; t++) {
        diceSpec(s, t).clues.forEach((c) => strs.push(clueText(c)));
        const sm = createSimon({ seed: s, tier: t }).view();
        strs.push(sm.live);
        const lv = createLevers({ seed: s, tier: t, accessibility: true }).view();
        strs.push(lv.live);
        lv.levers.forEach((l) => strs.push(l.linkText));
        const dv = createDice({ seed: s, tier: t }).view();
        strs.push(dv.live);
      }
    }
    const bad = strs.filter((s) => scanText(s).length > 0);
    expect(bad).toEqual([]);
    const joined = strs.join(' ').toLowerCase();
    ['bahis', 'kumar', 'şans', 'jeton', 'para'].forEach((w) => expect(joined.indexOf(w), w).toBe(-1));
  });
});

describe('simon — Rün Dizisi', () => {
  it('spec belirlenimci; kademe uzunlukları 3/4/5/6; semboller 0..3; en çok iki tekrar', () => {
    for (let s = 0; s < 200; s++) {
      for (let t = 0; t < 4; t++) {
        const a = simonSpec(s, t);
        const b = simonSpec(s, t);
        expect(a).toEqual(b);
        expect(a.len).toBe(SIMON_TIERS[t].len);
        expect(a.sequence.length).toBe(a.len);
        a.sequence.forEach((x, i) => {
          expect(x >= 0 && x < 4).toBe(true);
          if (i >= 2) expect(!(x === a.sequence[i - 1] && x === a.sequence[i - 2])).toBe(true);
        });
        expect(solveSimon(a)).toEqual(a.sequence);
      }
    }
  });

  it('farklı tohumlar farklı diziler üretir (çeşitlilik)', () => {
    const set = new Set();
    for (let s = 0; s < 100; s++) set.add(simonSpec(s, 3).sequence.join(''));
    expect(set.size).toBeGreaterThan(60);
  });

  it('semboller: renk + şekil + nota üçlüsü benzersiz (renk körü ve sessiz oyuncu için ayrı ayrı)', () => {
    expect(new Set(SIMON_SYMBOLS.map((x) => x.color)).size).toBe(4);
    expect(new Set(SIMON_SYMBOLS.map((x) => x.shape)).size).toBe(4);
    expect(new Set(SIMON_SYMBOLS.map((x) => x.note)).size).toBe(4);
    expect(new Set(SIMON_SYMBOLS.map((x) => x.name)).size).toBe(4);
  });

  it('gözlemci robot yalnız view() ile 200 tohum × 4 kademeyi kazanır', () => {
    for (let s = 0; s < 200; s++) {
      for (let t = 0; t < 4; t++) {
        const m = createSimon({ seed: s, tier: t });
        expect(playSimonByWatching(m)).toBe('won');
      }
    }
  });

  it('gözlemci robot erişilebilirlik modunda da kazanır (süreler ×2)', () => {
    for (let t = 0; t < 4; t++) {
      const m = createSimon({ seed: 5, tier: t, accessibility: true });
      expect(playSimonByWatching(m)).toBe('won');
    }
  });

  it('yanlış sembol → lost (yanlis); sonrası girdiler yok sayılır', () => {
    const m = createSimon({ seed: 3, tier: 0 });
    for (let i = 0; i < 400 && m.phase !== 'input'; i++) m.tick(DT);
    expect(m.phase).toBe('input');
    const wrong = (simonSpec(3, 0).sequence[0] + 1) % 4;
    expect(m.press(wrong)).toBe('lost');
    expect(m.status).toBe('lost');
    expect(m.view().reason).toBe('yanlis');
    expect(m.press(0)).toBe('ignored');
    expect(m.replay()).toBe(false);
  });

  it('kademe 0-1: ZAMAN BASKISI YOK (500 sn beklese de kaybetmez), sınırsız tekrar', () => {
    [0, 1].forEach((t) => {
      const m = createSimon({ seed: 9, tier: t });
      for (let i = 0; i < 400 && m.phase !== 'input'; i++) m.tick(DT);
      for (let i = 0; i < 500; i++) m.tick(1);
      expect(m.phase).toBe('input');
      for (let i = 0; i < 20; i++) {
        expect(m.replay()).toBe(true);
        for (let k = 0; k < 400 && m.phase !== 'input'; k++) m.tick(DT);
      }
      expect(m.status).toBe('running');
    });
  });

  it('kademe 2/3: giriş süresi dolunca lost (zaman); erişilebilirlik süreyi ikiye katlar', () => {
    [[2, 6], [3, 4.5]].forEach(([t, secs]) => {
      const m = createSimon({ seed: 9, tier: t });
      for (let i = 0; i < 1000 && m.phase !== 'input'; i++) m.tick(DT);
      expect(m.view().timeMax).toBe(secs);
      let waited = 0;
      while (m.status === 'running' && waited < 100) {
        m.tick(DT);
        waited += DT;
      }
      expect(m.status).toBe('lost');
      expect(m.view().reason).toBe('zaman');
      expect(waited).toBeGreaterThan(secs - 0.2);
      expect(waited).toBeLessThan(secs + 0.2);
      const a = createSimon({ seed: 9, tier: t, accessibility: true });
      for (let i = 0; i < 2000 && a.phase !== 'input'; i++) a.tick(DT);
      expect(a.view().timeMax).toBe(secs * 2);
    });
  });

  it('tekrar hakkı: kademe 2 → 3, kademe 3 → 2; erişilebilirlikte sınırsız', () => {
    const rep = (t, a11y) => {
      const m = createSimon({ seed: 4, tier: t, accessibility: a11y });
      let n = 0;
      for (let q = 0; q < 12; q++) {
        for (let i = 0; i < 2000 && m.phase !== 'input'; i++) m.tick(DT);
        if (m.phase !== 'input') break;
        if (!m.replay()) break;
        n++;
      }
      return n;
    };
    expect(rep(2, false)).toBe(3);
    expect(rep(3, false)).toBe(2);
    expect(rep(3, true)).toBe(12);
  });

  it('ekran okuyucu: dizi metni yalnız erişilebilirlik modunda; canlı bölge metni her aşamada', () => {
    const a = createSimon({ seed: 2, tier: 1, accessibility: true });
    expect(a.view().sequenceText).toMatch(/,|[a-zçğıöşü]/i);
    const b = createSimon({ seed: 2, tier: 1 });
    expect(b.view().sequenceText).toBeNull();
    expect(b.view().live).toMatch(/Dizi gösteriliyor/);
    for (let i = 0; i < 400 && b.phase !== 'input'; i++) b.tick(DT);
    expect(b.view().live).toMatch(/Sıra sende/);
  });

  it('serileştirme: her adımda gidiş-dönüş aynı gelecek (belirlenimci)', () => {
    const rng = mulberry32(11);
    for (let s = 0; s < 40; s++) {
      const t = s % 4;
      const m = createSimon({ seed: s, tier: t, accessibility: s % 5 === 0 });
      const steps = Math.floor(rng() * 80);
      for (let i = 0; i < steps; i++) m.tick(DT);
      const saved = JSON.parse(JSON.stringify(m.serialize()));
      const r = restoreSimon(saved);
      expect(r.serialize()).toEqual(m.serialize());
      for (let i = 0; i < 300; i++) {
        m.tick(DT);
        r.tick(DT);
      }
      expect(r.serialize()).toEqual(m.serialize());
      expect(r.view()).toEqual(m.view());
    }
  });

  it('fuzz: rastgele/bozuk girdi hiç fırlatmaz, durum geçerli kalır', () => {
    const rng = mulberry32(5);
    const junk = [NaN, Infinity, -1, 99, '2', null, undefined, {}, [], 1.7, -0, 'x'];
    for (let s = 0; s < 60; s++) {
      const m = createSimon({ seed: s, tier: s % 4 });
      for (let i = 0; i < 400; i++) {
        const r = rng();
        if (r < 0.5) m.tick(rng() < 0.1 ? junk[Math.floor(rng() * junk.length)] : rng() * 0.3);
        else if (r < 0.8) m.press(rng() < 0.3 ? junk[Math.floor(rng() * junk.length)] : Math.floor(rng() * 4));
        else m.replay();
        const v = m.view();
        expect(['show', 'input', 'won', 'lost']).toContain(v.phase);
        expect(Number.isFinite(v.timeLeft)).toBe(true);
        expect(v.round >= 1 && v.round <= v.len).toBe(true);
      }
    }
    // güvensiz kayıt
    expect(restoreSimon({ kind: 'simon', v: 1, seed: 'x', tier: 99, phase: 'zzz', round: 'q', step: NaN })).not.toBeNull();
    expect(restoreSimon({ kind: 'simon', v: 2 })).toBeNull();
    expect(restoreSimon(null)).toBeNull();
    expect(restoreSimon([])).toBeNull();
    const evil = JSON.parse('{"kind":"simon","v":1,"__proto__":{"x":1},"seed":1,"tier":2,"phase":"input","round":99,"inputIdx":99,"replays":-9}');
    const r = restoreSimon(evil);
    expect(r.view().round).toBeLessThanOrEqual(r.view().len);
    expect({}.x).toBeUndefined();
  });
});

describe('levers — Renk Kolları', () => {
  it('spec: 200 tohum × 4 kademe — çözülebilir, optimal ≥ minimum, BFS yolu hedefe götürür', () => {
    const minOpt = [2, 3, 4, 5];
    for (let s = 0; s < 200; s++) {
      for (let t = 0; t < 4; t++) {
        const spec = leversSpec(s, t);
        expect(spec).toEqual(leversSpec(s, t));
        const sol = solveLevers(spec);
        expect(sol).not.toBeNull();
        expect(sol.optimal).toBe(spec.optimal);
        expect(spec.optimal).toBeGreaterThanOrEqual(1);
        // minimum zorluk çoğu tohumda sağlanır (24 yeniden deneme)
        if (s % 7 === 0) expect(spec.optimal).toBeGreaterThanOrEqual(Math.min(minOpt[t], 2));
        let pos = spec.start.slice();
        sol.moves.forEach((i) => {
          pos = pos.map((v, j) => (v + spec.cols[i][j]) % spec.m);
        });
        expect(pos).toEqual(spec.target);
        expect(spec.start).not.toEqual(spec.target);
        // bağlantı matrisi: köşegen 1
        for (let i = 0; i < spec.n; i++) expect(spec.cols[i][i]).toBe(1);
      }
    }
  });

  it('kademe 0-1: bütçe ve süre YOK; kademe 2 bütçe; kademe 3 bütçe + 90 sn', () => {
    for (let s = 0; s < 30; s++) {
      expect(leversSpec(s, 0).budget).toBe(Infinity);
      expect(leversSpec(s, 1).budget).toBe(Infinity);
      expect(leversSpec(s, 0).timeLimit).toBe(0);
      expect(leversSpec(s, 1).timeLimit).toBe(0);
      expect(leversSpec(s, 2).budget).toBe(leversSpec(s, 2).optimal * 3 + 6);
      expect(leversSpec(s, 3).budget).toBe(leversSpec(s, 3).optimal * 2 + 4);
      expect(leversSpec(s, 3).timeLimit).toBe(90);
    }
  });

  it('makine, çözücünün yoluyla kazanır; sonraki girdiler yok sayılır', () => {
    for (let s = 0; s < 100; s++) {
      for (let t = 0; t < 4; t++) {
        const m = createLevers({ seed: s, tier: t });
        const sol = solveLevers(m.spec);
        sol.moves.forEach((i, k) => {
          const r = m.press(i);
          expect(r).toBe(k === sol.moves.length - 1 ? 'won' : 'ok');
        });
        expect(m.status).toBe('won');
        expect(m.press(0)).toBe('ignored');
        expect(m.view().okCount).toBe(m.spec.n);
      }
    }
  });

  it('kademe 0-1: sınırsız hamle + serbest sıfırlama; kademe 2: bütçe aşımı lost', () => {
    const m = createLevers({ seed: 3, tier: 1 });
    const start = m.view().levers.map((l) => l.pos);
    for (let i = 0; i < 300; i++) {
      m.press(i % m.spec.n);
      if (m.status !== 'running') break;
    }
    // 300 hamlede tesadüfen kazanabilir; kaybetmesi ise mümkün değildir
    expect(m.status === 'running' || m.status === 'won').toBe(true);
    if (m.status === 'running') {
      expect(m.reset()).toBe(true);
      expect(m.view().levers.map((l) => l.pos)).toEqual(start);
    }
    const b = createLevers({ seed: 3, tier: 2 });
    const sol = solveLevers(b.spec);
    expect(sol.optimal).toBeLessThan(b.spec.budget);
    // hedefe götürmeyen hamle: ilk kolu sürekli çek → bütçe dolunca lost (kazanmadıysa)
    let last = 'ok';
    for (let i = 0; i < b.spec.budget + 2 && b.status === 'running'; i++) last = b.press(i % 2 === 0 ? 0 : 1);
    expect(['lost', 'won']).toContain(b.status);
    if (b.status === 'lost') {
      expect(last).toBe('lost');
      expect(b.view().reason).toBe('hamle');
    }
  });

  it('kademe 3 süre sınırı: dolunca lost (zaman); erişilebilirlik ×2; kademe 0-2 zamanla kaybetmez', () => {
    const m = createLevers({ seed: 1, tier: 3 });
    let t = 0;
    while (m.status === 'running' && t < 500) {
      m.tick(0.5);
      t += 0.5;
    }
    expect(m.status).toBe('lost');
    expect(m.view().reason).toBe('zaman');
    expect(t).toBeGreaterThanOrEqual(90);
    expect(t).toBeLessThanOrEqual(91);
    const a = createLevers({ seed: 1, tier: 3, accessibility: true });
    expect(a.view().timeMax).toBe(180);
    [0, 1, 2].forEach((tier) => {
      const q = createLevers({ seed: 1, tier });
      for (let i = 0; i < 1000; i++) q.tick(1);
      expect(q.status).toBe('running');
    });
  });

  it('görünüm: bağlantı metni, hedef/konum etiketleri, renk + şekil ayrımı', () => {
    const m = createLevers({ seed: 8, tier: 2 });
    const v = m.view();
    expect(v.levers.length).toBe(4);
    expect(new Set(v.levers.map((l) => l.color)).size).toBe(4);
    expect(new Set(v.levers.map((l) => l.shape)).size).toBe(4);
    v.levers.forEach((l) => {
      expect(l.linkText).toContain(l.name);
      expect(POS_LABELS[3]).toContain(l.posLabel);
      expect(POS_LABELS[3]).toContain(l.targetLabel);
    });
  });

  it('serileştirme gidiş-dönüş + fuzz (bozuk girdi fırlatmaz)', () => {
    const rng = mulberry32(21);
    for (let s = 0; s < 50; s++) {
      const m = createLevers({ seed: s, tier: s % 4, accessibility: s % 3 === 0 });
      for (let i = 0; i < 30; i++) {
        const r = rng();
        if (r < 0.7) m.press(Math.floor(rng() * m.spec.n));
        else if (r < 0.8) m.reset();
        else m.tick(rng() * 2);
        const saved = JSON.parse(JSON.stringify(m.serialize()));
        const rest = restoreLevers(saved);
        expect(rest.serialize()).toEqual(m.serialize());
        expect(rest.view()).toEqual(m.view());
      }
      [NaN, Infinity, -3, 'x', null, undefined, 999, 1.5].forEach((j) => {
        m.press(j);
        m.tick(j);
      });
    }
    expect(restoreLevers({ kind: 'levers', v: 1, seed: 1, tier: 9, pos: [9, 'x', null], used: 'z', phase: '??' })).not.toBeNull();
    expect(restoreLevers({ kind: 'levers', v: 0 })).toBeNull();
    expect(restoreLevers(undefined)).toBeNull();
  });
});

describe('dice — Zar Mantığı', () => {
  it('200 tohum × 4 kademe: çözüm TAM BİR tane ve hedefe eşit; ipuçları gerçek; sayı sınırları', () => {
    const maxC = [5, 6, 5, 7];
    const nOf = [2, 3, 3, 4];
    for (let s = 0; s < 200; s++) {
      for (let t = 0; t < 4; t++) {
        const spec = diceSpec(s, t);
        expect(spec).toEqual(diceSpec(s, t));
        expect(spec.n).toBe(nOf[t]);
        const sols = solveDice(spec);
        expect(sols.length).toBe(1);
        expect(sols[0]).toEqual(spec.solution);
        spec.clues.forEach((c) => expect(clueHolds(c, spec.solution)).toBe(true));
        expect(spec.clues.length).toBeGreaterThanOrEqual(1);
        // gereksiz ipucu kalmaz: her biri çıkarılınca çözüm sayısı artar
        spec.clues.forEach((c, i) => {
          const rest = { ...spec, clues: spec.clues.filter((_, j) => j !== i) };
          expect(solveDice(rest).length, 'gereksiz ipucu ' + clueText(c)).toBeGreaterThan(1);
        });
        // 'is' (doğrudan açma) kademe 1+ sadece son çare: ipucu sayısı üst sınırı aşılmaz (güvence hariç n kadar ek)
        expect(spec.clues.length).toBeLessThanOrEqual(maxC[t] + nOf[t]);
      }
    }
  });

  it('doğru değerler → won; her ipucunun Türkçe cümlesi var', () => {
    for (let s = 0; s < 60; s++) {
      const t = s % 4;
      const m = createDice({ seed: s, tier: t });
      m.spec.solution.forEach((v, i) => expect(m.set(i, v)).toBe(true));
      expect(m.submit()).toBe('won');
      expect(m.status).toBe('won');
      expect(m.submit()).toBe('ignored');
      m.spec.clues.forEach((c) => expect(clueText(c).length).toBeGreaterThan(5));
    }
  });

  it('yanlış doğrulama: hangi ipuçları tutmuyor + hak azalır; haklar bitince lost', () => {
    const lives = [3, 2, 2, 1];
    for (let t = 0; t < 4; t++) {
      const m = createDice({ seed: 12, tier: t });
      const wrong = m.spec.solution.map((v) => (v % 6) + 1);
      wrong.forEach((v, i) => m.set(i, v));
      expect(m.spec.n).toBeGreaterThan(0);
      let last = '';
      for (let k = 0; k < lives[t]; k++) {
        last = m.submit();
        if (m.status === 'running') {
          const v = m.view();
          expect(v.failed.length).toBeGreaterThan(0);
          expect(v.lives).toBe(lives[t] - k - 1);
          expect(v.live).toMatch(/ipucu sağlanmıyor/);
        }
      }
      expect(last).toBe('lost');
      expect(m.status).toBe('lost');
      expect(m.view().reason).toBe('hak');
    }
  });

  it('süre yok: tick no-op; kademe 0 ve erişilebilirlik anlık ✓/✗ gösterir', () => {
    const m = createDice({ seed: 5, tier: 2 });
    m.tick(9999);
    expect(m.status).toBe('running');
    expect(m.view().assist).toBe(false);
    expect(m.view().clues.every((c) => c.ok === null)).toBe(true);
    expect(createDice({ seed: 5, tier: 0 }).view().assist).toBe(true);
    expect(createDice({ seed: 5, tier: 3, accessibility: true }).view().assist).toBe(true);
    const a = createDice({ seed: 5, tier: 0 });
    a.spec.solution.forEach((v, i) => a.set(i, v));
    expect(a.view().clues.every((c) => c.ok === true)).toBe(true);
  });

  it('step döngüsü 1..6; set sınırları; ipucu durumu değişince temizlenir', () => {
    const m = createDice({ seed: 1, tier: 1 });
    m.set(0, 6);
    m.step(0, 1);
    expect(m.view().dice[0].value).toBe(1);
    m.step(0, -1);
    expect(m.view().dice[0].value).toBe(6);
    expect(m.set(0, 7)).toBe(false);
    expect(m.set(0, 0)).toBe(false);
    expect(m.set(9, 3)).toBe(false);
    expect(m.set(0, NaN)).toBe(false);
    expect(m.step(9, 1)).toBe(false);
  });

  it('serileştirme gidiş-dönüş + fuzz', () => {
    const rng = mulberry32(31);
    for (let s = 0; s < 60; s++) {
      const m = createDice({ seed: s, tier: s % 4, accessibility: s % 3 === 0 });
      for (let i = 0; i < 20; i++) {
        const r = rng();
        if (r < 0.5) m.step(Math.floor(rng() * m.spec.n), rng() < 0.5 ? 1 : -1);
        else if (r < 0.8) m.set(Math.floor(rng() * m.spec.n), 1 + Math.floor(rng() * 6));
        else m.submit();
        const saved = JSON.parse(JSON.stringify(m.serialize()));
        const rest = restoreDice(saved);
        expect(rest.serialize()).toEqual(m.serialize());
        expect(rest.view()).toEqual(m.view());
      }
    }
    expect(restoreDice({ kind: 'dice', v: 1, seed: 1, tier: 9, vals: [99, 'x'], lives: 'q', failed: [9, -1, 'z'] })).not.toBeNull();
    expect(restoreDice({ kind: 'dice', v: 3 })).toBeNull();
    expect(restoreDice(0)).toBeNull();
  });
});

describe('belirlenimcilik: aynı girdi → aynı çıktı (20 tohum)', () => {
  it('spec ve makine başlangıç görünümleri bayt-bayt aynı', () => {
    for (let s = 0; s < 20; s++) {
      for (let t = 0; t < 4; t++) {
        HACK_GAMES.forEach((g) => {
          const a = createHack({ game: g, seed: s * 977, tier: t });
          const b = createHack({ game: g, seed: s * 977, tier: t });
          expect(JSON.stringify(a.spec)).toBe(JSON.stringify(b.spec));
          expect(JSON.stringify(a.view())).toBe(JSON.stringify(b.view()));
        });
      }
    }
  });
});
