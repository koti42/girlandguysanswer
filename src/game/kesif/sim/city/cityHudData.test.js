import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DISTRICT_TAGLINES, GATE_TEXT, LIGHT_LABELS, LIGHT_RANGE, LOADING_DELAY_MS, LOADING_DONE_TEXT, LOADING_TIPS, TIP_EVERY_MS, cityWeatherLabel,
  districtBannerSpec, districtDisplay, loadingAnnouncement, loadingPercent, nearestLightHint, parseTimeLabel, tipAt,
} from './cityHudData.js';
import { DISTRICT_KEYS, DISTRICTS } from './archetypes.js';
import { getCityPlan } from './cityPlan.js';
import { isSafeText } from './citySafeData.js';
import { GATE_RULES } from '../dim/travel.js';
import { createBannerQueue } from '../../systems/sessionBanner.js';
import { formatClockTime, phaseNameAt } from '../daynight.js';

const SEEDS = [1, 7, 12345, 987654, 0x4e454f4e];

describe('yükleme ipuçları ve gecikme', () => {
  it('0,6 sn gecikme; ipucu aralığı makul', () => {
    expect(LOADING_DELAY_MS).toBe(600);
    expect(TIP_EVERY_MS).toBeGreaterThanOrEqual(3000);
  });

  it('en az 8 benzersiz, kısa, Türkçe ve aile dostu ipucu (yasak liste + marka taraması temiz)', () => {
    expect(LOADING_TIPS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(LOADING_TIPS).size).toBe(LOADING_TIPS.length);
    LOADING_TIPS.forEach((t) => {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(20);
      expect(t.length).toBeLessThanOrEqual(110);
      expect(isSafeText(t)).toBe(true);
    });
    expect(Object.isFrozen(LOADING_TIPS)).toBe(true);
  });

  it('ipuçları gerçek kurallarla tutarlı: 12 şarj, 30 sn kapı ömrü, gün 10 dk', () => {
    const all = LOADING_TIPS.join(' ');
    expect(all).toContain(String(GATE_RULES.cost));
    expect(all).toContain(GATE_RULES.ttl + ' saniye');
    expect(all).toMatch(/on dakika/);
    expect(GATE_RULES.cost).toBe(12);
    expect(GATE_RULES.ttl).toBe(30);
  });

  it('tipAt: modül, negatif, NaN, kesirli ve dev indeks güvenli', () => {
    expect(tipAt(0)).toBe(LOADING_TIPS[0]);
    expect(tipAt(LOADING_TIPS.length)).toBe(LOADING_TIPS[0]);
    expect(tipAt(-1)).toBe(LOADING_TIPS[LOADING_TIPS.length - 1]);
    expect(tipAt(NaN)).toBe(LOADING_TIPS[0]);
    expect(tipAt(Infinity)).toBe(LOADING_TIPS[0]);
    expect(tipAt(2.9)).toBe(LOADING_TIPS[2]);
    expect(tipAt(1e12 + 3)).toBe(LOADING_TIPS[(1e12 + 3) % LOADING_TIPS.length]);
    expect(typeof tipAt('x')).toBe('string');
  });

  it('loadingPercent / loadingAnnouncement: 0..100, 25 basamağı, NaN güvenli', () => {
    expect(loadingPercent(0)).toBe(0);
    expect(loadingPercent(0.426)).toBe(43);
    expect(loadingPercent(1)).toBe(100);
    expect(loadingPercent(7)).toBe(100);
    expect(loadingPercent(-1)).toBe(0);
    [NaN, Infinity, 'x', null, undefined, {}].forEach((v) => expect(loadingPercent(v)).toBe(v === Infinity ? 0 : 0));
    expect(loadingAnnouncement(0)).toBe('Boyut geçişi yükleniyor.');
    expect(loadingAnnouncement(0.24)).toBe('Boyut geçişi yükleniyor.');
    expect(loadingAnnouncement(0.25)).toBe('Boyut geçişi yükleniyor, yüzde 25.');
    expect(loadingAnnouncement(0.42)).toBe('Boyut geçişi yükleniyor, yüzde 25.');
    expect(loadingAnnouncement(0.8)).toBe('Boyut geçişi yükleniyor, yüzde 75.');
    expect(loadingAnnouncement(1)).toBe('Boyut geçişi yükleniyor, yüzde 100.');
    // en çok 6 farklı cümle → canlı bölge gürültü yapmaz
    const set = new Set();
    for (let i = 0; i <= 1000; i++) set.add(loadingAnnouncement(i / 1000));
    expect(set.size).toBeLessThanOrEqual(6);
    expect(LOADING_DONE_TEXT).toBe('Boyut geçişi tamamlandı.');
  });
});

