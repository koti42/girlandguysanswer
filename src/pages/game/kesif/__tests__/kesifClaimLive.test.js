// @vitest-environment node
import { describe, expect, it } from 'vitest';
import axios from 'axios';
import { execFileSync } from 'node:child_process';
import { createKesifApi, NEON_CLAIM_KEYS } from '../../../../services/kesifApiFactory';
import { createRewardClaimer } from '../kesifSessionUtils';
import { NEON_AMOUNTS, NEON_CLAIMS } from '../../../../game/kesif/sim/city/cityEvents';

/*
 * qa_p4 — YEREL API'YE KARŞI (canlı) NEON TALEP AKIŞI. Varsayılan olarak ATLANIR; yalnız ortam değişkenleri verilirse koşar:
 *   KESIF_CLAIM_LIVE=http://127.0.0.1:8913/api   KESIF_CLAIM_TOKEN=<sanctum jetonu>   KESIF_CLAIM_DB=<ayrı sqlite dosyası>   KESIF_CLAIM_PHP_DIR=<API kökü>
 * Sunucu, geliştirme veritabanından AYRI bir sqlite dosyasıyla başlatılmış bir `php -S` olmalıdır (geliştirici verisine dokunulmaz).
 * Süre kapısı: oturum satırının `started_at`ı yalnız bu AYRI veritabanında geriye alınır (gerçek zaman beklemeden).
 * Doğrulanan: web `createKesifApi` + `createRewardClaimer` gerçek ağda; oturumsuz 422 no_session → play/start → too_early (kalan sn) → süre dolunca 4 anahtar
 * (20/40/60/30, toplam 150) → tekrar (aynı Idempotency-Key = yeniden oynatma; yeni anahtar = 409 already_claimed) → bozuk/yabancı anahtarlar → giriş yok (401) → kuyruk.
 */
const ENV = (globalThis.process && globalThis.process.env) || {};
const BASE = ENV.KESIF_CLAIM_LIVE || '';
const TOKEN = ENV.KESIF_CLAIM_TOKEN || '';
const DB = ENV.KESIF_CLAIM_DB || '';
const PHP_DIR = ENV.KESIF_CLAIM_PHP_DIR || '';
const live = Boolean(BASE && TOKEN && DB && PHP_DIR);
const WORLD = 'QAP4NEO1';

function sqlite(sql) {
    // yalnız AYRI qa veritabanı; php PDO ile
    const code = `$p=new PDO('sqlite:'.$argv[1]);$r=$p->query($argv[2]);if($r){foreach($r as $row){echo json_encode($row),"\\n";}}`;
    return execFileSync('php', ['-r', code, DB, sql], { encoding: 'utf8' }).trim();
}

const http = (token) => axios.create({
    baseURL: BASE, timeout: 20000, headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, validateStatus: () => true,
});

// axios'ta hata fırlatsın (web istemcisi 4xx'te fırlatan axios bekler)
const throwing = (token) => axios.create({ baseURL: BASE, timeout: 20000, headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });

function resetQaDb() {
    // yalnız AYRI qa veritabanı (yol 'qa_p4' içermeli); deneme tekrarlanabilsin diye talep/oturum/cüzdan satırları silinir
    if (!/qa_p4/.test(DB)) throw new Error('KESIF_CLAIM_DB bir qa_p4 dosyası olmalı');
    ['game_kesif_rewards', 'game_kesif_play_sessions', 'game_wallet_transactions', 'game_wallets', 'cache', 'cache_locks'].forEach((t) => {
        try { sqlite(`DELETE FROM ${t}`); } catch { /* tablo adı farklıysa geç */ }
    });
}

