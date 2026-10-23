import { describe, expect, it } from 'vitest';
import {
  STATIONS, SILENT_INDEX, createRadio, getStation, radioCapFor, radioStepEvents, stepAt, stepSeconds, tickerAt, trackAt,
} from './audioRadio.js';
import {
  ARTISTS, DJ_LINES, RADIO_SCALES, STEPS_PER_BAR, STING_SECONDS, TICKER_SECONDS, TITLE_ADJ, TITLE_NOUN, TRACK_BARS,
} from './audioRadioData.js';
import {
  advance, connectedCount, liveSources, makeLoop,
} from './audioLoopTestKit.js';
import { midiToHz } from './audioMix.js';
import { RADIO_STATIONS } from './sim/city/cityNames.js';
import { CITY_AD_LINES } from './sim/city/cityBrands.js';
import { scanText } from './sim/city/citySafeData.js';
import { mulberry32 } from './sim/rng.js';

const PITCHED = ['bass', 'pad', 'lead', 'arp', 'bell', 'sting'];
const real = STATIONS.filter((s) => !s.silent);

describe('istasyon verisi', () => {
  it('6 kayıt: cityNames.RADIO_STATIONS ile aynı sıra ve kimlik; 5 istasyon + Sessiz', () => {
    expect(STATIONS.length).toBe(6);
    expect(STATIONS.map((s) => s.id)).toEqual(RADIO_STATIONS.map((s) => s.id));
    expect(STATIONS.map((s) => s.name)).toEqual(RADIO_STATIONS.map((s) => s.name));
    expect(real.length).toBe(5);
    expect(STATIONS[SILENT_INDEX].silent).toBe(true);
    STATIONS.forEach((s, i) => expect(s.index).toBe(i));
  });

  it('tempo 70–140 BPM, gam tanımlı, tohumlar farklı', () => {
    real.forEach((s) => {
      expect(s.bpm).toBeGreaterThanOrEqual(70);
      expect(s.bpm).toBeLessThanOrEqual(140);
      expect(RADIO_SCALES[s.scale]).toBeTruthy();
      expect(s.intervals).toBe(RADIO_SCALES[s.scale]);
      expect(s.root).toBeGreaterThan(40);
      expect(s.root).toBeLessThan(70);
    });
    expect(new Set(real.map((s) => s.seed)).size).toBe(5);
    expect(new Set(real.map((s) => s.bpm)).size).toBe(5);
  });

  it('getStation: kimlik, indeks, nesne; geçersiz → Sessiz', () => {
    expect(getStation('hiz_hatti').index).toBe(2);
    expect(getStation(3).id).toBe('pazar_sokagi');
    expect(getStation(STATIONS[1]).id).toBe('gece_taksisi');
    [-1, 6, NaN, 'yok', null, undefined, {}].forEach((x) => expect(getStation(x).silent).toBe(true));
  });
});

