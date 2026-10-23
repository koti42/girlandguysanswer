import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  KEY_RE, NEON_AMOUNTS, NEON_CLAIMS, claimKey, evaluateClaims, isNeonKey, markClaimed, pendingClaims, reduceEvent, shortKey,
} from './cityEvents.js';
import { ensureCityState, metricsOf, statGet } from './cityState.js';
import { createClaimQueue, BACKOFF, REEMIT_SEC } from './mission/claimQueue.js';
import { markChip } from './mission/discovery.js';

describe('cityEvents: neon:* anahtarları', () => {
  it('dört anahtar, regex\'e uyar (alt çizgi yok), tek-seferlik, tutarlar sözleşmeyle (20/40/60/30)', () => {
    expect(NEON_CLAIMS).toEqual(['neon:firstjob', 'neon:goldrace', 'neon:chips60', 'neon:easter']);
    NEON_CLAIMS.forEach((k) => {
      expect(KEY_RE.test(k)).toBe(true);
      expect(isNeonKey(k)).toBe(true);
      expect(claimKey(shortKey(k))).toBe(k);
    });
    expect(Object.values(NEON_AMOUNTS).reduce((a, b) => a + b, 0)).toBe(150);
    ['neon:x', 'neon:', 'macera:ilk', 5, null, 'neon:first_job'].forEach((k) => expect(isNeonKey(k)).toBe(false));
    expect(claimKey('yok')).toBeNull();
  });

  it('web anahtar listesi API config/game_kesif.php ile birebir (yan yana depo varsa)', () => {
    const p = path.resolve(globalThis.process.cwd(), '..', 'girlsandguys-api-v10', 'config', 'game_kesif.php');
    if (!fs.existsSync(p)) return;
    const php = fs.readFileSync(p, 'utf8');
    const grab = (re) => {
      const m = re.exec(php);
      expect(m, re.toString()).not.toBeNull();
      const o = {};
      m[1].split(',').forEach((pair) => {
        const kv = /'([a-z0-9]+)'\s*=>\s*(\d+)/.exec(pair);
        if (kv) o[kv[1]] = Number(kv[2]);
      });
      return o;
    };
    const rewards = grab(/'rewards'[\s\S]*?'neon'\s*=>\s*\[([^\]]*)\]/);
    expect(Object.keys(rewards).sort()).toEqual(Object.keys(NEON_AMOUNTS).sort());
    Object.keys(NEON_AMOUNTS).forEach((k) => expect(rewards[k]).toBe(NEON_AMOUNTS[k]));
    const gates = grab(/'min_seconds'[\s\S]*?'neon'\s*=>\s*\[([^\]]*)\]/);
    expect(Object.keys(gates).sort()).toEqual(Object.keys(NEON_AMOUNTS).sort());
  });

  it('evaluateClaims: ölçüt sağlanınca bir kez bekleyen (1) olur; tekrar edilmez; markClaimed 2 yapar', () => {
    const c = ensureCityState({});
    expect(evaluateClaims(c, metricsOf(c))).toEqual([]);
    c.stats.jobsDone = 1;
    expect(evaluateClaims(c, metricsOf(c))).toEqual(['firstjob']);
    expect(evaluateClaims(c, metricsOf(c))).toEqual([]);
    expect(pendingClaims(c)).toEqual(['neon:firstjob']);
    for (let i = 0; i < 60; i++) markChip(c.discovery, i);
    c.stats.goldMedals = 1;
    c.stats.easter = 1;
    expect(evaluateClaims(c, metricsOf(c)).sort()).toEqual(['chips60', 'easter', 'goldrace']);
    expect(markClaimed(c, 'neon:firstjob')).toBe(true);
    expect(markClaimed(c, 'neon:firstjob')).toBe(false);
    expect(markClaimed(c, 'neon:yok')).toBe(false);
    expect(c.claims.firstjob).toBe(2);
    expect(pendingClaims(c).sort()).toEqual(['neon:chips60', 'neon:easter', 'neon:goldrace']);
    // onaylı anahtar yeniden kazanılmaz
    c.claims.firstjob = 2;
    expect(evaluateClaims(c, metricsOf(c))).toEqual([]);
  });

  it('59 çip jeton talebi vermez, 60. verir', () => {
    const c = ensureCityState({});
    for (let i = 0; i < 59; i++) markChip(c.discovery, i);
    expect(evaluateClaims(c, metricsOf(c))).toEqual([]);
    markChip(c.discovery, 59);
    expect(evaluateClaims(c, metricsOf(c))).toEqual(['chips60']);
  });
});