const flush = async (ms = 50) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!live)('neon talepleri — yerel API (canlı)', () => {
    it('hazırlık: ayrı qa veritabanı temizlenir', () => { resetQaDb(); });

    it('anahtar listesi web ile API ve tutarlar birebir', () => {
        expect(NEON_CLAIM_KEYS).toEqual(NEON_CLAIMS);
        expect(Object.keys(NEON_AMOUNTS).map((k) => `neon:${k}`)).toEqual(NEON_CLAIMS);
        expect(NEON_CLAIMS.map((k) => NEON_AMOUNTS[k.slice(5)])).toEqual([20, 40, 60, 30]);
    });

    it('giriş yok: talep 401 (ağ dışı ödül yok); web claimer misafirde ağa çıkmaz', async () => {
        const r = await http('').post('/game/kesif/claim', { key: 'neon:easter', seed: WORLD });
        expect(r.status).toBe(401);
        let calls = 0;
        let guest = 0;
        const c = createRewardClaimer({
            getApi: () => ({ claim: () => { calls += 1; return Promise.resolve({ claimed: true }); } }),
            isMember: () => false, getSeed: () => WORLD, onGuest: () => { guest += 1; },
        });
        expect(c.claim('neon:easter')).toBe(false);
        expect(c.claim('neon:easter')).toBe(false);
        expect(calls).toBe(0);
        expect(guest).toBe(1);
    });

    it('oturumsuz talep 422 no_session; claimer play/start açar, süre kapısı too_early (remaining_seconds) verir ve ödül TÜKETİLMEZ', async () => {
        const api = createKesifApi(throwing(TOKEN));
        const raw = await http(TOKEN).post('/game/kesif/claim', { key: 'neon:easter', seed: WORLD });
        expect(raw.status).toBe(422);
        expect(raw.data.data.reason).toBe('no_session');
        const events = [];
        const c = createRewardClaimer({
            getApi: () => api,
            isMember: () => true,
            getSeed: () => WORLD,
            markClaimed: (k) => events.push(['marked', k]),
            onGranted: (k) => events.push(['granted', k]),
            onDeferred: (k, info) => events.push(['deferred', k, info.reason, info.remaining_seconds]),
            startSession: async () => { const s = await api.playStart(WORLD); return Boolean(s && s.session); },
            delays: [10, 10, 10],
        });
        expect(c.claim('neon:easter')).toBe(true);
        for (let i = 0; i < 60 && !events.length; i++) await flush(100);
        const d = events.find((e) => e[0] === 'deferred');
        expect(d, JSON.stringify(events)).toBeTruthy();
        expect(d[2]).toBe('too_early');
        expect(d[3]).toBeGreaterThan(200);
        expect(events.find((e) => e[0] === 'granted')).toBeUndefined();
        expect(events.find((e) => e[0] === 'marked')).toBeUndefined();
        c.dispose();
        const row = sqlite("SELECT COUNT(*) AS n FROM game_kesif_rewards WHERE \"key\" LIKE 'neon:%'");
        expect(JSON.parse(row).n).toBe(0);
    });

    it('süre dolunca 4 anahtar: 20/40/60/30 = 150; aynı Idempotency-Key yeniden oynatılır (cüzdan artmaz); yeni anahtar 409; yabancı/bozuk anahtar reddedilir', async () => {
        // yalnız AYRI veritabanında oturumu geriye al (gerçek zaman beklemeden)
        sqlite("UPDATE game_kesif_play_sessions SET started_at = datetime('now','-4000 seconds'), reported_play_seconds = 3000, baseline_play_seconds = 0, last_seen_at = datetime('now') WHERE world_code = '" + WORLD + "'");
        const api = createKesifApi(throwing(TOKEN));
        const granted = {};
        for (const key of NEON_CLAIMS) {
            const res = await api.claimNeon(key, WORLD);
            expect(res.claimed, key).toBe(true);
            granted[key] = res.amount;
        }
        expect(granted).toEqual({
            'neon:firstjob': 20, 'neon:goldrace': 40, 'neon:chips60': 60, 'neon:easter': 30,
        });
        const wallet = JSON.parse(sqlite('SELECT balance FROM game_wallets LIMIT 1')).balance;
        expect(wallet).toBe(150);

        // aynı Idempotency-Key: yanıt yeniden oynatılır, yeni satır/bakiye yok
        const h = { 'Idempotency-Key': 'qa-p4-replay-1' };
        const a = await http(TOKEN).post('/game/kesif/claim', { key: 'neon:easter', seed: WORLD }, { headers: h });
        const b = await http(TOKEN).post('/game/kesif/claim', { key: 'neon:easter', seed: WORLD }, { headers: h });
        expect(a.status).toBe(409); // hesap başına bir kez: ilk istek zaten alınmış
        expect(b.status).toBe(409);
        expect(b.data).toEqual(a.data);
        const rows = JSON.parse(sqlite("SELECT COUNT(*) AS n FROM game_kesif_rewards WHERE \"key\" LIKE 'neon:%'")).n;
        expect(rows).toBe(4);
        expect(JSON.parse(sqlite('SELECT balance FROM game_wallets LIMIT 1')).balance).toBe(150);

        // bozuk / yabancı anahtarlar (ağa çıkmadan web reddeder; API de reddeder)
        for (const bad of ['neon:firstjob:1', 'neon:Firstjob', 'neon:first_job', 'neon:foo', 'neon:', 'zone:2:boss', 'world:conquered', 'neon:chips61']) {
            const r = await http(TOKEN).post('/game/kesif/claim', { key: bad, seed: WORLD });
            expect([404, 409, 422], `${bad} → ${r.status}`).toContain(r.status);
            expect(r.status, bad).not.toBe(200);
        }
        expect(JSON.parse(sqlite('SELECT balance FROM game_wallets LIMIT 1')).balance).toBe(150);
        await expect(api.claimNeon('zone:1:boss', WORLD)).rejects.toBeTruthy(); // web: neon dışı anahtar ağa çıkmaz
    });

    it('çift tıklama / çakışan istekler: aynı anahtara 5 eşzamanlı talep tek satır; claimer meşgul anahtarı yutar', async () => {
        const api = createKesifApi(throwing(TOKEN));
        const rs = await Promise.all([1, 2, 3, 4, 5].map(() => http(TOKEN).post('/game/kesif/claim', { key: 'neon:goldrace', seed: WORLD })));
        rs.forEach((r) => expect(r.status).toBe(409));
        let n = 0;
        const c = createRewardClaimer({
            getApi: () => ({ claim: (k, s) => { n += 1; return api.claim(k, s); } }),
            isMember: () => true, getSeed: () => WORLD, markClaimed: () => {}, delays: [10],
        });
        expect(c.claim('neon:firstjob')).toBe(true);
        expect(c.claim('neon:firstjob')).toBe(false); // meşgul
        await flush(800);
        expect(n).toBe(1);
        expect(JSON.parse(sqlite("SELECT COUNT(*) AS n FROM game_kesif_rewards WHERE \"key\" LIKE 'neon:%'")).n).toBe(4);
        c.dispose();
    });

    it('sunucu kapalı / ağ hatası: claimer ödülü TÜKETMEZ (kuyrukta kalır) ve yeniden dener', async () => {
        const dead = createKesifApi(axios.create({ baseURL: 'http://127.0.0.1:1/api', timeout: 800 }));
        const live2 = createKesifApi(throwing(TOKEN));
        let target = dead;
        const marked = [];
        const c = createRewardClaimer({
            getApi: () => target, isMember: () => true, getSeed: () => WORLD, markClaimed: (k) => marked.push(k), delays: [50, 50, 50],
        });
        c.claim('neon:chips60');
        await flush(400);
        expect(marked).toEqual([]); // ağ yok: "alındı" denmez
        target = live2;
        c.claim('neon:chips60');
        await flush(400);
        expect(marked).toEqual(['neon:chips60']); // sunucuda zaten alınmış (409) → alındı sayılır
        c.dispose();
    });

    it('saatlik tavan (8): 4 neon + 4 parkur sonrası 9. talep 429 hourly_cap (+retry_after); claimer ertelenir, ödül tüketilmez', async () => {
        const api = createKesifApi(throwing(TOKEN));
        for (const k of ['parkour:1:first', 'parkour:2:first', 'parkour:3:first', 'parkour:4:first']) {
            const r = await api.claim(k, WORLD);
            expect(r.claimed, k).toBe(true);
        }
        const raw = await http(TOKEN).post('/game/kesif/claim', { key: 'parkour:5:first', seed: WORLD });
        expect(raw.status).toBe(429);
        expect(raw.data.data.reason).toBe('hourly_cap');
        expect(raw.data.data.retry_after).toBeGreaterThan(0);
        const deferred = [];
        const marked = [];
        const c = createRewardClaimer({
            getApi: () => api, isMember: () => true, getSeed: () => WORLD, markClaimed: (k) => marked.push(k), onDeferred: (k, info) => deferred.push(info.reason), delays: [10],
        });
        c.claim('parkour:5:first');
        await flush(600);
        expect(deferred).toEqual(['hourly_cap']);
        expect(marked).toEqual([]);
        expect(c.deferredKeys()).toEqual(['parkour:5:first']);
        c.dispose();
        expect(JSON.parse(sqlite("SELECT COUNT(*) AS n FROM game_kesif_rewards")).n).toBe(8);
    });
});