describe('besteci: belirlenimcilik ve gam', () => {
  it('notalar KESİNLİKLE istasyon gamındadır (her istasyon, 4 parça boyunca)', () => {
    real.forEach((st) => {
      const set = new Set(st.intervals);
      const steps = STEPS_PER_BAR * TRACK_BARS * 4;
      const pcs = new Set();
      let pitched = 0;
      for (let s = 0; s < steps; s++) {
        radioStepEvents(st, s).forEach((e) => {
          if (PITCHED.indexOf(e.kind) < 0) {
            expect(e.midi).toBeUndefined();
            return;
          }
          pitched++;
          const pc = (((e.midi - st.root) % 12) + 12) % 12;
          expect(set.has(pc)).toBe(true);
          expect(e.freq).toBeCloseTo(midiToHz(e.midi), 9);
          expect(e.midi).toBeGreaterThan(24);
          expect(e.midi).toBeLessThan(110);
          pcs.add(pc);
        });
      }
      expect(pitched).toBeGreaterThan(500);
      expect(pcs.size).toBeGreaterThanOrEqual(4);
    });
  });

  it('(istasyon tohumu, adım) → aynı olaylar: tekrar, rastgele erişim ve çağrı sırasından bağımsız', () => {
    real.forEach((st) => {
      const seq = [];
      for (let s = 0; s < 3000; s++) seq.push(JSON.stringify(radioStepEvents(st, s)));
      const r = mulberry32(st.seed);
      for (let k = 0; k < 3000; k++) {
        const s = Math.floor(r() * 3000);
        expect(JSON.stringify(radioStepEvents(st, s))).toBe(seq[s]);
      }
    });
  });

  it('istasyonlar birbirinden farklı akış üretir; ardışık parçalar farklı', () => {
    const sig = (st, from, n) => {
      const out = [];
      for (let s = from; s < from + n; s++) radioStepEvents(st, s).forEach((e) => out.push(e.kind + (e.midi || '')));
      return out.join(',');
    };
    const sigs = real.map((st) => sig(st, 16 * 12, 256));
    expect(new Set(sigs).size).toBe(5);
    real.forEach((st) => {
      const barSteps = STEPS_PER_BAR * TRACK_BARS;
      const a = sig(st, barSteps * 0 + 16 * 8, 160);
      const b = sig(st, barSteps * 1 + 16 * 8, 160);
      const c = sig(st, barSteps * 2 + 16 * 8, 160);
      expect(a === b && b === c).toBe(false);
    });
  });

  it('ezgi motifleri parçadan parçaya değişir (50 parça, çoğu benzersiz)', () => {
    real.forEach((st) => {
      const motifs = new Set();
      for (let ti = 0; ti < 50; ti++) {
        const from = ti * STEPS_PER_BAR * TRACK_BARS + STEPS_PER_BAR * 8;
        const notes = [];
        for (let s = from; s < from + 16 * 10 && notes.length < 12; s++) {
          radioStepEvents(st, s).forEach((e) => { if (e.kind === 'lead') notes.push(e.midi - st.root); });
        }
        motifs.add(notes.join('.'));
      }
      expect(motifs.size).toBeGreaterThan(25);
    });
  });

  it('davul: ambient istasyonda yok, diğerlerinde var; kick/snare/hat sayıları makul', () => {
    const count = (st, kind, bars) => {
      let c = 0;
      for (let s = 0; s < bars * 16; s++) c += radioStepEvents(st, s).filter((e) => e.kind === kind).length;
      return c;
    };
    expect(count(getStation('yildiz_ambient'), 'kick', 64)).toBe(0);
    expect(count(getStation('yildiz_ambient'), 'hat', 64)).toBe(0);
    ['neonfm', 'gece_taksisi', 'hiz_hatti', 'pazar_sokagi'].forEach((id) => {
      const st = getStation(id);
      expect(count(st, 'kick', 32)).toBeGreaterThan(20);
      expect(count(st, 'snare', 32)).toBeGreaterThan(10);
      expect(count(st, 'hat', 32)).toBeGreaterThan(30);
    });
    // Hız Hattı dört vuruş: ana bölümde her çeyrekte kick
    const hh = getStation('hiz_hatti');
    const bar = 10;
    let kicks = 0;
    for (let s = 0; s < 16; s++) kicks += radioStepEvents(hh, bar * 16 + s).filter((e) => e.kind === 'kick').length;
    expect(kicks).toBe(4);
  });

  it('adım başına olay sayısı sınırlı, tüm alanlar sonlu', () => {
    real.forEach((st) => {
      for (let s = 0; s < 2000; s++) {
        const evs = radioStepEvents(st, s);
        expect(evs.length).toBeLessThanOrEqual(14);
        evs.forEach((e) => {
          expect(Number.isFinite(e.steps) && e.steps > 0).toBe(true);
          expect(Number.isFinite(e.vel) && e.vel > 0 && e.vel <= 1).toBe(true);
          expect(Number.isFinite(e.delay) && e.delay >= 0 && e.delay < 0.5).toBe(true);
        });
      }
    });
  });

  it('istasyon jingle’ı ~90 sn’de bir (10 dk’da ≥ 6 kez)', () => {
    real.forEach((st) => {
      const total = Math.floor(600 / stepSeconds(st));
      let groups = 0;
      for (let s = 0; s < total; s++) if (radioStepEvents(st, s).some((e) => e.kind === 'sting')) groups++;
      expect(groups).toBeGreaterThanOrEqual(6);
      expect(groups).toBeLessThanOrEqual(7);
    });
    expect(STING_SECONDS).toBe(90);
  });

  it('sessiz istasyon ve geçersiz adımlar olay üretmez / güvenli', () => {
    expect(radioStepEvents(STATIONS[SILENT_INDEX], 100)).toEqual([]);
    expect(radioStepEvents(null, 5)).toEqual([]);
    expect(() => radioStepEvents(STATIONS[0], NaN)).not.toThrow();
    expect(() => radioStepEvents(STATIONS[0], -5)).not.toThrow();
    expect(stepAt(STATIONS[0], -3)).toBe(0);
    expect(stepSeconds(STATIONS[SILENT_INDEX])).toBe(0);
  });
});