describe('cityEvents: olay indirgeyici', () => {
  it('sayaçlar: dimensionEntered/terminalFound/lockOpened/robotDissolved/photo/bump/kredi/garagePaint/diyarIsigi; bilinmeyen olay değişiklik yapmaz', () => {
    const c = ensureCityState({});
    const owners = new Set(['dr_bolt']);
    expect(reduceEvent(c, { type: 'dimensionEntered', dim: 'overworld' }).changed).toBe(false);
    expect(reduceEvent(c, { type: 'dimensionEntered', dim: 'neon', first: true }).changed).toBe(true);
    expect(statGet(c, 'dimHops')).toBe(1);
    expect(reduceEvent(c, { type: 'terminalFound', index: 3 }).changed).toBe(true);
    expect(reduceEvent(c, { type: 'terminalFound', index: 3 }).changed).toBe(false);
    expect(reduceEvent(c, { type: 'terminalFound', index: 99 }).changed).toBe(false);
    reduceEvent(c, { type: 'lockOpened' });
    reduceEvent(c, { type: 'robotDissolved' });
    reduceEvent(c, { type: 'photo' });
    reduceEvent(c, { type: 'photoTaken' });
    reduceEvent(c, { type: 'bump', impact: 5 });
    reduceEvent(c, { type: 'driftBoost' });
    reduceEvent(c, { type: 'vehicleRent' });
    reduceEvent(c, { type: 'garagePaint' });
    reduceEvent(c, { type: 'kredi', delta: 25 });
    reduceEvent(c, { type: 'kredi', delta: -10 });
    reduceEvent(c, { type: 'kredi', delta: NaN });
    expect(statGet(c, 'locksOpened')).toBe(1);
    expect(statGet(c, 'robotsDissolved')).toBe(1);
    expect(statGet(c, 'photosTaken')).toBe(2);
    expect(statGet(c, 'bumps')).toBe(1);
    expect(statGet(c, 'krediEarned')).toBe(25);
    expect(statGet(c, 'paintJobs')).toBe(1);
    expect(reduceEvent(c, { type: 'diyarIsigi' }).changed).toBe(true);
    expect(reduceEvent(c, { type: 'diyarIsigi' }).changed).toBe(false);
    expect(statGet(c, 'easter')).toBe(1);
    // sahip tanışma: yalnız sahip kimlikleri, tekrar sayılmaz
    const r = reduceEvent(c, { type: 'npcTalk', npc: 'dr_bolt', first: true }, { ownerIds: owners });
    expect(r.notes).toEqual([{ type: 'owner', id: 'dr_bolt' }]);
    expect(reduceEvent(c, { type: 'npcTalk', npc: 'dr_bolt' }, { ownerIds: owners }).notes).toEqual([]);
    expect(reduceEvent(c, { type: 'npcTalk', npc: 'rehber_zeynep' }, { ownerIds: (id) => owners.has(id) }).notes).toEqual([]);
    expect(c.discovery.shops).toEqual(['dr_bolt']);
    expect(statGet(c, 'talks')).toBe(3);
    ['', null, 5, { type: 5 }, { type: 'bilinmez' }, { type: '__proto__' }].forEach((e) => expect(reduceEvent(c, e).changed).toBe(false));
  });
});

