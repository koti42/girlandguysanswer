import { describe, expect, it } from 'vitest';
import { decodeCreationOptions, decodeRequestOptions, encodeCredential, fromBase64Url, isUserCancel, stripNulls, toBase64Url } from './webauthn';

describe('base64url', () => {
    it('gidiş-dönüş kayıpsız', () => {
        const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
        const encoded = toBase64Url(bytes.buffer);
        expect(encoded).not.toMatch(/[+/=]/);
        expect(new Uint8Array(fromBase64Url(encoded))).toEqual(bytes);
    });
    it('dolgusuz girdiyi kabul eder', () => {
        expect(new Uint8Array(fromBase64Url('AQI'))).toEqual(new Uint8Array([1, 2]));
    });
});

describe('stripNulls', () => {
    it('null ve undefined alanları iç içe atar, diğerlerine dokunmaz', () => {
        expect(stripNulls({ a: null, b: 0, c: { d: undefined, e: '' }, f: [null, { g: null, h: 1 }] }))
            .toEqual({ b: 0, c: { e: '' }, f: [null, { h: 1 }] });
    });
});

describe('decode/encode', () => {
    it('kayıt seçeneklerinde challenge ve user.id ArrayBuffer olur, null alanlar düşer', () => {
        const out = decodeCreationOptions({ challenge: 'AQI', user: { id: 'AwQ', name: 'x' }, authenticatorSelection: { authenticatorAttachment: null, residentKey: 'preferred' }, excludeCredentials: [{ id: 'BQY', type: 'public-key' }] });
        expect(out.publicKey.challenge).toBeInstanceOf(ArrayBuffer);
        expect(out.publicKey.user.id).toBeInstanceOf(ArrayBuffer);
        expect(out.publicKey.authenticatorSelection).toEqual({ residentKey: 'preferred' });
        expect(out.publicKey.excludeCredentials[0].id).toBeInstanceOf(ArrayBuffer);
    });
    it('giriş seçeneklerinde allowCredentials yoksa boş dizi', () => {
        const out = decodeRequestOptions({ challenge: 'AQI', rpId: 'x' });
        expect(out.publicKey.allowCredentials).toEqual([]);
    });
    it('kimlik bilgisi yalnızca var olan yanıt alanlarını kodlar', () => {
        const buf = new Uint8Array([1]).buffer;
        const enc = encodeCredential({ id: 'id', rawId: buf, type: 'public-key', response: { clientDataJSON: buf, signature: buf, authenticatorData: buf } });
        expect(enc.response).toEqual({ clientDataJSON: 'AQ', signature: 'AQ', authenticatorData: 'AQ' });
        expect(enc.response.attestationObject).toBeUndefined();
    });
});

describe('isUserCancel', () => {
    it('iptal ve abort sessiz, diğerleri hata', () => {
        expect(isUserCancel({ name: 'NotAllowedError' })).toBe(true);
        expect(isUserCancel({ name: 'AbortError' })).toBe(true);
        expect(isUserCancel({ name: 'SecurityError' })).toBe(false);
        expect(isUserCancel(null)).toBe(false);
    });
});