describe('bölge duyuruları', () => {
  it('her bölge: ad archetypes ile aynı, alt başlık dolu ve güvenli, kısa', () => {
    DISTRICT_KEYS.concat(['alt_sehir']).forEach((k) => {
      const spec = districtBannerSpec(k);
      expect(spec).not.toBeNull();
      expect(spec.text).toBe(districtDisplay(k));
      if (k !== 'alt_sehir') expect(spec.text).toBe(DISTRICTS[k].name);
      expect(spec.sub.length).toBeGreaterThan(5);
      expect(spec.sub.length).toBeLessThanOrEqual(60);
      expect(isSafeText(spec.text + ' ' + spec.sub)).toBe(true);
      expect(spec.opts.key).toBe('district:' + k);
      expect(spec.opts.kind).toBe('zone');
    });
    expect(Object.keys(DISTRICT_TAGLINES).sort()).toEqual(DISTRICT_KEYS.concat(['alt_sehir']).sort());
  });

  it('bilinmeyen / tehlikeli anahtar → null / boş', () => {
    ['', 'x', '__proto__', 'constructor', 'toString', null, undefined, 5, {}].forEach((k) => {
      expect(districtBannerSpec(k)).toBeNull();
      expect(districtDisplay(k)).toBe('');
    });
  });

  it('kuyruk kuralları: karşılama (öncelik 2) kesilmez, bölge sıraya girer; derinlik/yeniden doğuş (≥3) keser; aynı bölge 4 sn içinde tekrarlanmaz', () => {
    let t = 0;
    const q = createBannerQueue({ now: () => t });
    const welcome = { text: 'Neon Meridyen', sub: 'Hoş geldin.', key: 'dim:welcome', kind: 'info', duration: 4200, priority: 2 };
    expect(q.push(welcome)).toBe(true);
    expect(q.update(t).text).toBe('Neon Meridyen');
    const spec = districtBannerSpec('merkez');
    expect(q.push({ text: spec.text, sub: spec.sub, ...spec.opts })).toBe(true);
    t = 1000;
    expect(q.update(t).text).toBe('Neon Meridyen'); // kesilmedi
    t = 4300;
    expect(q.update(t)).toBeNull(); // karşılama bitti; iki duyuru arası kısa boşluk
    t = 4700;
    expect(q.update(t).text).toBe('Merkez'); // sırayla
    // aynı anahtar yeniden → atılır
    expect(q.push({ text: spec.text, sub: spec.sub, ...spec.opts })).toBe(false);
    // daha yüksek öncelikli (derinlik bandı, öncelik 4) bölge duyurusunu keser
    expect(q.push({ text: 'Mağaralar', sub: '', key: 'depth', kind: 'info', duration: 3200, priority: 4 })).toBe(true);
    expect(q.update(t).text).toBe('Mağaralar');
  });

  it('bölge duyurusu düşük öncelikli: boss/yetenek/yeniden doğuş duyurularını kesmez', () => {
    let t = 0;
    const q = createBannerQueue({ now: () => t });
    q.push({ text: 'Sistem seni terminalde yeniden derledi.', sub: '', key: 'dim:respawn', kind: 'info', duration: 3200, priority: 3 });
    expect(q.update(t).text).toContain('yeniden derledi');
    const spec = districtBannerSpec('liman');
    q.push({ text: spec.text, sub: spec.sub, ...spec.opts });
    t = 500;
    expect(q.update(t).text).toContain('yeniden derledi');
  });
});

describe('boyut kapısı metinleri', () => {
  it('Türkçe, güvenli, doğru sayılar; anahtar T', () => {
    expect(GATE_TEXT.keyHint).toBe('T');
    Object.keys(GATE_TEXT).forEach((k) => {
      expect(typeof GATE_TEXT[k]).toBe('string');
      expect(isSafeText(GATE_TEXT[k])).toBe(true);
    });
    expect(GATE_TEXT.modeOnHint).toContain(String(GATE_RULES.cost));
    expect(GATE_TEXT.modeOffHint).toContain('T');
  });
});