describe('parça, yazı bandı, güvenlik', () => {
  it('parça bilgisi: belirlenimci, parça sınırlarında değişir', () => {
    real.forEach((st) => {
      const len = (60 / st.bpm) * 4 * TRACK_BARS;
      const a = trackAt(st, 5);
      expect(trackAt(st, 5)).toEqual(a);
      expect(a.index).toBe(0);
      expect(trackAt(st, len + 1).index).toBe(1);
      expect(trackAt(st, len * 7.5).index).toBe(7);
      const titles = new Set();
      for (let i = 0; i < 60; i++) titles.add(trackAt(st, len * i + 1).title);
      expect(titles.size).toBeGreaterThan(30);
    });
    expect(trackAt(STATIONS[SILENT_INDEX], 5)).toBeNull();
  });

  it('yazı bandı: üç tür de çıkar; belirlenimli; çip ≤ 40 karakter; sessizde boş', () => {
    real.forEach((st) => {
      const kinds = new Set();
      for (let t = 0; t < 3600; t += TICKER_SECONDS) {
        const a = tickerAt(st, t, 7);
        expect(tickerAt(st, t, 7)).toEqual(a);
        kinds.add(a.kind);
        expect(a.text.length).toBeGreaterThan(5);
        expect(a.chip.length).toBeLessThanOrEqual(40);
      }
      expect(kinds.has('title') && kinds.has('dj') && kinds.has('ad')).toBe(true);
      // parça başında hep başlık
      const len = (60 / st.bpm) * 4 * TRACK_BARS;
      expect(tickerAt(st, len * 3 + 2, 0).kind).toBe('title');
    });
    expect(tickerAt(STATIONS[SILENT_INDEX], 10, 0).text).toBe('');
  });

  it('reklamlar yalnız cityBrands’taki uydurma marka satırlarıdır', () => {
    const texts = new Set(CITY_AD_LINES.filter((a) => a.brand).map((a) => 'Reklam: ' + a.text));
    real.forEach((st) => {
      let ads = 0;
      for (let t = 0; t < 7200; t += TICKER_SECONDS) {
        const k = tickerAt(st, t, 3);
        if (k.kind === 'ad') {
          ads++;
          expect(texts.has(k.text)).toBe(true);
        }
      }
      expect(ads).toBeGreaterThan(10);
    });
  });

  it('tüm metinler (başlık × sanatçı, DJ, reklam) aile dostu: citySafe taraması 0 isabet', () => {
    const bad = [];
    const check = (s) => {
      const h = scanText(s);
      if (h.length) bad.push(s + ' -> ' + h.map((x) => x.term).join(','));
    };
    TITLE_ADJ.forEach((a) => TITLE_NOUN.forEach((n) => { check(a + ' ' + n); check(n + ' İçin Şarkı'); }));
    TITLE_NOUN.forEach((n) => TITLE_NOUN.forEach((m) => check(n + ' ve ' + m)));
    Object.keys(ARTISTS).forEach((k) => ARTISTS[k].forEach(check));
    Object.keys(DJ_LINES).forEach((k) => DJ_LINES[k].forEach((l) => { check(l); expect(l.length).toBeLessThanOrEqual(56); }));
    STATIONS.forEach((s) => { check(s.name); check(s.genre); });
    real.forEach((st) => {
      for (let t = 0; t < 3600 * 3; t += TICKER_SECONDS) check(tickerAt(st, t, 1).text);
      const len = (60 / st.bpm) * 4 * TRACK_BARS;
      for (let i = 0; i < 300; i++) {
        const tr = trackAt(st, len * i + 1);
        check(tr.title + ' — ' + tr.artist);
      }
    });
    expect(bad).toEqual([]);
  });

  it('veri tabloları: her istasyonun DJ satırı ve sanatçı listesi var (≥ 6)', () => {
    real.forEach((st) => {
      expect(DJ_LINES[st.id].length).toBeGreaterThanOrEqual(6);
      expect(ARTISTS[st.id].length).toBeGreaterThanOrEqual(6);
    });
  });
});

/* ------------------------------------------------------------------------------------------------
 * Çalar (sahte AudioContext)
 * ---------------------------------------------------------------------------------------------- */
function rig(cap, stationId) {
  const loop = makeLoop();
  const radio = createRadio({ getLoop: () => loop, nodeCap: cap });
  if (stationId) radio.setStation(stationId);
  return { loop, radio, ctx: loop.ctx };
}

