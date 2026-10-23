import { describe, expect, it, vi } from 'vitest';
import { getRequestFingerprint } from './api';

/**
 * Idempotency-Key parmak izi: aynı istek yeniden denenince aynı anahtar,
 * FARKLI dosya mesajları ise farklı anahtar almalı. Sabit 'form-data' parmak
 * izi, 15 sn içinde atılan ikinci fotoğraf/ses mesajını sunucuda "tekrar"
 * saydırıp kaybettiriyordu.
 */
describe('getRequestFingerprint', () => {
    const fd = (tempId, file) => {
        const f = new FormData();
        f.append('receiver_id', 'u-2');
        f.append('type', 'image');
        f.append('client_temp_id', tempId);
        f.append('file', file);
        return f;
    };

    it('farklı dosya mesajları farklı parmak izi alır', () => {
        const a = getRequestFingerprint({ method: 'post', url: '/messages/send', data: fd('temp-1', new Blob(['aaa'])) });
        const b = getRequestFingerprint({ method: 'post', url: '/messages/send', data: fd('temp-2', new Blob(['bbbb'])) });
        expect(a).not.toBe(b);
    });

    it('aynı isteğin yeniden denemesi aynı parmak izini korur', () => {
        const body = fd('temp-1', new Blob(['aaa']));
        expect(getRequestFingerprint({ method: 'post', url: '/messages/send', data: body }))
            .toBe(getRequestFingerprint({ method: 'post', url: '/messages/send', data: body }));
    });

    it('JSON gövde davranışı değişmedi', () => {
        const cfg = { method: 'post', url: '/messages/send', data: { receiver_id: 'u', content: 'ok', client_temp_id: 't1' } };
        expect(getRequestFingerprint(cfg)).toBe('post|/messages/send|' + JSON.stringify(cfg.data));
    });
});

describe('messagesAPI.sendMessage idempotency', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });

    it('client_temp_id Idempotency-Key olarak gider; aynı metinli iki mesaj farklı anahtar alır', async () => {
        const { default: api, messagesAPI } = await import('./api');
        const seen = [];
        api.defaults.adapter = async (config) => {
            seen.push(config);
            return { data: {}, status: 201, statusText: 'Created', headers: {}, config };
        };
        await messagesAPI.sendMessage({ receiver_id: 'u', content: 'aynı', type: 'text', client_temp_id: 'temp-1' });
        await messagesAPI.sendMessage({ receiver_id: 'u', content: 'aynı', type: 'text', client_temp_id: 'temp-2' });
        // Yeniden deneme: aynı kimlik = aynı anahtar
        await messagesAPI.sendMessage({ receiver_id: 'u', content: 'aynı', type: 'text', client_temp_id: 'temp-1' });
        expect(seen.map((c) => c.headers['Idempotency-Key'])).toEqual(['temp-1', 'temp-2', 'temp-1']);
        expect(seen[0].timeout).toBeGreaterThan(0);
    });

    it('dosya mesajında FormData içindeki client_temp_id anahtar olur', async () => {
        const { default: api, messagesAPI } = await import('./api');
        let cfg;
        api.defaults.adapter = async (config) => { cfg = config; return { data: {}, status: 201, statusText: 'Created', headers: {}, config }; };
        const fd = new FormData();
        fd.append('client_temp_id', 'temp-file-1');
        fd.append('file', new Blob(['x']));
        await messagesAPI.sendFile(fd);
        expect(cfg.headers['Idempotency-Key']).toBe('temp-file-1');
    });
});