describe('ışık ipucu (en yakın terminal, ≤ 40 blok)', () => {
  it('menzil 40 blok; ad "Terminal"', () => {
    expect(LIGHT_RANGE).toBe(40);
    expect(LIGHT_LABELS.terminal).toBe('Terminal');
  });

  it('her tohumda 16 terminalin her birinde: kind terminal, uzaklık 0; menzil sınırı 40', () => {
    SEEDS.forEach((seed) => {
      const plan = getCityPlan(seed);
      expect(plan.terminals).toHaveLength(16);
      plan.terminals.forEach((t, i) => {
        const h = nearestLightHint(plan, t.x, t.y, t.z);
        expect(h, 'tohum ' + seed + ' terminal ' + i).not.toBeNull();
        expect(h.kind).toBe('terminal');
        expect(h.dist).toBe(0);
        expect(h.text).toBe('Terminal');
        // 39 blok uzakta hâlâ görünür (başka terminal yakın değilse uzaklık ≈ 39)
        const near = nearestLightHint(plan, t.x + 39, t.y, t.z);
        expect(near).not.toBeNull();
        expect(near.dist).toBeLessThanOrEqual(39);
        const far = nearestLightHint(plan, t.x + 41, t.y, t.z);
        if (far) expect(far.dist).toBeLessThanOrEqual(40); // başka bir terminale yakınsa
      });
    });
  });

  it('terminallerden 41+ blok uzakta: ipucu yok; yeraltında (dikey fark > 12) yok', () => {
    const plan = getCityPlan(12345);
    const t = plan.terminals[0];
    // en yakın başka terminale ≥ 41 olan bir nokta: terminal 0'dan (0,41) — diğerleri 150+ blok uzak
    expect(nearestLightHint(plan, t.x, t.y, t.z + 41)).toBeNull();
    expect(nearestLightHint(plan, t.x, 40, t.z)).toBeNull();
    expect(nearestLightHint(plan, t.x, 40 + 12, t.z)).not.toBeNull();
    expect(nearestLightHint(plan, t.x, 64 + 13, t.z)).toBeNull();
  });

  it('en yakını seçer; out tamponu yeniden kullanılır (tahsissiz)', () => {
    const plan = { terminals: [{ x: 0, y: 64, z: 0 }, { x: 30, y: 64, z: 0 }] };
    const buf = {};
    const h = nearestLightHint(plan, 20, 64, 0, buf);
    expect(h).toBe(buf);
    expect(h.dist).toBe(10);
    expect(nearestLightHint(plan, 5, 64, 0, buf).dist).toBe(5);
  });

  it('geçersiz girdi → null', () => {
    const plan = getCityPlan(1);
    [[null, 0, 64, 0], [{}, 0, 64, 0], [plan, NaN, 64, 0], [plan, 0, 64, Infinity], [plan, 'x', 64, 0], [undefined, 0, 0, 0]].forEach((a) => {
      expect(nearestLightHint(a[0], a[1], a[2], a[3])).toBeNull();
    });
    expect(nearestLightHint(plan, plan.terminals[0].x, NaN, plan.terminals[0].z)).not.toBeNull(); // y yoksa yüzey sayılır
  });
});

describe('hava ve saat etiketleri', () => {
  it('cityWeatherLabel: yağmur/fırtına motordan; duman smog ≥ 0.5; kar/yanlış etiket yok sayılır', () => {
    expect(cityWeatherLabel('yağmur', 0)).toBe('yağmur');
    expect(cityWeatherLabel('fırtına', 1)).toBe('fırtına');
    expect(cityWeatherLabel('', 0.5)).toBe('duman');
    expect(cityWeatherLabel('', 0.49)).toBe('');
    expect(cityWeatherLabel('kar', 0)).toBe('');
    expect(cityWeatherLabel('kar', 0.9)).toBe('duman');
    expect(cityWeatherLabel(undefined, NaN)).toBe('');
    expect(cityWeatherLabel(null, undefined)).toBe('');
  });

  it('parseTimeLabel: motorun etiket biçimiyle (phaseNameAt + formatClockTime) tutarlı', () => {
    for (let i = 0; i < 100; i++) {
      const p = i / 100;
      const label = phaseNameAt(p) + ' ' + formatClockTime(p);
      const r = parseTimeLabel(label);
      expect(r.phase).toBe(phaseNameAt(p));
      expect(r.clock).toBe(formatClockTime(p));
    }
    expect(parseTimeLabel('gün batımı 19:30')).toEqual({ phase: 'gün batımı', clock: '19:30' });
    expect(parseTimeLabel('gece 7:05')).toEqual({ phase: 'gece', clock: '07:05' });
    expect(parseTimeLabel('gündüz')).toEqual({ phase: 'gündüz', clock: '' });
    expect(parseTimeLabel('')).toEqual({ phase: 'gündüz', clock: '' });
    expect(parseTimeLabel(null)).toEqual({ phase: 'gündüz', clock: '' });
    expect(parseTimeLabel(5)).toEqual({ phase: 'gündüz', clock: '' });
    expect(parseTimeLabel('gece 99:99').clock).toBe('23:99');
  });
});

describe('saflık (sim/ kuralları)', () => {
  // yorumlar (başlık "Math.random yok" der) taranmaz
  const raw = readFileSync(new URL('./cityHudData.js', import.meta.url), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('Math.random / Date.now / DOM / three / es2020 dışı yöntem yok; dosya ≤ 900 satır', () => {
    ['Math.random', 'Date.now', 'performance.now', 'document.', 'window.', "from 'three'", 'Object.hasOwn', 'structuredClone', '.replaceAll(', '.at(', 'TODO', 'FIXME'].forEach((s) => {
      expect(src.includes(s), s).toBe(false);
    });
    expect(raw.split('\n').length).toBeLessThanOrEqual(900);
  });
});
