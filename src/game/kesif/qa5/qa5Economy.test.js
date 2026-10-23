/*
 * qa5 (Faz 5, qa_logic) — EKONOMİ DEĞİŞMEZLERİ + ÖDÜL/TALEP İSTEMCİSİ:
 *   - Kredi hiçbir koşulda negatif / ondalıklı / sonlu-olmayan olmaz (cüzdan özellik testi, düşmanca argümanlar);
 *   - arbitraj yok: karışık satıcı/gün/hostile rastgele işlem akışında Kredi + eşyaların geri satış değeri HİÇBİR ZAMAN artmaz (yalnız ödül kaynakları ekler);
 *   - tavanlar: günlük satıcı sınırı, hediye Kredi sınırı, keşif ödülleri tek sefer (çip/grafiti/oda/set yeniden ödül vermez), iş ödülü bozunumu zeminli;
 *   - ödül kaynakları (iş/yarış/foto) düşmanca girdide sonlu tamsayı, sınırlı;
 *   - jeton talepleri: tutarı istemci belirleyemez (yalnız anahtar), anahtar kümesi ve tutarlar sunucu yapılandırmasıyla birebir (API deposu yanındaysa),
 *     talep kuyruğu: aynı anda tek uçuşta istek, başarıda durur, 409/422 kalıcı = onaylı, 401 durdurur, geri çekilme tavan 600 sn, kalıcılık.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Inventory } from '../sim/inventory.js';
import { seededRandom } from '../sim/rng.js';
import { ITEMS } from '../sim/items.js';
import {
  KREDI_MAX, createWallet, rollDay, sanitizeShop, shopOf, START_KREDI,
} from '../sim/city/ped/npcSave.js';
import {
  SELL_LIMIT, SELL_PRICE, VENDORS, sellPrice,
} from '../sim/city/ped/vendorData.js';
import { buyFrom, sellTo, vendorStock } from '../sim/city/ped/vendorLogic.js';
import { applyJobResult, applyRaceResult } from '../sim/city/mission/results.js';
import { jobReward, repeatDecay } from '../sim/city/mission/jobs.js';
import { JOB_LIMITS, KREDI } from '../sim/city/mission/missionData.js';
import {
  emptyDiscovery, markChip, markRoom, paintGraffiti,
} from '../sim/city/mission/discovery.js';
import { BACKOFF, REEMIT_SEC, createClaimQueue } from '../sim/city/mission/claimQueue.js';
import {
  NEON_AMOUNTS, NEON_CLAIMS, evaluateClaims, markClaimed, pendingClaims,
} from '../sim/city/cityEvents.js';
import { ensureCityState } from '../sim/city/cityState.js';

vi.setConfig({ testTimeout: 300000 });

const HOSTILE = [NaN, Infinity, -Infinity, -1, 0, 0.5, 1.5, 2 ** 31, 2 ** 53, 1e308, -1e308, null, undefined, '5', '1e3', true, [], {}, 'x', -0];

function mkCtx(seed, kredi, items) {
  const city = { kredi };
  const inv = new Inventory();
  (items || []).forEach((p) => inv.add(p[0], p[1]));
  const ctx = {
    seed, dayN: 0, shop: shopOf(city), inv, wallet: createWallet(() => city, null),
  };
  return { ctx, city, inv };
}

describe('qa5 ekonomi — cüzdan değişmezleri', () => {
  it('2000 rastgele add/spend (düşmanca argümanlı): bakiye tamsayı ≥ 0; korunum: bakiye = başlangıç + Σekle − Σharca', () => {
    for (let s = 0; s < 10; s++) {
      const rng = seededRandom(300 + s);
      const city = { kredi: 100 };
      const w = createWallet(() => city, null);
      let expected = 100;
      for (let i = 0; i < 2000; i++) {
        const n = rng.chance(0.5) ? rng.pick(HOSTILE) : rng.int(0, 400);
        if (rng.chance(0.5)) {
          const ok = w.add(n, 'x');
          if (ok) expected = Math.min(KREDI_MAX, expected + n);
          else if (Number.isInteger(n) && n > 0 && n <= KREDI_MAX) throw new Error('geçerli ekleme reddedildi ' + n);
        } else {
          const before = w.get();
          const ok = w.spend(n, 'x');
          if (ok) expected -= n;
          if (!ok) expect(w.get()).toBe(before);
          if (Number.isInteger(n) && n >= 0 && n <= before) expect(ok).toBe(true);
          if (Number.isInteger(n) && n > before) expect(ok).toBe(false);
        }
        expect(Number.isInteger(w.get())).toBe(true);
        expect(w.get()).toBeGreaterThanOrEqual(0);
        expect(w.get()).toBe(expected);
        expect(w.get()).toBeLessThanOrEqual(KREDI_MAX);
      }
    }
    expect(createWallet(() => null, null).get()).toBe(0);
    expect(createWallet(() => null, null).spend(1, 'x')).toBe(false);
    const c2 = { kredi: 'x' };
    expect(createWallet(() => c2, null).get()).toBe(START_KREDI);
  });
});

describe('qa5 ekonomi — satıcı: düşmanca argümanlar ve arbitraj yok', () => {
  it('buyFrom/sellTo hostile miktar/eşya/satıcı: atmaz, Kredi ve envanter değişmez (reddedilince)', () => {
    const { ctx, city, inv } = mkCtx(555, 5000, [['item:ok', 20], ['blok:taş', 64]]);
    const itemsH = [null, undefined, 5, {}, [], '', '__proto__', 'constructor', 'item:yok', 'blok:taş', 'item:ok', 'item:elma', 'toString'];
    const vendorsH = ['__proto__', 'constructor', 'yok', '', null, 5, 'otomat', VENDORS[0].id, VENDORS[3].id];
    const rng = seededRandom(9);
    for (let i = 0; i < 4000; i++) {
      const v = rng.pick(vendorsH);
      const it = rng.pick(itemsH);
      const n = rng.pick(HOSTILE);
      const k0 = city.kredi;
      const c0 = JSON.stringify(inv.toJSON());
      let r;
      expect(() => { r = rng.chance(0.5) ? buyFrom(ctx, v, it, n) : sellTo(ctx, v, it, n); }).not.toThrow();
      expect(typeof r.ok).toBe('boolean');
      expect(Number.isInteger(city.kredi) && city.kredi >= 0).toBe(true);
      if (!r.ok) {
        expect(city.kredi).toBe(k0);
        expect(JSON.stringify(inv.toJSON())).toBe(c0);
      }
    }
  });

  it('karışık 6 satıcı × 30 gün rastgele al/sat (hostile dahil): Kredi + envanterin geri satış değeri ASLA başlangıç değerini aşmaz', () => {
    const items0 = [['item:ok', 20], ['blok:taş', 64]];
    const value = (inv) => inv.list().reduce((a, h) => a + sellPrice(h.item || h.key) * (h.count || 0), 0);
    for (let seed = 0; seed < 5; seed++) {
      const rng = seededRandom(700 + seed);
      const { ctx, city, inv } = mkCtx(100 + seed, 3000, items0);
      const start = city.kredi + value(inv);
      let ops = 0;
      for (let i = 0; i < 6000; i++) {
        ctx.dayN = Math.floor(i / 200);
        rollDay(city, ctx.dayN);
        ctx.shop = shopOf(city);
        const v = rng.pick(VENDORS);
        if (rng.chance(0.55)) {
          const stock = vendorStock(ctx.seed, ctx.dayN, v.id);
          const o = stock[rng.int(0, stock.length - 1)];
          if (buyFrom(ctx, v.id, o.item, rng.chance(0.1) ? rng.pick(HOSTILE) : rng.int(1, 5)).ok) ops++;
        } else {
          const have = inv.list();
          if (have.length === 0) continue;
          const h = rng.pick(have);
          if (sellTo(ctx, v.id, h.item || h.key, rng.chance(0.1) ? rng.pick(HOSTILE) : rng.int(1, 9)).ok) ops++;
        }
        const now = city.kredi + value(inv);
        expect(now, 'değer artışı (arbitraj) i=' + i).toBeLessThanOrEqual(start);
        expect(Number.isInteger(city.kredi) && city.kredi >= 0).toBe(true);
      }
      expect(ops).toBeGreaterThan(200);
    }
  });

  it('günlük sınırlar: aynı gün satış sınırı, hediye Kredi ≤ 150; shop kaydı sınırlı ve bozuk giriş sıfırlanır', () => {
    expect(SELL_LIMIT).toBeLessThanOrEqual(16);
    const sh = sanitizeShop({ kg: 99999, d: -5, t: -1, s: { 'BÜYÜK|item:x': 5, 'a|dizge:x': 1, 'a|item:': 2 }, g: { 'item:ok': 1e12 } });
    expect(sh.kg).toBeLessThanOrEqual(150);
    expect(sh.d).toBe(0);
    expect(sh.t).toBe(0);
    expect(Object.keys(sh.s)).toEqual([]);
    expect(sh.g['item:ok']).toBeLessThanOrEqual(9999);
    Object.keys(SELL_PRICE).forEach((k) => { expect(ITEMS[k]).toBeTruthy(); expect(SELL_PRICE[k]).toBeGreaterThanOrEqual(1); });
  });
});

describe('qa5 ekonomi — ödül kaynakları (iş, yarış, keşif)', () => {
  const job = (kind, base) => ({
    kind, base, tier: 'caylak', dist: 400, route: 500,
  });

  it('jobReward/applyJobResult düşmanca girdide: sonlu tamsayı ≥ 1, taban ×1,25 üstüne çıkmaz, bozunum zeminli ve tekrarla düşer', () => {
    const rng = seededRandom(42);
    ['kurye', 'taksi', 'pod', 'tamir'].forEach((kind) => {
      for (let i = 0; i < 400; i++) {
        const base = rng.int(20, 200);
        const r = jobReward(job(kind, base), rng.pick(HOSTILE.concat([5, 30])), rng.pick(HOSTILE.concat([60, 90])), rng.pick([0.4, 0.55, 0.7, 1, NaN, -1, 0]), rng.pick([0, 1, 2, 5, 99, NaN]));
        // NaN/hostile girdide bile sonlu olmalı (kayda/cüzdana yazılır)
        expect(Number.isFinite(r.kredi), kind + ' ' + i).toBe(true);
        expect(Number.isInteger(r.kredi)).toBe(true);
        expect(r.kredi).toBeGreaterThanOrEqual(1);
        expect(r.kredi).toBeLessThanOrEqual(Math.ceil(base * 1.25) + 1);
      }
    });
    // tekrar bozunumu: 10 dk penceresinde ardışık işler azalır, zeminde (≥ 0,4) kalır
    const city = ensureCityState({ kredi: 0 });
    const j = job('kurye', 100);
    let last = Infinity;
    for (let i = 0; i < 12; i++) {
      const res = applyJobResult(city, j, { t: 10, limit: 100, nowSec: 1000 + i, bumps: 0 });
      expect(res.kredi).toBeLessThanOrEqual(last);
      expect(res.decay).toBeGreaterThanOrEqual(JOB_LIMITS.decayFloor);
      expect(res.decay).toBeLessThanOrEqual(1);
      last = res.kredi;
    }
    expect(repeatDecay(city.jobs.log, 1000 + 20)).toBe(JOB_LIMITS.decayFloor);
    expect(repeatDecay(city.jobs.log, 1000 + 20 + JOB_LIMITS.decayWindow + 5)).toBe(1);
    expect(repeatDecay([NaN, 'x', -1e9, 1e30], 5)).toBeGreaterThanOrEqual(JOB_LIMITS.decayFloor);
    expect(city.jobs.log.length).toBeLessThanOrEqual(JOB_LIMITS.logMax);
  });

  it('yarış ödülü: madalya basamağı ilk kez yükselince tam, sonra %25; geçersiz (çok hızlı) süre ödül vermez; hostile süre atmaz', () => {
    const medals = {
      bot: 55, gold: 60, silver: 70, bronze: 85, minValid: 48,
    };
    const city = ensureCityState({ kredi: 0 });
    expect(applyRaceResult(city, 0, 'spor', 30, medals).valid).toBe(false);
    expect(applyRaceResult(city, 0, 'spor', 30, medals).kredi).toBe(0);
    const a = applyRaceResult(city, 0, 'spor', 90, medals);
    expect(a.kredi).toBe(KREDI.race[a.medal]);
    const b = applyRaceResult(city, 0, 'spor', 90, medals);
    expect(b.kredi).toBe(Math.round(KREDI.race[b.medal] * 0.25));
    const g = applyRaceResult(city, 0, 'spor', 59, medals);
    expect(g.medal).toBe(3);
    expect(g.kredi).toBe(KREDI.race[3]);
    expect(applyRaceResult(city, 0, 'spor', 59, medals).kredi).toBe(Math.round(KREDI.race[3] * 0.25));
    HOSTILE.forEach((t) => {
      let r;
      expect(() => { r = applyRaceResult(ensureCityState({}), 1, 'taksi', t, medals); }).not.toThrow();
      expect(Number.isFinite(r.kredi) && r.kredi >= 0).toBe(true);
    });
  });

  it('keşif ödülleri tek sefer: çip/grafiti/oda ikinci kez "yeni" sayılmaz; hostile kimlikler reddedilir', () => {
    const ds = emptyDiscovery();
    [0, 17, 239].forEach((i) => { expect(markChip(ds, i)).toBe(true); expect(markChip(ds, i)).toBe(false); });
    [3, 40, 89].forEach((i) => { expect(paintGraffiti(ds, i, 1, 1)).toBe(true); expect(paintGraffiti(ds, i, 2, 3)).toBe(false); });
    [0, 12, 29].forEach((i) => { expect(markRoom(ds, i)).toBe(true); expect(markRoom(ds, i)).toBe(false); });
    const bad = HOSTILE.filter((v) => !(Number.isInteger(v) && v >= 0 && v < 30)).concat([-5, 1.5]);
    bad.forEach((i) => {
      expect(markChip(ds, i), 'çip ' + String(i)).toBe(false);
      expect(paintGraffiti(ds, i, 0, 0), 'grafiti ' + String(i)).toBe(false);
      expect(markRoom(ds, i), 'oda ' + String(i)).toBe(false);
    });
    expect(markChip(ds, 240)).toBe(false);
    expect(paintGraffiti(ds, 90, 0, 0)).toBe(false);
    expect(markRoom(ds, 30)).toBe(false);
    // en çok kazanılabilir tek-sefer Kredi (kayıt başına) sınırlı ve belgeli: çip + grafiti + oda
    const oneTime = 240 * KREDI.chip + 90 * KREDI.graffiti + 30 * KREDI.room;
    expect(oneTime).toBeLessThan(5000);
  });
});

describe('qa5 ekonomi — jeton talepleri (istemci)', () => {
  it('anahtar kümesi ve tutarlar sabit (toplam 150); evaluateClaims yalnız kural sağlanınca 1 yapar, 2\'yi/1\'i bozmaz', () => {
    expect(NEON_CLAIMS).toEqual(['neon:firstjob', 'neon:goldrace', 'neon:chips60', 'neon:easter']);
    expect(Object.keys(NEON_AMOUNTS).reduce((a, k) => a + NEON_AMOUNTS[k], 0)).toBe(150);
    const city = { claims: {} };
    expect(evaluateClaims(city, { jobsDone: 0, goldMedals: 0, chipsFound: 59, easter: 0 })).toEqual([]);
    expect(evaluateClaims(city, { jobsDone: 1, goldMedals: 0, chipsFound: 60, easter: 0 }).sort()).toEqual(['chips60', 'firstjob']);
    expect(markClaimed(city, 'neon:firstjob')).toBe(true);
    expect(evaluateClaims(city, { jobsDone: 5, goldMedals: 1, chipsFound: 240, easter: 1 }).sort()).toEqual(['easter', 'goldrace']);
    expect(city.claims).toEqual({
      firstjob: 2, chips60: 1, goldrace: 1, easter: 1,
    });
    expect(pendingClaims(city).sort()).toEqual(['neon:chips60', 'neon:easter', 'neon:goldrace']);
    // hostile görünüm atmaz
    HOSTILE.forEach((v) => expect(() => evaluateClaims({ claims: {} }, { jobsDone: v, goldMedals: v, chipsFound: v, easter: v })).not.toThrow());
  });

  it('sunucu yapılandırmasıyla birebir (API deposu yanındaysa): tutarlar, anahtarlar, asgari süreler', () => {
    const p = fileURLToPath(new URL('../../../../../girlsandguys-api-v10/config/game_kesif.php', import.meta.url));
    if (!existsSync(p)) return;
    const text = readFileSync(p, 'utf8');
    // 'neon' => [...] iki kez geçer: rewards.neon (tutar) ve reward_gates.min_seconds.neon (asgari süre)
    const block = (section) => {
      const neon = new RegExp('\'' + section + '\'\\s*=>\\s*\\[[\\s\\S]*?\'neon\'\\s*=>\\s*\\[([^\\]]*)\\]').exec(text);
      expect(neon, section).toBeTruthy();
      const out = {};
      const re = /'(\w+)'\s*=>\s*(\d+)/g;
      let m = re.exec(neon[1]);
      while (m) { out[m[1]] = Number(m[2]); m = re.exec(neon[1]); }
      return out;
    };
    expect(block('rewards')).toEqual(NEON_AMOUNTS);
    expect(block('min_seconds')).toEqual({
      firstjob: 600, goldrace: 900, chips60: 1800, easter: 300,
    });
  });

  it('talep kuyruğu: rastgele ağ hataları altında tek uçuşta istek, başarıda durur, kalıcı hata onaylı sayılır, geri çekilme ≤ 600 sn; anahtar kararlı', async () => {
    const errs = [{ status: 500 }, { status: 0 }, { status: 429 }, { status: 422, data: { reason: 'too_early' } }, { status: 422, data: { reason: 'no_session' } }, new Error('ağ'), { status: 502 }];
    for (let s = 0; s < 40; s++) {
      const rng = seededRandom(1234 + s);
      const city = ensureCityState({ claims: { firstjob: 1, goldrace: 1, chips60: 1, easter: 1 } });
      let t = 0;
      let inflight = 0;
      let maxInflight = 0;
      const calls = [];
      const sentIdem = {};
      const q = createClaimQueue({
        getCity: () => city,
        now: () => t,
        transport: (key, idem) => {
          calls.push([t, key, idem]);
          inflight++;
          maxInflight = Math.max(maxInflight, inflight);
          (sentIdem[key] = sentIdem[key] || []).push(idem);
          return new Promise((resolve, reject) => {
            const r = rng.next();
            Promise.resolve().then(() => {
              inflight--;
              if (r < 0.45) reject(rng.pick(errs));
              else if (r < 0.52) reject({ status: 409 });
              else if (r < 0.55) reject({ status: 401 });
              else if (r < 0.6) resolve({ claimed: false });
              else resolve({ claimed: true });
            });
          });
        },
      });
      const flush = async () => { for (let k = 0; k < 8; k++) await Promise.resolve(); };
      for (let i = 0; i < 1500; i++) {
        t += 1 + rng.int(0, 40);
        q.tick();
        await flush();
      }
      // anahtar başına tek uçuş (4 anahtar → en çok 4 eşzamanlı)
      expect(maxInflight, 'eşzamanlı uçuş').toBeLessThanOrEqual(4);
      const by = {};
      calls.forEach(([ct, k]) => { (by[k] = by[k] || []).push(ct); });
      NEON_CLAIMS.forEach((k) => {
        // anahtar başına idempotency öneki kararlı, deneme numarası artar, tekrarlar benzersiz
        const ids = sentIdem[k] || [];
        expect(new Set(ids).size).toBe(ids.length);
        ids.forEach((id, i) => expect(id).toBe('neon-' + k.slice(5) + '-' + (i + 1)));
        // ardışık denemeler arasında en az ilk geri çekilme (30 sn): sık yoklama yok
        (by[k] || []).forEach((ct, i) => { if (i > 0) expect(ct - by[k][i - 1], k + ' deneme aralığı').toBeGreaterThanOrEqual(1); });
        // onaylanan (2) anahtar bir daha gönderilmez: son çağrıdan sonra tick'ler onu göndermemiştir
        if (city.claims[k.slice(5)] === 2) expect(q.pending()).not.toContain(k);
      });
    }
    expect(BACKOFF[BACKOFF.length - 1]).toBe(600);
    expect(REEMIT_SEC).toBe(90);
  });

  it('olay kipi: ilk kazanımda hemen yayılır, sonra her 90 sn, onaylanınca durur; giriş yokken hiçbir şey yayılmaz ama kayıtta bekler', async () => {
    const city = ensureCityState({ claims: { easter: 1 } });
    const sent = [];
    let on = false;
    let t = 0;
    const q = createClaimQueue({ getCity: () => city, now: () => t, emit: (e) => sent.push(e), enabled: () => on });
    for (let i = 0; i < 20; i++) { t += 10; q.tick(); }
    expect(sent).toEqual([]);
    expect(q.stats.skipped).toBeGreaterThan(0);
    expect(city.claims.easter).toBe(1);
    on = true;
    q.tick();
    expect(sent).toEqual([{ type: 'reward', key: 'neon:easter' }]);
    t += REEMIT_SEC - 1;
    q.tick();
    expect(sent.length).toBe(1);
    t += 2;
    q.tick();
    expect(sent.length).toBe(2);
    expect(q.onClaimed('neon:easter')).toBe(true);
    t += 1000;
    q.tick();
    expect(sent.length).toBe(2);
    expect(q.pending()).toEqual([]);
  });
});
