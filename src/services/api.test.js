import { describe, expect, it } from 'vitest';
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