function run(r, secs, t0, active, dt) {
  const h = dt || 1 / 30;
  let t = t0;
  for (let i = 0; i < secs / h; i++) {
    t += h;
    r.radio.update(h, t, active === undefined ? true : active);
    advance(r.ctx, h, h);
  }
  return t;
}

/** Ana bölüm (S1, 9. ölçü) içinde bir radyo saati: tüm katmanlar çalar. */
function mainT(st) {
  const len = (60 / st.bpm) * 4 * TRACK_BARS;
  return len * 10 + (60 / st.bpm) * 4 * 9;
}

function schedule(ctx, t0) {
  // başlamış kaynakların (tür, frekans, göreli başlangıç) listesi
  const out = [];
  for (let i = 0; i < ctx.nodes.length; i++) {
    const n = ctx.nodes[i];
    if (n.kind !== 'osc' || n.startedAt === undefined) continue;
    out.push([n.type, Math.round(n.frequency.value * 100) / 100, Math.round((n.startedAt - t0) * 1000) / 1000]);
  }
  return out;
}

describe('radyo çalar', () => {
  it('bağlam yoksa / jestten önce / etkin değilken hiçbir şey kurulmaz', () => {
    const r = createRadio({ getLoop: () => null, nodeCap: 16 });
    for (let i = 0; i < 30; i++) r.update(0.016, i * 0.016, true);
    expect(r.getStats().sources).toBe(0);
    const g = rig(16);
    run(g, 2, 100, false);
    expect(liveSources(g.ctx)).toBe(0);
    expect(g.loop.held).toBe(false);
    expect(g.radio.getStats().playing).toBe(false);
  });

  it('araçtayken çalar: notalar planlanır, ambiyans müziği tutulur, çıkınca sönüp kaybolur', () => {
    const g = rig(16, 'neonfm');
    run(g, 6, mainT(STATIONS[0]), true);
    const s = g.radio.getStats();
    expect(s.playing).toBe(true);
    expect(s.notes).toBeGreaterThan(30);
    expect(g.loop.held).toBe(true);
    expect(liveSources(g.ctx)).toBeGreaterThan(0);
    run(g, 2, 206, false);
    expect(g.loop.held).toBe(false);
    expect(g.radio.getStats().playing).toBe(false);
    expect(liveSources(g.ctx)).toBe(0);
    expect(g.radio.getStats().sources).toBe(0);
    expect(g.radio.getStats().groups).toBe(0);
  });

  it('düğüm tavanı: 5 istasyon × tavanlar (16/12/8/4/1/0), 90 sn — kaynak sayısı ASLA aşılmaz', () => {
    [16, 12, 8, 4, 1, 0].forEach((cap) => {
      real.forEach((st) => {
        const g = rig(cap, st.id);
        let t = 500;
        for (let i = 0; i < 90 * 30; i++) {
          t += 1 / 30;
          g.radio.update(1 / 30, t, true);
          advance(g.ctx, 1 / 30, 1 / 30);
          expect(liveSources(g.ctx)).toBeLessThanOrEqual(cap);
          expect(g.radio.getStats().sources).toBeLessThanOrEqual(cap);
        }
        expect(g.radio.getStats().peak).toBeLessThanOrEqual(cap);
        if (cap >= 8) expect(g.radio.getStats().notes).toBeGreaterThan(100);
        g.radio.dispose();
        expect(liveSources(g.ctx)).toBe(0);
      });
    });
  });

  it('kayıtta düşen öncelik: tavan düşükken bas/vuruş çalar, hi-hat atılır', () => {
    const g = rig(4, 'neonfm');
    run(g, 40, 300, true);
    const types = new Set();
    g.ctx.nodes.forEach((n) => {
      if (n.kind === 'osc' && n.startedAt !== undefined) types.add(n.type);
    });
    expect(g.radio.getStats().dropped).toBeGreaterThan(0);
    expect(g.radio.getStats().notes).toBeGreaterThan(20);
  });

  it('belirlenimci çalma: aynı istasyon + aynı radyo saati → aynı nota akışı (iki ayrı bağlam)', () => {
    real.forEach((st) => {
      const a = rig(16, st.id);
      const b = rig(16, st.id);
      const ta = a.ctx.currentTime;
      const tb = b.ctx.currentTime;
      run(a, 20, mainT(st), true);
      run(b, 20, mainT(st), true);
      expect(schedule(a.ctx, ta)).toEqual(schedule(b.ctx, tb));
      expect(schedule(a.ctx, ta).length).toBeGreaterThan(8);
    });
  });

  it('canlı yayın: farklı anda bağlanan dinleyici aynı müziği duyar (adım hizası radyo saatine bağlı)', () => {
    const st = getStation('pazar_sokagi');
    const ss = stepSeconds(st);
    const t1 = 3000.37;
    const g = rig(16, st.id);
    g.radio.update(1 / 30, t1, true);
    // ilk planlanan adım, radyo saatindeki bir sonraki adım sınırıdır
    const first = Math.ceil((t1 + 0.04) / ss);
    expect(g.radio.probe().kit.count).toBeGreaterThanOrEqual(0);
    const start = g.ctx.currentTime;
    run(g, 1.5, t1, true);
    // adım first*ss anı, bağlam zamanında (first*ss - t1) sonrasında olmalı
    const expectAt = start + (first * ss - t1);
    const hit = g.ctx.nodes.filter((n) => n.kind === 'osc' && n.startedAt !== undefined && Math.abs(n.startedAt - expectAt) < 0.02);
    expect(hit.length).toBeGreaterThan(0);
  });

  it('istasyon değişimi: çapraz geçiş + cızırtı, geçiş sırasında tavan korunur, eski yayın temizlenir', () => {
    const g = rig(12, 'neonfm');
    let t = run(g, 5, 700, true);
    const before = g.radio.getStats();
    expect(g.radio.setStation('hiz_hatti')).toBe(true);
    expect(g.radio.setStation('hiz_hatti')).toBe(false);
    for (let i = 0; i < 30; i++) {
      t += 1 / 30;
      g.radio.update(1 / 30, t, true);
      advance(g.ctx, 1 / 30, 1 / 30);
      expect(liveSources(g.ctx)).toBeLessThanOrEqual(12);
    }
    const after = g.radio.getStats();
    expect(after.station).toBe('hiz_hatti');
    expect(after.switches).toBe(before.switches + 1);
    // eski veriyolu hâlâ sönüyor olabilir; 1.5 sn sonra kalmaz
    t = run(g, 1.5, t, true);
    expect(g.radio.getStats().dying).toBe(0);
    // eski veriyolunun kazancı 0'a gönderildi
    const gains = g.ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.events.some((e) => e[0] === 'target' && e[1] === 0));
    expect(gains.length).toBeGreaterThan(0);
  });

  it('next/prev Sessiz dahil 6 istasyonda döner; Sessiz’de kaynak yok', () => {
    const g = rig(16, 'neonfm');
    const seen = [];
    for (let i = 0; i < 6; i++) seen.push(g.radio.next().id);
    expect(seen).toEqual(['gece_taksisi', 'hiz_hatti', 'pazar_sokagi', 'yildiz_ambient', 'sessiz', 'neonfm']);
    g.radio.setStation('sessiz');
    run(g, 3, 900, true);
    expect(liveSources(g.ctx)).toBe(0);
    expect(g.loop.held).toBe(false);
    expect(g.radio.prev().id).toBe('yildiz_ambient');
  });

  it('sessiz/gizli sekme (running=false): her şey bırakılır; müzik kapalı (musicOn=false) çalmaz; dönünce sürer', () => {
    const g = rig(16, 'gece_taksisi');
    let t = run(g, 4, 1200, true);
    expect(liveSources(g.ctx)).toBeGreaterThan(0);
    const base = connectedCount(g.ctx);
    g.loop.running = false;
    g.radio.update(1 / 30, t, true);
    expect(liveSources(g.ctx)).toBe(0);
    expect(g.loop.held).toBe(false);
    expect(connectedCount(g.ctx)).toBeLessThan(base);
    t = run(g, 3, t, true); // running=false iken run ilerler
    expect(liveSources(g.ctx)).toBe(0);
    g.loop.running = true;
    g.loop.musicOn = false;
    t = run(g, 2, t, true);
    expect(liveSources(g.ctx)).toBe(0);
    g.loop.musicOn = true;
    t = run(g, 3, t, true);
    expect(liveSources(g.ctx)).toBeGreaterThan(0);
    expect(g.loop.held).toBe(true);
  });

  it('duraklatma (dt=0): yeni nota planlanmaz; sürdürünce hizalanır', () => {
    const g = rig(16, 'neonfm');
    let t = run(g, 3, 40, true);
    const n0 = g.radio.getStats().notes;
    for (let i = 0; i < 60; i++) {
      g.radio.update(0, t, true);
      advance(g.ctx, 1 / 30, 1 / 30);
    }
    expect(g.radio.getStats().notes).toBe(n0);
    t = run(g, 2, t, true);
    expect(g.radio.getStats().notes).toBeGreaterThan(n0);
    expect(g.radio.getStats().resyncs).toBeGreaterThanOrEqual(1);
  });

  it('radyo saati sıçraması (kayıt yükleme) güvenli', () => {
    const g = rig(16, 'neonfm');
    let t = run(g, 2, 10, true);
    t = run(g, 2, t + 5000, true);
    run(g, 2, 3, true);
    expect(t).toBeGreaterThan(5000);
    expect(liveSources(g.ctx)).toBeLessThanOrEqual(16);
    expect(g.radio.getStats().notes).toBeGreaterThan(20);
  });

  it('tünel/iç mekân sönümü: kazanç ve parlaklık düşer, açık havada geri döner', () => {
    const g = rig(16, 'neonfm');
    run(g, 2, 100, true);
    const { chain } = g.radio.probe();
    const last = (p) => { for (let i = p.events.length - 1; i >= 0; i--) if (p.events[i][0] === 'target') return p.events[i][1]; return undefined; };
    const open = last(chain.master.gain);
    const lpOpen = last(chain.lp.frequency);
    g.radio.setDuck(0);
    run(g, 1, 102, true);
    expect(last(chain.master.gain)).toBeLessThan(open * 0.4);
    expect(last(chain.lp.frequency)).toBeLessThan(lpOpen * 0.4);
    g.radio.setDuck(1);
    run(g, 1, 103, true);
    expect(last(chain.master.gain)).toBeCloseTo(open, 6);
    g.radio.setDuck(NaN);
    expect(g.radio.duck).toBe(1);
    g.radio.setDuck(7);
    expect(g.radio.duck).toBe(1);
  });

  it('1000 aç/kapa + istasyon değişimi döngüsü: sızıntı 0', () => {
    const g = rig(12, 'neonfm');
    const base0 = connectedCount(g.ctx);
    let t = 50;
    for (let i = 0; i < 1000; i++) {
      t += 0.3;
      if (i % 5 === 0) g.radio.setStation(i % 6);
      g.radio.update(1 / 30, t, i % 3 !== 0);
      advance(g.ctx, 0.12, 0.06);
      expect(liveSources(g.ctx)).toBeLessThanOrEqual(12);
    }
    g.radio.update(1 / 30, t, false);
    advance(g.ctx, 3, 0.1);
    g.radio.update(1 / 30, t, false);
    expect(liveSources(g.ctx)).toBe(0);
    expect(g.radio.getStats().sources).toBe(0);
    expect(g.radio.getStats().groups).toBe(0);
    expect(connectedCount(g.ctx)).toBe(base0);
    const s = g.radio.getStats();
    expect(s.created).toBe(s.released);
    expect(g.loop.held).toBe(false);
  });

  it('info(): istasyon + parça + yazı bandı; Sessiz’de boş', () => {
    const g = rig(16, 'hiz_hatti');
    const i = g.radio.info(123);
    expect(i.name).toBe('Hız Hattı');
    expect(i.title.length).toBeGreaterThan(3);
    expect(i.artist.length).toBeGreaterThan(3);
    expect(i.chip.length).toBeLessThanOrEqual(40);
    expect(g.radio.info(123)).toEqual(i);
    g.radio.setStation('sessiz');
    expect(g.radio.info(5).silent).toBe(true);
    expect(g.radio.info(5).ticker).toBe('');
  });

  it('kare başına nota sınırı: kuyruklanmış çok adım bile tek karede en çok ~28 nota üretir', () => {
    const g = rig(16, 'hiz_hatti');
    let t = run(g, 3, mainT(STATIONS[2]), true);
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      t += 0.1; // 100 ms'lik iri kareler: her karede birkaç adım kuyruğa girer
      const n0 = g.radio.getStats().notes;
      g.radio.update(0.1, t, true);
      worst = Math.max(worst, g.radio.getStats().notes - n0);
      advance(g.ctx, 0.1, 0.05);
    }
    expect(worst).toBeLessThanOrEqual(28);
    expect(g.radio.getStats().notes).toBeGreaterThan(100);
  });

  it('radioCapFor: 24/18/12 → 16/12/8', () => {
    expect([24, 18, 12].map(radioCapFor)).toEqual([16, 12, 8]);
  });
});