describe('claimQueue: çevrimdışı kuyruk, geri çekilme, idempotency, giriş yok', () => {
  function setup(opts) {
    const o = opts || {};
    const city = ensureCityState({});
    const st = { t: 0, emitted: [], calls: [], enabled: o.enabled !== false };
    const q = createClaimQueue({
      getCity: () => city,
      now: () => st.t,
      enabled: () => st.enabled,
      emit: (e) => st.emitted.push(e),
      transport: o.transport,
    });
    return { city, st, q };
  }

  it('olay kipi: kazanınca hemen bir kez, sonra yalnız her 90 sn yeniden yayar; onaylanınca durur', () => {
    const { city, st, q } = setup();
    city.claims.firstjob = 1;
    expect(q.tick()).toBe(1);
    expect(st.emitted).toEqual([{ type: 'reward', key: 'neon:firstjob' }]);
    st.t = 30;
    expect(q.tick()).toBe(0);
    st.t = REEMIT_SEC + 1;
    expect(q.tick()).toBe(1);
    expect(st.emitted).toHaveLength(2);
    expect(q.onClaimed('neon:firstjob')).toBe(true);
    st.t = 1000;
    expect(q.tick()).toBe(0);
    expect(st.emitted).toHaveLength(2);
    expect(city.claims.firstjob).toBe(2);
    expect(q.onClaimed('neon:firstjob')).toBe(false);
  });

  it('giriş yapılmamışken (enabled=false) hiçbir şey yayılmaz; sonra girince kuyruk kayıttan devam eder', () => {
    const { city, st, q } = setup({ enabled: false });
    city.claims.goldrace = 1;
    st.t = 5;
    expect(q.tick()).toBe(0);
    expect(st.emitted).toHaveLength(0);
    expect(q.stats.skipped).toBe(1);
    expect(q.pending()).toEqual(['neon:goldrace']);
    st.enabled = true;
    expect(q.tick()).toBe(1);
    expect(st.emitted[0].key).toBe('neon:goldrace');
  });

  it('doğrudan kip: başarı → onaylı; 5xx/ağ → geri çekilme 30·60·120…; 409 → onaylı say; 401 → durdur; kimlik kararlı', async () => {
    const calls = [];
    let mode = 'net';
    const transport = (key, idem) => {
      calls.push([key, idem]);
      if (mode === 'ok') return Promise.resolve({ claimed: true });
      if (mode === '409') return Promise.reject({ status: 409 });
      if (mode === '401') return Promise.reject({ response: { status: 401 } });
      if (mode === 'cap') return Promise.resolve({ claimed: false });
      return Promise.reject(new Error('ağ'));
    };
    const { city, st, q } = setup({ transport });
    city.claims.chips60 = 1;
    expect(q.direct).toBe(true);
    expect(q.tick()).toBe(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(q.stats.retried).toBe(1);
    expect(q.nextAt('neon:chips60')).toBe(BACKOFF[0]);
    st.t = 10;
    expect(q.tick()).toBe(0); // henüz erken
    st.t = BACKOFF[0] + 1;
    expect(q.tick()).toBe(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(q.nextAt('neon:chips60')).toBe(st.t + BACKOFF[1]);
    expect(calls.map((c) => c[1])).toEqual(['neon-chips60-1', 'neon-chips60-2']);
    // günlük tavan: tüketilmez, yarın
    mode = 'cap';
    st.t += BACKOFF[1] + 1;
    q.tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(city.claims.chips60).toBe(1);
    expect(q.nextAt('neon:chips60')).toBe(st.t + BACKOFF[BACKOFF.length - 1]);
    // başarı
    mode = 'ok';
    st.t += 700;
    q.tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(city.claims.chips60).toBe(2);
    expect(q.pending()).toEqual([]);
    // 409 already_claimed onaylı sayılır; 401 durdurur
    city.claims.easter = 1;
    mode = '409';
    st.t += 5;
    q.tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(city.claims.easter).toBe(2);
    city.claims.firstjob = 1;
    mode = '401';
    q.tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(city.claims.firstjob).toBe(1);
    expect(q.nextAt('neon:firstjob')).toBeGreaterThan(st.t + 3000);
  });

  it('oyunu bloklamaz: transport hata fırlatsa da tick atmaz; blob yokken güvenli', () => {
    const { city, st, q } = setup({ transport: () => { throw new Error('boom'); } });
    city.claims.firstjob = 1;
    expect(() => q.tick()).not.toThrow();
    st.t = 1;
    const q2 = createClaimQueue({ getCity: () => null, now: () => 0, emit: () => {} });
    expect(q2.tick()).toBe(0);
    expect(q2.pending()).toEqual([]);
  });
});

describe('web istemcisi anahtar listesi', () => {
  it('services/kesifApiFactory.NEON_CLAIM_KEYS = cityEvents.NEON_CLAIMS', async () => {
    const { NEON_CLAIM_KEYS, createKesifApi } = await import('../../../../services/kesifApiFactory.js');
    expect(NEON_CLAIM_KEYS).toEqual(NEON_CLAIMS);
    const calls = [];
    const http = { post: (url, body) => { calls.push([url, body]); return Promise.resolve({ data: { data: { claimed: true } } }); } };
    const api = createKesifApi(http);
    await expect(api.claimNeon('neon:chips60', 'ABC123')).resolves.toEqual({ claimed: true });
    expect(calls[0][0]).toBe('/game/kesif/claim');
    expect(calls[0][1]).toEqual({ key: 'neon:chips60', seed: 'ABC123' });
    await expect(api.claimNeon('macera:ilk')).rejects.toMatchObject({ response: { status: 400 } });
    expect(calls).toHaveLength(1);
  });
});
