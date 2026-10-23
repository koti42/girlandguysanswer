import { describe, expect, it, vi } from 'vitest';
import { classifySendError, newClientMessageId, sendWithRetry, isTempMessageId, GENERIC_SEND_ERROR } from './messageSend';

const http = (status, data = {}, headers = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data, headers } });

describe('newClientMessageId', () => {
    it('her çağrıda benzersiz ve temp- önekli', () => {
        const ids = new Set(Array.from({ length: 200 }, () => newClientMessageId()));
        expect(ids.size).toBe(200);
        for (const id of ids) {
            expect(isTempMessageId(id)).toBe(true);
            expect(id.length).toBeLessThanOrEqual(100);
        }
    });
});

describe('classifySendError', () => {
    it('durum kodlarını birbirinden AYRI, doğru Türkçe metinlere eşler', () => {
        const cases = {
            401: /Oturumun sona/,
            403: /mesaj gönderemezsin/,
            408: /zaman aşımı/i,
            413: /çok büyük/,
            422: /geçersiz/,
            429: /Çok hızlı/,
            500: /Sunucuda geçici/,
            502: /ulaşılamıyor/,
            503: /kullanılamıyor/,
            504: /ulaşılamıyor/,
        };
        const seen = new Set();
        for (const [status, re] of Object.entries(cases)) {
            const info = classifySendError(http(Number(status), '<html>gateway</html>'));
            expect(info.message).toMatch(re);
            expect(info.message).not.toBe(GENERIC_SEND_ERROR);
            seen.add(info.message);
        }
        expect(seen.size).toBeGreaterThanOrEqual(8);
    });

    it('sunucunun Türkçe kural mesajını (403 kapı, 422 doğrulama) olduğu gibi gösterir', () => {
        expect(classifySendError(http(403, { message: 'Bu kullanıcı mesaj almıyor.' })).message).toBe('Bu kullanıcı mesaj almıyor.');
        expect(classifySendError(http(422, { message: 'Doğrulama: içerik yok.' })).message).toBe('Doğrulama: içerik yok.');
        // İngilizce Laravel varsayılanı Türkçe karşılığa çevrilir
        expect(classifySendError(http(422, { message: 'Validation error', errors: { content: ['The content field must not be greater than 5000 characters.'] } })).message).toMatch(/5000 karakter/);
    });

    it('5xx gövdesindeki teknik metni (SQL/cURL) kullanıcıya SIZDIRMAZ', () => {
        const info = classifySendError(http(500, { message: 'Failed to send message: cURL error 28' }));
        expect(info.message).not.toMatch(/cURL|Failed/);
    });

    it('401 sunucu metni İngilizce "Unauthenticated." olsa da Türkçe gösterilir', () => {
        expect(classifySendError(http(401, { message: 'Unauthenticated.' })).message).toMatch(/Oturumun sona/);
    });

    it('429 Retry-After süresini metne ekler', () => {
        expect(classifySendError(http(429, {}, { 'retry-after': '12' })).message).toMatch(/12 sn/);
    });

    it('yanıt yoksa ağ / zaman aşımı / çevrimdışı ayrılır ve güvenle yeniden denenebilir', () => {
        const net = classifySendError(Object.assign(new Error('Network Error'), { response: undefined }));
        expect(net.kind).toBe('network');
        expect(net.autoRetry && net.keepBubble).toBe(true);
        const timeout = classifySendError(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }));
        expect(timeout.kind).toBe('timeout');
        expect(timeout.message).not.toBe(net.message);
    });

    it('kural/doğrulama retleri balonu kaldırır, geçici hatalar balonu "tekrar dene" için tutar', () => {
        for (const s of [403, 404, 409, 413, 422]) expect(classifySendError(http(s)).keepBubble).toBe(false);
        for (const s of [401, 408, 429, 500, 502, 503, 504]) expect(classifySendError(http(s)).keepBubble).toBe(true);
    });

    it('otomatik yeniden deneme yalnızca güvenli durumlarda (ağ yok, 408, 502, 503, 504)', () => {
        for (const s of [408, 502, 503, 504]) expect(classifySendError(http(s)).autoRetry).toBe(true);
        for (const s of [401, 403, 422, 429, 500]) expect(classifySendError(http(s)).autoRetry).toBe(false);
    });
});

describe('sendWithRetry', () => {
    it('geçici hatada aynı çağrıyı geri çekilmeyle yeniden dener ve başarıyı döndürür', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(http(503))
            .mockRejectedValueOnce(Object.assign(new Error('Network Error'), { response: undefined }))
            .mockResolvedValueOnce({ data: 'ok' });
        const out = await sendWithRetry(fn, { delays: [0, 0] });
        expect(out).toEqual({ data: 'ok' });
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('güvenli olmayan hatada (422/403/500) yeniden DENEMEZ', async () => {
        for (const s of [403, 422, 500]) {
            const fn = vi.fn().mockRejectedValue(http(s));
            await expect(sendWithRetry(fn, { delays: [0, 0] })).rejects.toBeTruthy();
            expect(fn).toHaveBeenCalledTimes(1);
        }
    });

    it('deneme hakkı bitince son hatayı atar', async () => {
        const fn = vi.fn().mockRejectedValue(http(502));
        await expect(sendWithRetry(fn, { delays: [0, 0] })).rejects.toMatchObject({ response: { status: 502 } });
        expect(fn).toHaveBeenCalledTimes(3);
    });
});
