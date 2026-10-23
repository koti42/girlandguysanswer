// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createKesifApi, cleanParams } from './kesifApiFactory';

const envelope = (data) => ({ data: { success: true, message: 'ok', data } });

function fakeHttp(data = { ok: 1 }) {
    const res = () => Promise.resolve(envelope(data));
    return {
        get: vi.fn(res),
        post: vi.fn(res),
        put: vi.fn(res),
        delete: vi.fn(res),
    };
}

const UUID = '3f1b2c4d-0000-4000-8000-123456789abc';

describe('createKesifApi', () => {
    it('overview: GET /game/kesif/overview, zarfı açar', async () => {
        const http = fakeHttp({ profile: { map_slots: 5 } });
        const k = createKesifApi(http);
        await expect(k.overview()).resolves.toEqual({ profile: { map_slots: 5 } });
        expect(http.get).toHaveBeenCalledWith('/game/kesif/overview', { timeout: 15000 });
    });

    it('zarf boşsa boş nesne döner (çökmez)', async () => {
        const http = { get: vi.fn(() => Promise.resolve({ data: {} })) };
        await expect(createKesifApi(http).overview()).resolves.toEqual({});
    });

    it('maps: sort/q/page sorgusu, boş q atılır, q kırpılır', async () => {
        const http = fakeHttp();
        const k = createKesifApi(http);
        await k.maps({ sort: 'popular', q: '  vadi ', page: 3 });
        expect(http.get).toHaveBeenLastCalledWith('/game/kesif/maps', { params: { sort: 'popular', q: 'vadi', page: 3 }, timeout: 15000 });
        await k.maps({ q: '   ' });
        expect(http.get).toHaveBeenLastCalledWith('/game/kesif/maps', { params: { sort: 'new', page: 1 }, timeout: 15000 });
        await k.maps();
        expect(http.get).toHaveBeenLastCalledWith('/game/kesif/maps', { params: { sort: 'new', page: 1 }, timeout: 15000 });
    });

    it('mine ve map: doğru yollar; id kaçışlanır', async () => {
        const http = fakeHttp();
        const k = createKesifApi(http);
        await k.mine();
        expect(http.get).toHaveBeenLastCalledWith('/game/kesif/maps/mine', { timeout: 15000 });
        await k.map(UUID);
        expect(http.get).toHaveBeenLastCalledWith(`/game/kesif/maps/${UUID}`, { timeout: 20000 });
        await k.map('a/b?c');
        expect(http.get.mock.calls[http.get.mock.calls.length - 1][0]).toBe('/game/kesif/maps/a%2Fb%3Fc');
    });

    it('createMap / updateMap: gövde yalnızca verilen alanları taşır, Idempotency-Key ekler', async () => {
        const http = fakeHttp();
        const k = createKesifApi(http);
        const data = { v: 1, chunks: {} };
        await k.createMap({ title: 'Vadi', description: 'güzel', data });
        const [url, body, cfg] = http.post.mock.calls[0];
        expect(url).toBe('/game/kesif/maps');
        expect(body).toEqual({ title: 'Vadi', description: 'güzel', data });
        expect(cfg.headers['Idempotency-Key']).toBeTruthy();
        expect(cfg.timeout).toBe(30000);

        await k.updateMap(UUID, { title: 'Yeni ad' });
        const [putUrl, putBody, putCfg] = http.put.mock.calls[0];
        expect(putUrl).toBe(`/game/kesif/maps/${UUID}`);
        expect(putBody).toEqual({ title: 'Yeni ad' });
        expect(Object.keys(putBody)).toEqual(['title']);
        expect(putCfg.headers['Idempotency-Key']).toBeTruthy();

        // null açıkça gönderilebilir (açıklamayı / kapağı temizle)
        await k.updateMap(UUID, { description: null, cover: null });
        expect(http.put.mock.calls[1][1]).toEqual({ description: null, cover: null });
    });

    it('deleteMap / publish / unpublish / like / play doğru yol ve yöntem', async () => {
        const http = fakeHttp();
        const k = createKesifApi(http);
        await k.deleteMap(UUID);
        expect(http.delete.mock.calls[0][0]).toBe(`/game/kesif/maps/${UUID}`);
        expect(http.delete.mock.calls[0][1].headers['Idempotency-Key']).toBeTruthy();
        await k.publish(UUID);
        await k.unpublish(UUID);
        await k.like(UUID);
        await k.play(UUID);
        expect(http.post.mock.calls.map((c) => c[0])).toEqual([
            `/game/kesif/maps/${UUID}/publish`,
            `/game/kesif/maps/${UUID}/unpublish`,
            `/game/kesif/maps/${UUID}/like`,
            `/game/kesif/maps/${UUID}/play`,
        ]);
    });

    it('report: neden + kırpılmış not; boş not gönderilmez', async () => {
        const http = fakeHttp();
        const k = createKesifApi(http);
        await k.report(UUID, { reason: 'spam', note: '  reklam  ' });
        expect(http.post.mock.calls[0][0]).toBe(`/game/kesif/maps/${UUID}/report`);
        expect(http.post.mock.calls[0][1]).toEqual({ reason: 'spam', note: 'reklam' });
        await k.report(UUID, { reason: 'diger', note: '' });
        expect(http.post.mock.calls[1][1]).toEqual({ reason: 'diger' });
    });

    it('buySlots: boş gövde, her çağrıda FARKLI Idempotency-Key', async () => {
        const http = fakeHttp();
        const k = createKesifApi(http);
        await k.buySlots();
        await k.buySlots();
        const [url, body, cfg1] = http.post.mock.calls[0];
        const cfg2 = http.post.mock.calls[1][2];
        expect(url).toBe('/game/kesif/slots/buy');
        expect(body).toEqual({});
        expect(cfg1.headers['Idempotency-Key']).toBeTruthy();
        expect(cfg1.headers['Idempotency-Key']).not.toBe(cfg2.headers['Idempotency-Key']);
    });

    it('Idempotency-Key randomUUID yoksa yedek biçime düşer', async () => {
        const original = window.crypto;
        Object.defineProperty(window, 'crypto', { value: {}, configurable: true });
        try {
            const http = fakeHttp();
            await createKesifApi(http).buySlots();
            expect(http.post.mock.calls[0][2].headers['Idempotency-Key']).toMatch(/^kesif_\d+_[0-9a-f]+$/);
        } finally {
            Object.defineProperty(window, 'crypto', { value: original, configurable: true });
        }
    });

    it('getSave / putSave: kayıt { save } içinde gider', async () => {
        const http = fakeHttp();
        const k = createKesifApi(http);
        await k.getSave();
        expect(http.get).toHaveBeenLastCalledWith('/game/kesif/save', { timeout: 20000 });
        const save = { v: 1, mode: 'macera', seed: 'ABCD1234' };
        await k.putSave(save);
        expect(http.put.mock.calls[0][0]).toBe('/game/kesif/save');
        expect(http.put.mock.calls[0][1]).toEqual({ save });
        expect(http.put.mock.calls[0][2].headers['Idempotency-Key']).toBeTruthy();
    });

    it('claim: yalnızca anahtar (+ isteğe bağlı seed); tutar gönderilmez', async () => {
        const http = fakeHttp();
        const k = createKesifApi(http);
        await k.claim('zone:1:boss', 'ABCD1234');
        expect(http.post.mock.calls[0][0]).toBe('/game/kesif/claim');
        expect(http.post.mock.calls[0][1]).toEqual({ key: 'zone:1:boss', seed: 'ABCD1234' });
        await k.claim('world:conquered');
        expect(http.post.mock.calls[1][1]).toEqual({ key: 'world:conquered' });
    });

    it('playStart / playPing: macera oturumu uçları; Idempotency-Key yok, süre tam sayıya indirilir', async () => {
        const http = fakeHttp({ session: { world_code: 'ABCD1234' }, created: true });
        const k = createKesifApi(http);
        await expect(k.playStart('ABCD1234')).resolves.toEqual({ session: { world_code: 'ABCD1234' }, created: true });
        expect(http.post).toHaveBeenLastCalledWith('/game/kesif/play/start', { world_code: 'ABCD1234', mode: 'macera' }, { timeout: 10000 });
        await k.playPing('ABCD1234', 125.9);
        expect(http.post).toHaveBeenLastCalledWith('/game/kesif/play/ping', { world_code: 'ABCD1234', play_seconds: 125 }, { timeout: 10000 });
        await k.playPing('ABCD1234', -3);
        expect(http.post.mock.calls[2][1].play_seconds).toBe(0);
        await k.playPing('ABCD1234', 'abc');
        expect(http.post.mock.calls[3][1].play_seconds).toBe(0);
    });

    it('hata olduğu gibi fırlatılır (409/422 çağırana ulaşır)', async () => {
        const err = Object.assign(new Error('x'), { response: { status: 422, data: { data: { reason: 'insufficient' } } } });
        const http = { post: vi.fn(() => Promise.reject(err)) };
        await expect(createKesifApi(http).buySlots()).rejects.toBe(err);
    });
});

describe('cleanParams', () => {
    it('undefined/null/boş metni atar, sayıları korur', () => {
        expect(cleanParams({ a: undefined, b: null, c: ' ', d: 0, e: 'x ' })).toEqual({ d: 0, e: 'x' });
    });
});

describe('createKesifApi — Keşif görünümleri (mağaza yükü)', () => {
    it('loadout: GET /game/kesif/loadout, 2,5 sn zaman aşımı, zarfı açar (oyun açılışını bekletmez)', async () => {
        const http = fakeHttp({ loadout: { portal: 'portal:neon-sokak', alet: null } });
        const k = createKesifApi(http);
        await expect(k.loadout()).resolves.toEqual({ loadout: { portal: 'portal:neon-sokak', alet: null } });
        expect(http.get).toHaveBeenCalledWith('/game/kesif/loadout', { timeout: 2500 });
        expect(http.post).not.toHaveBeenCalled();
        expect(http.put).not.toHaveBeenCalled();
    });

    it('loadout: zarf boşsa boş nesne; ağ hatası olduğu gibi fırlar (çağıran varsayılan görünüme düşer)', async () => {
        await expect(createKesifApi({ get: vi.fn(() => Promise.resolve({ data: {} })) }).loadout()).resolves.toEqual({});
        const err = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
        await expect(createKesifApi({ get: vi.fn(() => Promise.reject(err)) }).loadout()).rejects.toBe(err);
    });
});
